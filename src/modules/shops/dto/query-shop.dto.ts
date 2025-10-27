import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ShopStatus } from '../entities/shop.entity';

export class QueryShopDto {
  @IsOptional()
  @IsString({ message: 'q phải là chuỗi ký tự' })
  @MaxLength(150, { message: 'q tối đa 150 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsEnum(ShopStatus, {
    message: 'Status không hợp lệ (chỉ nhận: PENDING, ACTIVE, SUSPENDED)',
  })
  status?: ShopStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(100, { message: 'limit tối đa là 100' })
  limit: number = 10;
}
