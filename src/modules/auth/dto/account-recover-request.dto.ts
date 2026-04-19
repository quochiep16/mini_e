import { IsNotEmpty, IsString } from 'class-validator';

export class AccountRecoverRequestDto {
  @IsNotEmpty({ message: 'identifier (email hoặc phone) không được để trống' })
  @IsString()
  email!: string; // giữ tên field cũ để không vỡ FE hiện tại
}