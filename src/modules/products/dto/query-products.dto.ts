import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ProductStatus } from '../entities/product.entity';

export class QueryProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page phải ≥ 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit phải ≥ 1' })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'q phải là chuỗi' })
  @MaxLength(200, { message: 'q tối đa 200 ký tự' })
  q?: string;

  @IsOptional()
  @IsEnum(ProductStatus, { message: 'status không hợp lệ' })
  status?: ProductStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'shopId phải là số nguyên' })
  @Min(1, { message: 'shopId phải ≥ 1' })
  shopId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'categoryId phải là số nguyên' })
  @Min(1, { message: 'categoryId phải ≥ 1' })
  categoryId?: number;
}


