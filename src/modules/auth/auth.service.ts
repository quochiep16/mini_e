import { Injectable, ConflictException, BadRequestException , UnauthorizedException} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { User, UserRole } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}
  // Xác thực user với email và password
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
    // kiểm tra mật khẩu
    const pepper = this.config.get<string>('BCRYPT_PEPPER');
    const toCompare = pepper ? password + pepper : password;
    const ok = await bcrypt.compare(toCompare, user.passwordHash);
    if (!ok) {
    throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    return user;
  }

  // Tạo access token và refresh token
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

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    // cập nhật lastLoginAt (không chờ)
    this.usersRepo.update({ id: user.id }, { lastLoginAt: new Date() }).catch(() => void 0);

    const tokens = await this.generateTokens(user);

      return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      },
    }
  }
  // Đăng ký tài khoản
  async register(dto: RegisterDto) {
    // B1: kiểm tra email đã tồn tại chưa
    const email = dto.email.trim().toLowerCase();
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('Email đã tồn tại');
    }
    // B2: kiểm tra confirmPassword
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('confirmPassword phải trùng với password');
    }
    // B3: hash password  
    const rounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') ?? 12);
    const pepper = this.config.get<string>('BCRYPT_PEPPER');
    const toHash = pepper ? dto.password + pepper : dto.password;
    const passwordHash = await bcrypt.hash(toHash, rounds);
    // B4: lưu user vào DB
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
      if (err?.code === 'ER_DUP_ENTRY' || err?.code === '23505') {
        throw new ConflictException('Email đã tồn tại');
      }
      throw err;
    }
  }
}
