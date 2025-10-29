import { IsNotEmpty, IsString, Length, MinLength, Matches } from 'class-validator';

export class AccountRecoverConfirmDto {
  @IsNotEmpty() @IsString()
  email: string; // email hoặc phone

  @IsNotEmpty() @IsString() @Length(6, 6, { message: 'OTP phải gồm 6 ký tự' })
  otp: string;

  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/, {
    message:
      'Password phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  newPassword: string;

  @IsNotEmpty({ message: 'confirmPassword không được để trống' })
  confirmPassword: string;
}
