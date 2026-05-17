import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from 'src/modules/users/entities/user.entity';
import { ALLOW_UNVERIFIED_KEY, IS_PUBLIC_KEY } from '../constants/meta-keys';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const payload = req.user;

    if (!payload) return true;

    const userId = Number(payload.id ?? payload.sub);

    if (!userId || Number.isNaN(userId)) {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const user = await this.usersRepo.findOne({
      where: { id: userId },
      withDeleted: true,
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
    }

    const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!user.isVerified && !allowUnverified) {
      throw new UnauthorizedException('Tài khoản chưa xác thực');
    }

    req.user = {
      ...payload,
      id: user.id,
      sub: user.id,
      role: user.role,
      isVerified: user.isVerified,
    };

    return true;
  }
}