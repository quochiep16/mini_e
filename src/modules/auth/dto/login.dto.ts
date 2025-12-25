import { IsEmail, IsNotEmpty, ValidateIf, Matches } from 'class-validator';

export class LoginDto {
  @ValidateIf((o) => !o.phone)
  @IsEmail({}, { message: 'Email không không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống (nếu không nhập SĐT)' })
  email?: string;

  @ValidateIf((o) => !o.email)
  @Matches(/^(0\d{9,10}|\+?\d{8,15})$/, { message: 'Số điện thoại không hợp lệ' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống (nếu không nhập email)' })
  phone?: string;

  @IsNotEmpty({ message: 'Password không được để trống' })
  password!: string;
}
