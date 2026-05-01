import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateProductDto {
  @IsString({ message: 'title phải là chuỗi' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(180, { message: 'title tối đa 180 ký tự' })
  title!: string;

  @IsOptional()
  @IsString({ message: 'slug phải là chuỗi' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug không hợp lệ (chỉ a-z, 0-9, dấu -)',
  })
  @MaxLength(200, { message: 'slug tối đa 200 ký tự' })
  slug?: string;

  @IsOptional()
  @IsString({ message: 'description phải là chuỗi' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(2000, { message: 'description tối đa 2000 ký tự' })
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'price phải là số, tối đa 2 chữ số thập phân' })
  @Min(0, { message: 'price phải ≥ 0' })
  price!: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === '0' || value === 0 || value === null || value === undefined) {
      return null;
    }
    return Number(value);
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt({ message: 'categoryId phải là số nguyên' })
  @Min(1, { message: 'categoryId phải ≥ 1' })
  categoryId?: number | null;

  @IsOptional()
  @IsArray({ message: 'images phải là mảng' })
  @ArrayMaxSize(10, { message: 'Tối đa 10 ảnh' })
  @IsString({ each: true, message: 'Mỗi ảnh phải là chuỗi URL' })
  images?: string[];
}