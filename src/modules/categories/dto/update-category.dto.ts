import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
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
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  return value;
}

function toNullableString(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === 'null' || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return value;
}

function toNullableNumber(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === 'null' || value === '') {
    return null;
  }

  return Number(value);
}

export class UpdateCategoryDto {
  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString({ message: 'Tên category phải là chuỗi' })
  @MaxLength(120, { message: 'Tên category tối đa 120 ký tự' })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString({ message: 'Slug phải là chuỗi' })
  @MaxLength(160, { message: 'Slug tối đa 160 ký tự' })
  slug?: string;

  @IsOptional()
  @Transform(({ value }) => toNullableString(value))
  @ValidateIf((object) => object.description !== null)
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(2000, { message: 'Mô tả tối đa 2000 ký tự' })
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => toNullableString(value))
  @ValidateIf((object) => object.imageUrl !== null)
  @IsString({ message: 'imageUrl phải là chuỗi' })
  @MaxLength(500, { message: 'imageUrl tối đa 500 ký tự' })
  imageUrl?: string | null;

  @IsOptional()
  @Transform(({ value }) => toNullableNumber(value))
  @ValidateIf((object) => object.parentId !== null)
  @IsInt({ message: 'parentId phải là số nguyên' })
  @Min(1, { message: 'parentId phải >= 1' })
  parentId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder phải là số nguyên' })
  sortOrder?: number;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isActive phải là boolean' })
  isActive?: boolean;
}