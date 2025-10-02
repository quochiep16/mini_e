import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestVerifyDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;
}
