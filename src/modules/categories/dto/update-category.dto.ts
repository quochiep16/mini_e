import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString({ message: 'name phải là chuỗi' })
  @MaxLength(120, { message: 'name tối đa 120 ký tự' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'slug phải là chuỗi' })
  @MaxLength(160, { message: 'slug tối đa 160 ký tự' })
  slug?: string;

  @IsOptional()
  @IsString({ message: 'description phải là chuỗi' })
  @MaxLength(2000, { message: 'description tối đa 2000 ký tự' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'parentId phải là số nguyên' })
  @Min(1, { message: 'parentId phải ≥ 1' })
  parentId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder phải là số nguyên' })
  sortOrder?: number;

  @IsOptional()
  isActive?: boolean;
}
