import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

import { User } from './entities/user.entity';
import { UserRole } from './enums/user.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { QueryUserDto } from './dto/query-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  private get ROOT_ADMIN_EMAIL(): string {
    return this.config.get<string>('ROOT_ADMIN_EMAIL') || 'admin123@admin.com';
  }

  private get ROOT_ADMIN_CODE(): string {
    return this.config.get<string>('ROOT_ADMIN_CODE') || 'ROOT_ADMIN';
  }

  private isUniqueViolation(e: any) {
    return (
      e?.code === 'ER_DUP_ENTRY' ||
      e?.code === '23505' ||
      /unique/i.test(e?.message ?? '')
    );
  }

  private normalizeEmail(email?: string | null) {
    const v = (email ?? '').trim();
    return v ? v.toLowerCase() : undefined;
  }

  private normalizePhone(phone?: string | null) {
    const raw = (phone ?? '').trim();
    if (!raw) return undefined;

    if (/^\+\d{8,15}$/.test(raw)) return raw;
    if (/^84\d{8,15}$/.test(raw)) return `+${raw}`;
    if (/^0\d{9,10}$/.test(raw)) return `+84${raw.slice(1)}`;

    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;

    throw new BadRequestException('Số điện thoại không hợp lệ');
  }

  private async hashPassword(password: string) {
    const rounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') ?? 12);
    const pepper = this.config.get<string>('BCRYPT_PEPPER');
    const toHash = pepper ? password + pepper : password;
    return bcrypt.hash(toHash, rounds);
  }

  private sanitizeUser<T extends Partial<User>>(user: T | null | undefined) {
    if (!user) return user;

    const {
      passwordHash,
      otp,
      timeOtp,
      systemCode,
      ...safe
    } = user as any;

    return safe;
  }

  private isRootAdmin(user: Partial<User> | null | undefined) {
    return !!user && (
      user.isSystem === true ||
      user.systemCode === this.ROOT_ADMIN_CODE ||
      user.email === this.ROOT_ADMIN_EMAIL
    );
  }

  private makeDeactivatedEmail(id: number, now: Date) {
    // Cố tình không có @ để không qua IsEmail ở login nếu người dùng nhập lại.
    return `deleted_user_${id}_${now.getTime()}`;
  }

  private makeDeactivatedPhone(id: number, now: Date) {
    // Có chữ D nên không qua regex phone: /^\+?[0-9]{8,15}$/.
    // Giữ tối đa 20 ký tự để phù hợp cột phone varchar(20).
    return `D${id}${String(now.getTime()).slice(-9)}`.slice(0, 20);
  }

  private async findActiveEntityById(id: number): Promise<User> {
    const user = await this.repo.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User không tồn tại');
    }

    return user;
  }

  private async assertNotRootAdminTarget(id: number) {
    const user = await this.repo.findOne({
      where: { id },
      withDeleted: true,
      select: [
        'id',
        'email',
        'role',
        'isSystem',
        'systemCode',
        'deletedAt',
      ] as any,
    });

    if (!user) {
      throw new NotFoundException('User không tồn tại');
    }

    if (this.isRootAdmin(user)) {
      throw new ForbiddenException('Không được chỉnh sửa tài khoản admin gốc');
    }

    return user;
  }

  async create(dto: CreateUserDto) {
    const email = this.normalizeEmail(dto.email);
    const phone = this.normalizePhone(dto.phone);

    if (!email && !phone) {
      throw new BadRequestException('Phải nhập email hoặc số điện thoại');
    }

    if (email) {
      const exists = await this.repo.findOne({
        where: { email } as any,
      });

      if (exists) {
        throw new ConflictException('Email đã tồn tại');
      }
    }

    if (phone) {
      const existsPhone = await this.repo.findOne({
        where: { phone } as any,
      });

      if (existsPhone) {
        throw new ConflictException('Số điện thoại đã tồn tại');
      }
    }

    const passwordHash = await this.hashPassword(dto.password);

    const data: DeepPartial<User> = {
      name: dto.name.trim(),
      email,
      phone,
      passwordHash,
      avatarUrl: dto.avatarUrl?.trim() || undefined,
      birthday: dto.birthday ?? undefined,
      gender: dto.gender ?? undefined,
      isVerified: dto.isVerified ?? false,
      role: dto.role ?? UserRole.USER,
      isSystem: false,
      systemCode: undefined,
    };

    const entity = this.repo.create(data);

    try {
      const saved = await this.repo.save(entity);
      return this.findById(saved.id);
    } catch (e: any) {
      if (this.isUniqueViolation(e)) {
        const msg = String(e?.message ?? '');

        if (/phone/i.test(msg)) {
          throw new ConflictException('Số điện thoại đã tồn tại');
        }

        if (/system_code/i.test(msg)) {
          throw new ConflictException('systemCode đã tồn tại');
        }

        throw new ConflictException('Email đã tồn tại');
      }

      throw e;
    }
  }

  async findById(id: number) {
    const user = await this.findActiveEntityById(id);
    return this.sanitizeUser(user);
  }

  async findAll(q: QueryUserDto) {
    const page = Math.max(Number(q.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(q.limit ?? 20), 1), 100);

    const qb = this.repo.createQueryBuilder('u');

    if (q.search) {
      const kw = `%${q.search}%`;
      qb.andWhere('(u.name LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw)', {
        kw,
      });
    }

    const sortBy = q.sortBy ?? 'createdAt';
    const rawSortOrder = String(q.sortOrder ?? 'DESC').toUpperCase();
    const sortOrder: 'ASC' | 'DESC' = rawSortOrder === 'ASC' ? 'ASC' : 'DESC';

    const allowSort = new Set([
      'id',
      'name',
      'email',
      'phone',
      'role',
      'isVerified',
      'isSystem',
      'createdAt',
      'updatedAt',
      'lastLoginAt',
    ]);

    const safeSortBy = allowSort.has(sortBy) ? sortBy : 'createdAt';

    qb.orderBy(`u.${safeSortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => this.sanitizeUser(item)),
      meta: {
        page,
        limit,
        total,
        pageCount: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  async findAllDeactivated(q: QueryUserDto) {
    const page = Math.max(Number(q.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(q.limit ?? 20), 1), 100);

    const qb = this.repo
      .createQueryBuilder('u')
      .withDeleted()
      .where('u.deletedAt IS NOT NULL');

    if (q.search) {
      const kw = `%${q.search}%`;
      qb.andWhere('(u.name LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw)', {
        kw,
      });
    }

    const sortBy = q.sortBy ?? 'deletedAt';
    const rawSortOrder = String(q.sortOrder ?? 'DESC').toUpperCase();
    const sortOrder: 'ASC' | 'DESC' = rawSortOrder === 'ASC' ? 'ASC' : 'DESC';

    const allowSort = new Set([
      'id',
      'name',
      'email',
      'phone',
      'role',
      'isVerified',
      'isSystem',
      'createdAt',
      'updatedAt',
      'lastLoginAt',
      'deletedAt',
    ]);

    const safeSortBy = allowSort.has(sortBy) ? sortBy : 'deletedAt';

    qb.orderBy(`u.${safeSortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => this.sanitizeUser(item)),
      meta: {
        page,
        limit,
        total,
        pageCount: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  async updateMe(id: number, dto: UpdateMeDto) {
    await this.assertNotRootAdminTarget(id);

    const user = await this.findActiveEntityById(id);

    return this.applyUpdate(user, dto, false);
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.assertNotRootAdminTarget(id);

    const user = await this.findActiveEntityById(id);

    return this.applyUpdate(user, dto, true);
  }

  private async applyUpdate(
    user: User,
    dto: UpdateUserDto | UpdateMeDto,
    allowAdminFields: boolean,
  ) {
    let nextEmail = user.email;
    let nextPhone = user.phone;

    if ((dto as any).email !== undefined) {
      nextEmail = this.normalizeEmail((dto as any).email);
    }

    if ((dto as any).phone !== undefined) {
      nextPhone = this.normalizePhone((dto as any).phone);
    }

    if (!nextEmail && !nextPhone) {
      throw new BadRequestException('User phải có ít nhất email hoặc số điện thoại');
    }

    if (nextEmail && nextEmail !== user.email) {
      const existed = await this.repo.findOne({
        where: {
          email: nextEmail,
          id: Not(user.id),
        } as any,
      });

      if (existed) {
        throw new ConflictException('Email đã tồn tại');
      }
    }

    if (nextPhone && nextPhone !== user.phone) {
      const existed = await this.repo.findOne({
        where: {
          phone: nextPhone,
          id: Not(user.id),
        } as any,
      });

      if (existed) {
        throw new ConflictException('Số điện thoại đã tồn tại');
      }
    }

    const password = (dto as UpdateUserDto).password;

    if (allowAdminFields && password) {
      user.passwordHash = await this.hashPassword(password);
    }

    if (dto.name !== undefined) {
      user.name = dto.name.trim();
    }

    if ((dto as any).email !== undefined) {
      user.email = nextEmail;
    }

    if ((dto as any).phone !== undefined) {
      user.phone = nextPhone;
    }

    if (dto.avatarUrl !== undefined) {
      user.avatarUrl = dto.avatarUrl?.trim() ? dto.avatarUrl.trim() : (null as any);
    }

    if (dto.birthday !== undefined) {
      user.birthday = dto.birthday ?? (null as any);
    }

    if (dto.gender !== undefined) {
      user.gender = dto.gender ?? (null as any);
    }

    if (allowAdminFields) {
      const adminDto = dto as UpdateUserDto;

      if (adminDto.isVerified !== undefined) {
        user.isVerified = adminDto.isVerified;
      }

      if (adminDto.role !== undefined) {
        user.role = adminDto.role;
      }
    }

    try {
      await this.repo.save(user);
      return this.findById(user.id);
    } catch (e: any) {
      if (this.isUniqueViolation(e)) {
        const msg = String(e?.message ?? '');

        if (/phone/i.test(msg)) {
          throw new ConflictException('Số điện thoại đã tồn tại');
        }

        throw new ConflictException('Email đã tồn tại');
      }

      throw e;
    }
  }

  async deactivate(id: number): Promise<void> {
    await this.assertNotRootAdminTarget(id);

    const user = await this.findActiveEntityById(id);

    const now = new Date();
    const randomPassword = `deactivated_${id}_${now.getTime()}_${Math.random()}`;

    user.name = 'Người dùng đã xóa';
    user.email = this.makeDeactivatedEmail(id, now);
    user.phone = this.makeDeactivatedPhone(id, now);
    user.passwordHash = await this.hashPassword(randomPassword);
    user.avatarUrl = null as any;
    user.birthday = null as any;
    user.gender = null as any;
    user.otp = null as any;
    user.timeOtp = null as any;
    user.lastLoginAt = null as any;
    user.isVerified = false;
    user.deletedAt = now;

    try {
      await this.repo.save(user);
    } catch (e: any) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException('Không thể vô hiệu hóa user do trùng dữ liệu');
      }

      throw e;
    }
  }
}