import { IsNotEmpty } from 'class-validator';

export class VerifyAccountDto {
  @IsNotEmpty({ message: 'OTP không được để trống' })
  otp!: string;
}