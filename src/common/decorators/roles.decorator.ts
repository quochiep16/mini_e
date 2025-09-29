import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/users/entities/user.entity';

// Key để lưu metadata vai trò
export const ROLES_KEY = 'roles';

// Decorator @Roles nhận danh sách vai trò (USER/SELLER/ADMIN)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);