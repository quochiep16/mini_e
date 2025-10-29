// users.service.ts
import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  private isUniqueViolation(e: any) {
    return e?.code === 'ER_DUP_ENTRY' || e?.code === '23505' || /unique/i.test(e?.message ?? '');
  }

  async create(dto: CreateUserDto): Promise<User> {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.repo.findOne({ where: { email }, withDeleted: true });
    if (exists && !exists.deletedAt) throw new ConflictException('Email đã tồn tại');

    const rounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') ?? 12);
    const pepper = this.config.get<string>('BCRYPT_PEPPER');
    const toHash = pepper ? dto.password + pepper : dto.password;
    const passwordHash = await bcrypt.hash(toHash, rounds);

    const entity = this.repo.create({
      name: dto.name.trim(),
      email,
      passwordHash,
      phone: dto.phone,
      avatarUrl: dto.avatarUrl ?? null,
      birthday: dto.birthday ?? null,
      gender: dto.gender ?? null,
      isVerified: dto.isVerified ?? false,
      role: dto.role ?? UserRole.USER,
    });

    try {
      const saved = await this.repo.save(entity);
      return this.repo.findOneByOrFail({ id: saved.id }); // không lộ passwordHash
    } catch (e: any) {
      if (this.isUniqueViolation(e)) throw new ConflictException('Email đã tồn tại');
      throw e;
    }
  }

  async findById(id: number): Promise<User> {
    // Mặc định KHÔNG trả bản ghi đã xoá mềm
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User không tồn tại');
    return user;
  }

  async findAll(q: QueryUserDto) {
    const page  = Math.max(Number(q.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(q.limit ?? 20), 1), 100);
    const qb = this.repo.createQueryBuilder('u'); // mặc định không include deleted

    // seach by name / email / phone
    if (q.search) {
      const kw = `%${q.search}%`;
      qb.andWhere('(u.name LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw)', { kw });
    }

    const sortBy    = q.sortBy ?? 'createdAt';
    const sortOrder = (q.sortOrder ?? 'DESC').toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(`u.${sortBy}`, sortOrder).skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      meta: { page, limit, total, pageCount: Math.max(Math.ceil(total / limit), 1) },
    };
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id); // nếu đã xoá mềm sẽ ném NotFound

    if ((dto as any).email) {
      (dto as any).email = String((dto as any).email).trim().toLowerCase();
    }

    if (dto.password) {
      const rounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') ?? 12);
      const pepper = this.config.get<string>('BCRYPT_PEPPER');
      const toHash = pepper ? dto.password + pepper : dto.password;
      (user as any).passwordHash = await bcrypt.hash(toHash, rounds);
      delete (dto as any).password;
    }

    Object.assign(user, dto);

    try {
      await this.repo.save(user);
      return this.findById(id);
    } catch (e: any) {
      if (this.isUniqueViolation(e)) throw new ConflictException('Email đã tồn tại');
      throw e;
    }
  }

  // 🔧 Soft delete có kiểm tra trạng thái
  async softDelete(id: number): Promise<void> {
    // Tìm cả đã xoá để biết tình trạng
    const existed = await this.repo.findOne({ where: { id }, withDeleted: true });
    if (!existed) throw new NotFoundException('User không tồn tại');

    // Nếu đã xoá mềm trước đó → coi như “không tồn tại”
    if (existed.deletedAt) throw new NotFoundException('User không tồn tại');

    const res = await this.repo.softDelete(id);
    if (!res.affected) throw new NotFoundException('User không tồn tại');
  }
  // 🔧 Restore có kiểm tra trạng thái
  async restore(id: number): Promise<void> {
    const existed = await this.repo.findOne({ where: { id }, withDeleted: true });
    if (!existed) throw new NotFoundException('User không tồn tại');
    if (!existed.deletedAt) return; // chưa bị xoá thì coi như OK idempotent

    const res = await this.repo.restore(id);
    if (!res.affected) throw new NotFoundException('User không tồn tại');
  }

  async hardDelete(id: number): Promise<void> {
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException('User không tồn tại');
  }

  async findAllDeleted(q: QueryUserDto) {
    const page  = Math.max(Number(q.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(q.limit ?? 20), 1), 100);

    const qb = this.repo.createQueryBuilder('u')
      .withDeleted()                          
      .where('u.deletedAt IS NOT NULL');       // chỉ lấy bản ghi đã xoá

    if (q.search) {
      const kw = `%${q.search}%`;
      qb.andWhere('(u.name LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw)', { kw });
    }

    // sortBy: mặc định theo thời điểm xoá gần nhất
    const sortBy    = q.sortBy ?? 'deletedAt';
    const sortOrder = (q.sortOrder ?? 'DESC').toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(`u.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      meta: { page, limit, total, pageCount: Math.max(Math.ceil(total / limit), 1) },
    };
  }
  // Mặc định: 30 ngày
  private graceDays() {
    return Number(this.config.get('ACCOUNT_DELETE_GRACE_DAYS') ?? 30);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM) // chạy 03:00 mỗi ngày
  async hardDeleteExpired() {
    const days = this.graceDays();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // xoá cứng các user đã xoá mềm trước "cutoff"
    await this.repo.createQueryBuilder()
      .delete()
      .from(User)
      .where('deletedAt IS NOT NULL AND deletedAt < :cutoff', { cutoff })
      .execute();
  }

}
