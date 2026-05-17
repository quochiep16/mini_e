import { SetMetadata } from '@nestjs/common';
import { ALLOW_UNVERIFIED_KEY } from '../constants/meta-keys';

export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);