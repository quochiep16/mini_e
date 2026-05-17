import { IsEmail, IsNotEmpty, MinLength, Matches, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'Name không được để trống' })
  @MinLength(2, { message: 'Name phải có ít nhất 2 ký tự' })
  name!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsOptional()
  @Matches(/^(0\d{9,10}|\+?\d{8,15})$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone?: string;

  @IsNotEmpty({ message: 'Password không được để trống' })
  @MinLength(8, { message: 'Password phải có ít nhất 8 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/, {
    message: 'Password phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  password!: string;

  @IsNotEmpty({ message: 'Confirm Password không được để trống' })
  confirmPassword!: string;
}