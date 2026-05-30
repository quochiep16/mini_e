import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, DeepPartial, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

import { User } from './entities/user.entity';
import { UserRole } from './enums/user.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { EmailService } from '../email/email.service';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
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

  private async comparePassword(rawPassword: string, passwordHash: string) {
    const pepper = this.config.get<string>('BCRYPT_PEPPER');
    const toCompare = pepper ? rawPassword + pepper : rawPassword;

    return bcrypt.compare(toCompare, passwordHash);
  }

  private generateOtp(length = 6) {
    let code = '';

    for (let i = 0; i < length; i += 1) {
      code += Math.floor(Math.random() * 10).toString();
    }

    return code;
  }

  private async hashOtp(code: string) {
    return bcrypt.hash(code, 10);
  }

  private async compareOtp(rawCode: string, hashedCode: string) {
    if (rawCode === hashedCode) {
      return true;
    }

    return bcrypt.compare(rawCode, hashedCode);
  }

  private isOtpExpired(timeOtp?: Date | null, minutes = 5) {
    if (!timeOtp) return true;

    const createdAt = new Date(timeOtp).getTime();
    const expiresAt = createdAt + minutes * 60 * 1000;

    return Date.now() > expiresAt;
  }

  private maskEmail(email: string) {
    const [name, domain] = email.split('@');

    if (!name || !domain) return email;

    if (name.length <= 2) {
      return `${name[0] ?? '*'}***@${domain}`;
    }

    return `${name.slice(0, 2)}***@${domain}`;
  }

  private sanitizeUser<T extends Partial<User>>(user: T | null | undefined) {
    if (!user) return user;

    const { passwordHash, otp, timeOtp, systemCode, ...safe } = user as any;

    return safe;
  }

  private isRootAdmin(user: Partial<User> | null | undefined) {
    return (
      !!user &&
      (user.isSystem === true ||
        user.systemCode === this.ROOT_ADMIN_CODE ||
        user.email === this.ROOT_ADMIN_EMAIL)
    );
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

  private async softDeleteUserShopAndProducts(
    userId: number,
    deletedAt: Date,
    queryRunner: any,
  ): Promise<void> {
    const shops = await queryRunner.query(
      `
      SELECT id
      FROM shops
      WHERE user_id = ?
        AND deleted_at IS NULL
      `,
      [userId],
    );

    if (!shops.length) {
      return;
    }

    const shopIds = shops.map((shop: any) => Number(shop.id));
    const shopPlaceholders = shopIds.map(() => '?').join(',');

    await queryRunner.query(
      `
      UPDATE products
      SET deleted_at = ?
      WHERE shop_id IN (${shopPlaceholders})
        AND deleted_at IS NULL
      `,
      [deletedAt, ...shopIds],
    );

    await queryRunner.query(
      `
      UPDATE shops
      SET deleted_at = ?
      WHERE id IN (${shopPlaceholders})
        AND deleted_at IS NULL
      `,
      [deletedAt, ...shopIds],
    );
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
      const existsPhone = await this.repo.findOne({
        where: { phone } as any,
        withDeleted: true,
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
      'role',
      'isVerified',
      'isSystem',
      'lastLoginAt',
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
          id: Not(user.id),
        } as any,
        withDeleted: true,
      });

      if (existed) {
        throw new ConflictException('Số điện thoại đã tồn tại');
      }
    }

    if (allowAdminFields && (dto as UpdateUserDto).password) {
      user.passwordHash = await this.hashPassword((dto as UpdateUserDto).password!);
    }

    if (dto.name !== undefined) {
      user.name = dto.name.trim();
    }

    if ((dto as any).email !== undefined) {
      (user as any).email = nextEmail ?? null;
    }

    if ((dto as any).phone !== undefined) {
      (user as any).phone = nextPhone ?? null;
    }

    if (dto.avatarUrl !== undefined) {
      (user as any).avatarUrl = dto.avatarUrl?.trim() || null;
    }

    if (dto.birthday !== undefined) {
      (user as any).birthday = dto.birthday ?? null;
    }

    if (dto.gender !== undefined) {
      (user as any).gender = dto.gender ?? null;
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

  async softDelete(id: number): Promise<void> {
    await this.assertNotRootAdminTarget(id);

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

    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const now = new Date();

      await this.softDeleteUserShopAndProducts(id, now, queryRunner);

      const result = await queryRunner.manager
        .createQueryBuilder()
        .update(User)
        .set({
          deletedAt: now,
        } as any)
        .where('id = :id', { id })
        .andWhere('deletedAt IS NULL')
        .execute();

      if (!result.affected) {
        throw new NotFoundException('User không tồn tại');
      }

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();

      if (
        e instanceof NotFoundException ||
        e instanceof BadRequestException ||
        e instanceof ForbiddenException
      ) {
        throw e;
      }

      throw new BadRequestException('Không thể xóa mềm user');
    } finally {
      await queryRunner.release();
    }
  }

  async restore(id: number): Promise<void> {
    await this.assertNotRootAdminTarget(id);

    const existed = await this.repo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!existed) {
      throw new NotFoundException('User không tồn tại');
    }

    if (!existed.deletedAt) {
      return;
    }

    const res = await this.repo.restore(id);

    if (!res.affected) {
      throw new NotFoundException('User không tồn tại');
    }
  }

  async hardDelete(id: number): Promise<void> {
    await this.assertNotRootAdminTarget(id);

    const existed = await this.repo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!existed) {
      throw new NotFoundException('User không tồn tại');
    }

    if (!existed.deletedAt) {
      throw new BadRequestException('Chỉ được xóa cứng user đã xóa mềm trước đó');
    }

    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const shops = await queryRunner.query(
        `
        SELECT id
        FROM shops
        WHERE user_id = ?
        `,
        [id],
      );

      const shopIds = shops.map((item: any) => Number(item.id));
      const shopPlaceholders = shopIds.map(() => '?').join(',');

      let productIds: number[] = [];
      let variantIds: number[] = [];

      if (shopIds.length > 0) {
        const products = await queryRunner.query(
          `
          SELECT id
          FROM products
          WHERE shop_id IN (${shopPlaceholders})
          `,
          shopIds,
        );

        productIds = products.map((item: any) => Number(item.id));
      }

      const productPlaceholders = productIds.map(() => '?').join(',');

      if (productIds.length > 0) {
        const variants = await queryRunner.query(
          `
          SELECT id
          FROM product_variants
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );

        variantIds = variants.map((item: any) => Number(item.id));
      }

      const variantPlaceholders = variantIds.map(() => '?').join(',');

      await queryRunner.query(
        `
        UPDATE orders
        SET user_id = NULL
        WHERE user_id = ?
        `,
        [id],
      );

      await queryRunner.query(
        `
        UPDATE product_reviews
        SET user_id = NULL
        WHERE user_id = ?
        `,
        [id],
      );

      if (productIds.length > 0) {
        await queryRunner.query(
          `
          UPDATE product_reviews
          SET product_id = NULL
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );
      }

      await queryRunner.query(
        `
        DELETE ci
        FROM cart_items ci
        INNER JOIN carts c ON c.id = ci.cart_id
        WHERE c.user_id = ?
        `,
        [id],
      );

      await queryRunner.query(
        `
        DELETE FROM carts
        WHERE user_id = ?
        `,
        [id],
      );

      if (productIds.length > 0) {
        await queryRunner.query(
          `
          DELETE FROM cart_items
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );
      }

      if (variantIds.length > 0) {
        await queryRunner.query(
          `
          DELETE FROM cart_items
          WHERE variant_id IN (${variantPlaceholders})
          `,
          variantIds,
        );
      }

      await queryRunner.query(
        `
        DELETE FROM user_addresses
        WHERE user_id = ?
        `,
        [id],
      );

      await queryRunner.query(
        `
        DELETE FROM product_favorites
        WHERE user_id = ?
        `,
        [id],
      );

      await queryRunner.query(
        `
        DELETE FROM product_interactions
        WHERE user_id = ?
        `,
        [id],
      );

      await queryRunner.query(
        `
        DELETE FROM user_category_preferences
        WHERE user_id = ?
        `,
        [id],
      );

      await queryRunner.query(
        `
        DELETE FROM user_tag_preferences
        WHERE user_id = ?
        `,
        [id],
      );

      await queryRunner.query(
        `
        DELETE FROM user_product_preferences
        WHERE user_id = ?
        `,
        [id],
      );

      await queryRunner.query(
        `
        DELETE FROM payment_sessions
        WHERE user_id = ?
        `,
        [id],
      );

      if (productIds.length > 0) {
        await queryRunner.query(
          `
          DELETE FROM product_favorites
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );

        await queryRunner.query(
          `
          DELETE FROM product_interactions
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );

        await queryRunner.query(
          `
          DELETE FROM user_product_preferences
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );

        await queryRunner.query(
          `
          DELETE FROM product_tags
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );

        await queryRunner.query(
          `
          DELETE FROM product_trending
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );

        await queryRunner.query(
          `
          DELETE FROM product_variants
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );

        await queryRunner.query(
          `
          DELETE FROM product_images
          WHERE product_id IN (${productPlaceholders})
          `,
          productIds,
        );

        await queryRunner.query(
          `
          DELETE FROM products
          WHERE id IN (${productPlaceholders})
          `,
          productIds,
        );
      }

      if (shopIds.length > 0) {
        await queryRunner.query(
          `
          DELETE FROM product_interactions
          WHERE shop_id IN (${shopPlaceholders})
          `,
          shopIds,
        );

        await queryRunner.query(
          `
          DELETE FROM shop_stats
          WHERE shop_id IN (${shopPlaceholders})
          `,
          shopIds,
        );

        await queryRunner.query(
          `
          DELETE FROM shops
          WHERE id IN (${shopPlaceholders})
          `,
          shopIds,
        );
      }

      await queryRunner.query(
        `
        DELETE FROM users
        WHERE id = ?
        `,
        [id],
      );

      await queryRunner.commitTransaction();
    } catch (e: any) {
      await queryRunner.rollbackTransaction();

      const msg = String(e?.message ?? '');

      if (
        msg.includes('cannot be null') ||
        msg.includes('Column') ||
        msg.includes('foreign key') ||
        msg.includes('constraint')
      ) {
        throw new BadRequestException(
          'Không thể xóa cứng user vì orders/product_reviews hoặc khóa ngoại chưa cho phép SET NULL. Cần sửa migration các cột user_id/product_id sang nullable và ON DELETE SET NULL.',
        );
      }

      throw new BadRequestException(
        'Không thể xóa cứng user vì còn dữ liệu liên quan',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async requestChangePasswordOtp(userId: number) {
    const user = await this.repo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User không tồn tại');
    }

    if (!user.email) {
      throw new BadRequestException(
        'Tài khoản chưa có email nên không thể gửi OTP đổi mật khẩu',
      );
    }

    const otp = this.generateOtp(6);
    const hashedOtp = await this.hashOtp(otp);

    user.otp = hashedOtp;
    user.timeOtp = new Date();

    await this.repo.save(user);

    await this.emailService.sendChangePasswordCode(user.email, otp);

    return {
      sent: true,
      via: 'email',
      target: this.maskEmail(user.email),
      expiresInMinutes: 5,
      message: 'Mã OTP đổi mật khẩu đã được gửi về email của bạn',
    };
  }

  async changeMyPassword(userId: number, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const user = await this.repo.findOne({
      where: { id: userId },
      select: [
        'id',
        'email',
        'passwordHash',
        'otp',
        'timeOtp',
        'deletedAt',
      ] as any,
    });

    if (!user) {
      throw new NotFoundException('User không tồn tại');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Tài khoản chưa có mật khẩu');
    }

    const isCurrentPasswordValid = await this.comparePassword(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }

    const isSamePassword = await this.comparePassword(
      dto.newPassword,
      user.passwordHash,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'Mật khẩu mới không được trùng với mật khẩu hiện tại',
      );
    }

    if (!user.otp || !user.timeOtp) {
      throw new BadRequestException(
        'Vui lòng yêu cầu gửi OTP trước khi đổi mật khẩu',
      );
    }

    if (this.isOtpExpired(user.timeOtp, 5)) {
      user.otp = null as any;
      user.timeOtp = null as any;
      await this.repo.save(user);

      throw new BadRequestException('OTP đã hết hạn, vui lòng yêu cầu mã mới');
    }

    const isOtpValid = await this.compareOtp(dto.otp, user.otp);

    if (!isOtpValid) {
      throw new BadRequestException('OTP không đúng');
    }

    user.passwordHash = await this.hashPassword(dto.newPassword);
    user.otp = null as any;
    user.timeOtp = null as any;

    await this.repo.save(user);

    return {
      changed: true,
      message: 'Đổi mật khẩu thành công',
    };
  }
}