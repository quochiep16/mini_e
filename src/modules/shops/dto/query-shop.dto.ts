import { IsInt, IsOptional, IsString, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ShopStatus } from '../entities/shop.entity';

export class QueryShopDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(100, { message: 'limit tối đa là 100' })
  limit?: number = 20;

  @IsOptional()
  @IsString({ message: 'q phải là chuỗi' })
  q?: string;

  @IsOptional()
  @IsEnum(ShopStatus, { message: 'status không hợp lệ' })
  status?: ShopStatus;
}
