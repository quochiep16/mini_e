import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../constants/meta-keys';
import { AppRole } from '../constants/roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { id: number | string; role: AppRole } | undefined;

    if (!user) {
      throw new UnauthorizedException('Bạn cần đăng nhập.');
    }

    if (required.includes(user.role)) {
      return true;
    }

    throw new ForbiddenException('Bạn không có quyền truy cập tài nguyên này.');
  }
}