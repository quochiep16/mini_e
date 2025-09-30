import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

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
  search?: string; // name/email/phone

  @IsOptional()
  @IsString({ message: 'sortBy không hợp lệ' })
  sortBy?: 'createdAt' | 'name' | 'lastLoginAt' | 'deletedAt';

  @IsOptional()
  @IsString({ message: 'sortOrder không hợp lệ' })
  sortOrder?: 'ASC' | 'DESC';
}
