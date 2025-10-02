import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { User, UserRole } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly emailSvc: EmailService,
  ) {}

  // ========= Helpers =========
  private get pepper() {
    return this.config.get<string>('BCRYPT_PEPPER');
  }
  private get otpWindowMinutes() {
    return Number(this.config.get('OTP_WINDOW_MINUTES') ?? 5);
  }
  private get otpResendCooldownSec() {
    return Number(this.config.get('OTP_RESEND_COOLDOWN_SECONDS') ?? 60);
  }

  private async hashPassword(raw: string) {
    const rounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') ?? 12);
    const toHash = this.pepper ? raw + this.pepper : raw;
    return bcrypt.hash(toHash, rounds);
  }

  private async comparePassword(raw: string, hash: string) {
    const toCompare = this.pepper ? raw + this.pepper : raw;
    return bcrypt.compare(toCompare, hash);
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
  }

  private async generateTokens(user: User) {
    const atSecret = this.config.get<string>('ACCESS_TOKEN_SECRET', 'change_me');
    const atExpires = this.config.get<string>('ACCESS_TOKEN_EXPIRES', '15m');
    const rtSecret = this.config.get<string>('REFRESH_TOKEN_SECRET', 'change_me_too');
    const rtExpires = this.config.get<string>('REFRESH_TOKEN_EXPIRES', '7d');

    const payload = { sub: user.id, email: user.email, role: user.role };

    const [access_token, refresh_token] = await Promise.all([
      this.jwt.signAsync(payload, { secret: atSecret, expiresIn: atExpires }),
      this.jwt.signAsync({ sub: user.id }, { secret: rtSecret, expiresIn: rtExpires }),
    ]);

    return { access_token, refresh_token };
  }

  private async generateAccessToken(user: User) {
    const atSecret = this.config.get<string>('ACCESS_TOKEN_SECRET', 'change_me');
    const atExpires = this.config.get<string>('ACCESS_TOKEN_EXPIRES', '15m');
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwt.signAsync(payload, { secret: atSecret, expiresIn: atExpires });
  }

  private async validateUser(emailRaw: string, password: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    const ok = await this.comparePassword(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    return user;
  }

  // ========= Register =========
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('Email đã tồn tại');
    }

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('confirmPassword phải trùng với password');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = this.usersRepo.create({
      name: dto.name.trim(),
      email,
      passwordHash,
      role: UserRole.USER,
      isVerified: false,
    });

    try {
      const saved = await this.usersRepo.save(user);
      return {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        role: saved.role,
        isVerified: saved.isVerified,
        createdAt: saved.createdAt,
      };
    } catch (err: any) {
      const code = err?.code ?? err?.errno;
      if (code === 'ER_DUP_ENTRY' || code === 1062 || code === '23505') {
        throw new ConflictException('Email đã tồn tại');
      }
      throw err;
    }
  }

  // ========= Login =========
  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);

    // cập nhật lastLoginAt (không chặn luồng nếu lỗi)
    this.usersRepo.update({ id: user.id }, { lastLoginAt: new Date() }).catch(() => void 0);

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  // ========= Refresh (KHÔNG rotate refresh token) =========
  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Thiếu refresh token');
    }

    const secret = this.config.get<string>('REFRESH_TOKEN_SECRET', 'change_me');
    let decoded: any;
    try {
      decoded = await this.jwt.verifyAsync(refreshToken, { secret });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    const user = await this.usersRepo.findOne({ where: { id: decoded.sub } });
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy người dùng');
    }

    const access_token = await this.generateAccessToken(user);
    return {
      access_token, // chỉ cấp mới access token
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  // ========= Forgot Password (request OTP) =========
  async requestPasswordReset(dto: RequestResetDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersRepo.findOne({ where: { email } });

    if (!user) {
      // theo yêu cầu của bạn: báo rõ ràng
      throw new NotFoundException('Email không tồn tại');
    }

    // cooldown resend
    if (user.timeOtp) {
      const now = Date.now();
      const lastSend = user.timeOtp.getTime() - this.otpWindowMinutes * 60 * 1000;
      if ((now - lastSend) / 1000 < this.otpResendCooldownSec) {
        const remain = Math.ceil(this.otpResendCooldownSec - (now - lastSend) / 1000);
        throw new BadRequestException(`Vui lòng đợi ${remain}s trước khi yêu cầu lại OTP`);
      }
    }

    const otp = this.generateOtp();
    const otpHash = await this.hashPassword(otp);

    user.otp = otpHash as any;
    user.timeOtp = new Date(Date.now() + this.otpWindowMinutes * 60 * 1000);
    await this.usersRepo.save(user);

    await this.emailSvc.sendPasswordResetCode(user.email, otp);

    // DEV: trả OTP để test nhanh (khi prod có thể bỏ)
    return { email: user.email, otp, expiresAt: user.timeOtp };
  }

  // ========= Reset Password (verify OTP & set new password) =========
  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect(['u.otp', 'u.passwordHash'])
      .where('u.email = :email', { email })
      .getOne();

    if (!user) throw new NotFoundException('Email không tồn tại');

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('confirmPassword phải trùng với password');
    }

    if (!user.timeOtp || user.timeOtp.getTime() < Date.now()) {
      throw new BadRequestException('OTP đã hết hạn, vui lòng yêu cầu lại');
    }
    if (!user.otp) {
      throw new BadRequestException('OTP không hợp lệ, vui lòng yêu cầu lại');
    }

    const ok = await this.comparePassword(dto.otp, user.otp);
    if (!ok) throw new BadRequestException('OTP không đúng');

    const newHash = await this.hashPassword(dto.password);
    user.passwordHash = newHash as any;
    user.otp = null as any;
    user.timeOtp = null as any;
    await this.usersRepo.save(user);

    return { reset: true };
  }

  // ========= Request Verify via access_token (no email in body) =========
  async requestVerifyForUser(userId: number) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    if (user.isVerified) {
      return { email: user.email, isVerified: true };
    }

    // cooldown
    if (user.timeOtp) {
      const now = Date.now();
      const lastSend = user.timeOtp.getTime() - this.otpWindowMinutes * 60 * 1000;
      if ((now - lastSend) / 1000 < this.otpResendCooldownSec) {
        const remain = Math.ceil(this.otpResendCooldownSec - (now - lastSend) / 1000);
        throw new BadRequestException(`Vui lòng đợi ${remain}s trước khi yêu cầu lại OTP`);
      }
    }

    const otp = this.generateOtp();
    const otpHash = await this.hashPassword(otp);

    user.otp = otpHash as any;
    user.timeOtp = new Date(Date.now() + this.otpWindowMinutes * 60 * 1000);
    await this.usersRepo.save(user);

    await this.emailSvc.sendActivationCode(user.email, otp);

    // DEV: trả OTP để test nhanh (khi prod có thể bỏ)
    return { email: user.email, otp, expiresAt: user.timeOtp };
  }

  // ========= Verify Account via access_token =========
  async verifyAccountForUser(userId: number, otpInput: string) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect(['u.otp'])
      .where('u.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    if (user.isVerified) {
      return { email: user.email, isVerified: true };
    }

    if (!user.timeOtp || user.timeOtp.getTime() < Date.now()) {
      throw new BadRequestException('OTP đã hết hạn, vui lòng yêu cầu lại');
    }
    if (!user.otp) {
      throw new BadRequestException('OTP không hợp lệ, vui lòng yêu cầu lại');
    }

    const ok = await this.comparePassword(otpInput, user.otp);
    if (!ok) throw new BadRequestException('OTP không đúng');

    user.isVerified = true;
    user.otp = null as any;
    user.timeOtp = null as any;
    await this.usersRepo.save(user);

    return { verified: true };
  }
}
