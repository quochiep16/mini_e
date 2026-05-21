import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

function toBoolean(value: unknown): unknown {
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return true;
  }

  if (value === false || value === 'false' || value === '0' || value === 0) {
    return false;
  }

  return value;
}

function trimToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export class CreateCategoryDto {
  @IsNotEmpty({ message: 'name không được để trống' })
  @IsString({ message: 'name phải là chuỗi' })
  @MaxLength(120, { message: 'name tối đa 120 ký tự' })
  name!: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString({ message: 'slug phải là chuỗi' })
  @MaxLength(160, { message: 'slug tối đa 160 ký tự' })
  slug?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString({ message: 'description phải là chuỗi' })
  @MaxLength(2000, { message: 'description tối đa 2000 ký tự' })
  description?: string;

  // Cho phép gửi URL ảnh sẵn nếu không upload file.
  // Nếu FE upload file image thì controller sẽ ghi đè bằng URL Cloudinary.
  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString({ message: 'imageUrl phải là chuỗi' })
  @MaxLength(500, { message: 'imageUrl tối đa 500 ký tự' })
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'parentId phải là số nguyên' })
  @Min(1, { message: 'parentId phải >= 1' })
  parentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder phải là số nguyên' })
  sortOrder?: number;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isActive phải là boolean' })
  isActive?: boolean;
}