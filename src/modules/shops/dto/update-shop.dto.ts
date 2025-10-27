import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ShopStatus } from '../entities/shop.entity';

export class UpdateShopDto {
  @IsOptional()
  @IsString({ message: 'Name phải là chuỗi ký tự' })
  @MaxLength(150, { message: 'Name tối đa 150 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(150, { message: 'Email tối đa 150 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @IsString({ message: 'Description phải là chuỗi ký tự' })
  @MaxLength(255, { message: 'Description tối đa 255 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  // Chỉ ADMIN được phép thay đổi status (kiểm soát ở service/controller)
  @IsOptional()
  @IsEnum(ShopStatus, {
    message: 'Status không hợp lệ (chỉ nhận: PENDING, ACTIVE, SUSPENDED)',
  })
  status?: ShopStatus;
}
