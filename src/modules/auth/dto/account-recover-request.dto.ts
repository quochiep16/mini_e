import { IsNotEmpty, IsString } from 'class-validator';
export class AccountRecoverRequestDto {
  @IsNotEmpty({ message: 'identifier (email hoặc phone) không được để trống' })
  @IsString()
  identifier: string; // email hoặc phone
}

