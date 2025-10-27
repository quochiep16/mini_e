import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateShopDto {
  @IsNotEmpty({ message: 'Name không được để trống' })
  @IsString({ message: 'Name phải là chuỗi ký tự' })
  @MaxLength(150, { message: 'Name tối đa 150 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(150, { message: 'Email tối đa 150 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsNotEmpty({ message: 'Description không được để trống' })
  @IsString({ message: 'Description phải là chuỗi ký tự' })
  @MaxLength(255, { message: 'Description tối đa 255 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description: string;
}
