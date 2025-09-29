import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '../../modules/users/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Lấy danh sách vai trò từ metadata của route
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(), // Metadata của handler (route)
      context.getClass(),   // Metadata của controller
    ]);

    // Nếu route không yêu cầu vai trò, cho phép truy cập
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Lấy user từ request (giả định auth module đã gán req.user)
    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    // Kiểm tra user có tồn tại và có vai trò hợp lệ
    if (!user || !user.role) {
      throw new ForbiddenException('User not authenticated or role not found');
    }

    // Kiểm tra xem role của user có trong danh sách requiredRoles không
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }
}