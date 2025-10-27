import {
  IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsNotEmpty({ message: 'title không được để trống' })
  @IsString({ message: 'title phải là chuỗi' })
  @MinLength(2, { message: 'title phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'title tối đa 180 ký tự' })
  title: string;

  @IsOptional()
  @IsString({ message: 'slug phải là chuỗi' })
  @MaxLength(200, { message: 'slug tối đa 200 ký tự' })
  slug?: string;

  @IsOptional()
  @IsString({ message: 'description phải là chuỗi' })
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'price phải là số (tối đa 2 chữ số thập phân)' })
  @Min(0, { message: 'price phải ≥ 0' })
  @Max(999999999999 / 100, { message: 'price quá lớn' })
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'stock phải là số nguyên' })
  @Min(0, { message: 'stock phải ≥ 0' })
  stock?: number;

  // Nếu không upload file, có thể truyền sẵn URL ảnh
  @IsOptional()
  @IsArray({ message: 'images phải là mảng' })
  @IsUrl({}, { each: true, message: 'Mỗi phần tử images phải là URL hợp lệ' })
  images?: string[];
}
