import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { UserRole } from '../enums/user.enum';

export class QueryUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  limit?: number = 20;

  @IsOptional()
  @IsString({ message: 'search phải là chuỗi' })
  search?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'role không hợp lệ' })
  role?: UserRole;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'isVerified phải là boolean' })
  isVerified?: boolean;

  @IsOptional()
  @IsIn(
    [
      'id',
      'name',
      'email',
      'phone',
      'role',
      'isVerified',
      'isSystem',
      'lastLoginAt',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ],
    { message: 'sortBy không hợp lệ' },
  )
  sortBy?:
    | 'id'
    | 'name'
    | 'email'
    | 'phone'
    | 'role'
    | 'isVerified'
    | 'isSystem'
    | 'lastLoginAt'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'], { message: 'sortOrder không hợp lệ' })
  sortOrder?: 'ASC' | 'DESC';
}