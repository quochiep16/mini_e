import { SetMetadata } from '@nestjs/common';
import { AppRole } from '../constants/roles';
import { ROLES_KEY } from '../constants/meta-keys';

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
