import { IsEmail, IsNotEmpty, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @IsNotEmpty({ message: 'OTP không được để trống' })
  otp!: string;

  @IsNotEmpty({ message: 'Password không được để trống' })
  @MinLength(8, { message: 'Password phải có ít nhất 8 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/, {
    message: 'Password phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  password!: string;

  @IsNotEmpty({ message: 'confirmPassword không được để trống' })
  confirmPassword!: string;
}
