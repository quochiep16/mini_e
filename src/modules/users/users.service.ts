import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  private isUniqueViolation(e: any) {
    return e?.code === 'ER_DUP_ENTRY' || e?.code === '23505' || /unique/i.test(e?.message ?? '');
  }

  async create(dto: CreateUserDto): Promise<User> {
    const { password, email, ...rest } = dto;

    // Khuyến nghị: chuẩn hóa email về lowercase để tránh trùng do hoa/thường
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    const entity = this.repo.create({
      ...rest,
      email: normalizedEmail,
      passwordHash,
    });

    try {
      const saved = await this.repo.save(entity);
      // Không trả passwordHash (cột đã select:false)
      return this.repo.findOneByOrFail({ id: saved.id });
    } catch (e: any) {
      if (this.isUniqueViolation(e)) throw new ConflictException('Email đã tồn tại');
      throw e;
    }
  }
}
