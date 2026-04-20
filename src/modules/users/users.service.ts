import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { User } from './entities/user.entity';
import { UserRole } from './enums/user.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  private isUniqueViolation(e: any) {
    return (
      e?.code === 'ER_DUP_ENTRY' ||
      e?.code === '23505' ||
      /unique/i.test(e?.message ?? '')
    );
  }

  private normalizeEmail(email?: string): string | undefined {
    const v = (email ?? '').trim();
    return v ? v.toLowerCase() : undefined;
  }

  private normalizePhone(phone?: string): string | undefined {
    const raw = (phone ?? '').trim();
    if (!raw) return undefined;

    if (/^\+\d{8,15}$/.test(raw)) return raw;
    if (/^84\d{8,15}$/.test(raw)) return `+${raw}`;
    if (/^0\d{9,10}$/.test(raw)) return `+84${raw.slice(1)}`;

    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;

    throw new BadRequestException('Số điện thoại không hợp lệ');
  }

  private sanitizeUser<T extends Partial<User>>(user: T | null | undefined) {
    if (!user) return user;
    const { passwordHash, otp, timeOtp, ...safe } = user as any;
    return safe;
  }

  private async findActiveEntityById(id: number): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User không tồn tại');
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
        withDeleted: true,
      });
      if (exists) {
        throw new ConflictException('Email đã tồn tại');
      }
    }

    if (phone) {
      const exists = await this.repo.findOne({
        where: { phone } as any,
        withDeleted: true,
      });
      if (exists) {
        throw new ConflictException('Số điện thoại đã tồn tại');
      }
    }

    const rounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') ?? 12);
    const pepper = this.config.get<string>('BCRYPT_PEPPER');
    const toHash = pepper ? dto.password + pepper : dto.password;
    const passwordHash = await bcrypt.hash(toHash, rounds);

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

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.findActiveEntityById(id);

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
          id: Not(id),
        } as any,
        withDeleted: true,
      });

      if (existed) {
        throw new ConflictException('Email đã tồn tại');
      }
    }

    if (nextPhone && nextPhone !== user.phone) {
      const existed = await this.repo.findOne({
        where: {
          phone: nextPhone,
          id: Not(id),
        } as any,
        withDeleted: true,
      });

      if (existed) {
        throw new ConflictException('Số điện thoại đã tồn tại');
      }
    }

    if (dto.password) {
      const rounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') ?? 12);
      const pepper = this.config.get<string>('BCRYPT_PEPPER');
      const toHash = pepper ? dto.password + pepper : dto.password;
      user.passwordHash = await bcrypt.hash(toHash, rounds);
    }

    if (dto.name !== undefined) user.name = dto.name.trim();
    if ((dto as any).email !== undefined) user.email = nextEmail;
    if ((dto as any).phone !== undefined) user.phone = nextPhone;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl?.trim() || undefined;
    if (dto.birthday !== undefined) user.birthday = dto.birthday ?? undefined;
    if (dto.gender !== undefined) user.gender = dto.gender ?? undefined;
    if (dto.isVerified !== undefined) user.isVerified = dto.isVerified;
    if (dto.role !== undefined) user.role = dto.role;

    try {
      await this.repo.save(user);
      return this.findById(id);
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

  async softDelete(id: number): Promise<void> {
    const existed = await this.repo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!existed) {
      throw new NotFoundException('User không tồn tại');
    }

    if (existed.deletedAt) {
      throw new NotFoundException('User không tồn tại');
    }

    const res = await this.repo.softDelete(id);
    if (!res.affected) {
      throw new NotFoundException('User không tồn tại');
    }
  }

  async restore(id: number): Promise<void> {
    const existed = await this.repo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!existed) {
      throw new NotFoundException('User không tồn tại');
    }

    if (!existed.deletedAt) return;

    const res = await this.repo.restore(id);
    if (!res.affected) {
      throw new NotFoundException('User không tồn tại');
    }
  }

  async hardDelete(id: number): Promise<void> {
    const existed = await this.repo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!existed) {
      throw new NotFoundException('User không tồn tại');
    }

    if (!existed.deletedAt) {
      throw new BadRequestException(
        'Chỉ được xóa cứng user đã xóa mềm trước đó',
      );
    }

    try {
      const res = await this.repo.delete(id);
      if (!res.affected) {
        throw new NotFoundException('User không tồn tại');
      }
    } catch (e: any) {
      throw new BadRequestException(
        'Không thể xóa cứng user vì còn dữ liệu liên quan',
      );
    }
  }

  async findAllDeleted(q: QueryUserDto) {
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
      'deletedAt',
      'createdAt',
      'updatedAt',
      'id',
      'name',
      'email',
      'phone',
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

  private graceDays() {
    return Number(this.config.get('ACCOUNT_DELETE_GRACE_DAYS') ?? 30);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async hardDeleteExpired() {
    const days = this.graceDays();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const expiredUsers = await this.repo
      .createQueryBuilder('u')
      .withDeleted()
      .where('u.deletedAt IS NOT NULL')
      .andWhere('u.deletedAt < :cutoff', { cutoff })
      .getMany();

    for (const user of expiredUsers) {
      try {
        await this.repo.delete(user.id);
      } catch {
        //
      }
    }
  }
}