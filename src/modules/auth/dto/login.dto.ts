import { IsEmail, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsOptional()
  @Matches(/^(0\d{9,10}|\+?\d{8,15})$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone?: string;

  @IsNotEmpty({ message: 'Password không được để trống' })
  password!: string;
}