import { IsString, IsNotEmpty, IsNumber, IsPositive, IsInt, IsOptional } from 'class-validator'; // Thêm IsNumber

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string; // Tên sản phẩm, bắt buộc, phải là chuỗi

  @IsString()
  @IsOptional()
  description?: string; // Mô tả, tùy chọn, chuỗi

  @IsNumber() // Validate là số
  @IsPositive() // Phải là số dương
  price: number; // Giá sản phẩm, bắt buộc

  @IsInt() // Validate là số nguyên
  @IsPositive() // Phải là số dương
  stock: number; // Số lượng tồn kho, bắt buộc

  @IsInt()
  @IsPositive()
  @IsOptional()
  categoryId?: number; // ID danh mục, tùy chọn, số nguyên dương
}