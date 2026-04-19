import { IsNotEmpty, Length, Matches } from 'class-validator';

export class VerifyAccountDto {
  @IsNotEmpty({ message: 'OTP không được để trống' })
  @Length(6, 6, { message: 'OTP phải gồm đúng 6 ký tự' })
  @Matches(/^\d{6}$/, { message: 'OTP phải gồm đúng 6 chữ số' })
  otp!: string;
}