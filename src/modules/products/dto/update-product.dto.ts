import { IsString, IsNotEmpty, IsNumber, IsPositive, IsInt, IsOptional } from 'class-validator'; // Thêm IsNumber

export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string; // Tên sản phẩm, tùy chọn khi cập nhật, chuỗi

  @IsString()
  @IsOptional()
  description?: string; // Mô tả, tùy chọn, chuỗi

  @IsNumber() // Validate là số
  @IsPositive() // Phải là số dương
  @IsOptional()
  price?: number; // Giá, tùy chọn, số dương

  @IsInt() // Validate là số nguyên
  @IsPositive() // Phải là số dương
  @IsOptional()
  stock?: number; // Tồn kho, tùy chọn, số nguyên dương

  @IsInt()
  @IsPositive()
  @IsOptional()
  categoryId?: number; // ID danh mục, tùy chọn, số nguyên dương
}