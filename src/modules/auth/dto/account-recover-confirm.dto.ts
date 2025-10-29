import { IsNotEmpty, IsString, Length, MinLength, Matches } from 'class-validator';

export class AccountRecoverConfirmDto {
  @IsNotEmpty() @IsString()
  identifier: string; // email hoặc phone

  @IsNotEmpty() @IsString() @Length(6, 6, { message: 'OTP phải gồm 6 ký tự' })
  otp: string;

  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Mật khẩu mới phải gồm cả chữ và số' })
  newPassword: string;

  @IsNotEmpty({ message: 'confirmPassword không được để trống' })
  confirmPassword: string;
}
