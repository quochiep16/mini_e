import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateVariantDto {
  @IsOptional()
  @IsString({ message: 'name phải là chuỗi' })
  @MaxLength(120, { message: 'name tối đa 120 ký tự' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'sku phải là chuỗi' })
  @MaxLength(60, { message: 'sku tối đa 60 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  sku?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'price phải là số (tối đa 2 chữ số thập phân)' })
  @Min(0, { message: 'price phải ≥ 0' })
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'stock phải là số' })
  @Min(0, { message: 'stock phải ≥ 0' })
  stock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'imageId phải là số' })
  imageId?: number;
}
