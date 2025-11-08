import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '../entities/product.entity';

export class UpdateProductDto {
  @IsOptional()
  @IsString({ message: 'title phải là chuỗi' })
  @Length(1, 180, { message: 'title tối đa 180 ký tự' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'slug phải là chuỗi' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug không hợp lệ (chỉ a-z, 0-9, dấu -)' })
  @MaxLength(200, { message: 'slug tối đa 200 ký tự' })
  slug?: string;

  @IsOptional()
  @IsString({ message: 'description phải là chuỗi' })
  @MaxLength(2000, { message: 'description tối đa 2000 ký tự' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'price phải là số, tối đa 2 chữ số thập phân' })
  @Min(0, { message: 'price phải ≥ 0' })
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'stock phải là số nguyên' })
  @Min(0, { message: 'stock phải ≥ 0' })
  stock?: number;

  @IsOptional()
  @IsEnum(ProductStatus, { message: 'status không hợp lệ' })
  status?: ProductStatus;
}
