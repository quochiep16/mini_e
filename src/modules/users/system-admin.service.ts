import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

import { User } from './entities/user.entity';
import { UserRole } from './enums/user.enum';

@Injectable()
export class SystemAdminService implements OnApplicationBootstrap {
  private readonly ROOT_EMAIL: string;
  private readonly ROOT_PASSWORD: string;
  private readonly ROOT_CODE: string;

  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
  ) {
    this.ROOT_EMAIL =
      this.config.get<string>('ROOT_ADMIN_EMAIL') || 'admin123@admin.com';

    this.ROOT_PASSWORD =
      this.config.get<string>('ROOT_ADMIN_PASSWORD') || '@Admin123';

    this.ROOT_CODE =
      this.config.get<string>('ROOT_ADMIN_CODE') || 'ROOT_ADMIN';
  }

  async onApplicationBootstrap() {
    await this.ensureRootAdmin();
  }

  private async hashPassword(password: string) {
    const rounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') ?? 12);
    const pepper = this.config.get<string>('BCRYPT_PEPPER');
    const toHash = pepper ? password + pepper : password;
    return bcrypt.hash(toHash, rounds);
  }

  async ensureRootAdmin() {
    const existed = await this.repo.findOne({
      where: [
        { systemCode: this.ROOT_CODE } as any,
        { email: this.ROOT_EMAIL } as any,
      ],
      withDeleted: true,
      select: [
        'id',
        'email',
        'deletedAt',
        'systemCode',
        'isSystem',
        'role',
        'isVerified',
      ] as any,
    });

    const passwordHash = await this.hashPassword(this.ROOT_PASSWORD);

    if (!existed) {
      const user = this.repo.create({
        name: 'Root Admin',
        email: this.ROOT_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        isVerified: true,
        isSystem: true,
        systemCode: this.ROOT_CODE,
        phone: undefined,
        avatarUrl: undefined,
        birthday: undefined,
        gender: undefined,
        otp: undefined,
        timeOtp: undefined,
      });

      await this.repo.save(user);
      return;
    }

    if (existed.deletedAt) {
      await this.repo.restore(existed.id);
    }

    await this.repo.update(
      existed.id,
      {
        name: 'Root Admin',
        email: this.ROOT_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        isVerified: true,
        isSystem: true,
        systemCode: this.ROOT_CODE,
        phone: null as any,
        avatarUrl: null as any,
        birthday: null as any,
        gender: null as any,
        otp: null as any,
        timeOtp: null as any,
      } as any,
    );
  }
}