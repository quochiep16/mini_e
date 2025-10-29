// src/common/guards/active-user.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { IS_PUBLIC_KEY } from '../constants/meta-keys';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // 1) Bypass route @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    // 2) Nếu chưa có req.user (AccessTokenGuard sẽ xử lý auth)
    //    -> guard này "nhường" qua (không tự reject), tránh bắn 401 ở route public.
    const u = req.user as { id?: number; sub?: number } | undefined;
    if (!u?.id && !u?.sub) return true;

    const userId = Number(u.id ?? u.sub);
    if (!userId) return true;

    // 3) Kiểm tra trạng thái tài khoản
    const user = await this.repo.findOne({ where: { id: userId }, withDeleted: true });
    if (!user) throw new UnauthorizedException('Unauthenticated');
    if (user.deletedAt) {
      // Tài khoản đã bị soft-delete → chặn mọi request (logout bắt buộc server-side)
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hoá');
    }
    return true;
  }
}
