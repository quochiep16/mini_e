import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { Gender, UserRole } from '../enums/user.enum';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Name không được để trống' })
  @MinLength(2, { message: 'Name phải có ít nhất 2 ký tự' })
  @MaxLength(120, { message: 'Name tối đa 120 ký tự' })
  name!: string;

  // Có email hoặc phone
  @ValidateIf((o) => !!o.email || !o.phone)
  @IsNotEmpty({ message: 'Email không được để trống nếu chưa nhập số điện thoại' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Mật khẩu phải gồm cả chữ và số',
  })
  password!: string;

  @ValidateIf((o) => !!o.phone || !o.email)
  @IsNotEmpty({ message: 'Số điện thoại không được để trống nếu chưa nhập email' })
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'avatarUrl phải là URL hợp lệ' })
  avatarUrl?: string;

  @IsOptional()
  @IsDateString({}, { message: 'birthday phải có định dạng YYYY-MM-DD' })
  birthday?: string;

  @IsOptional()
  @IsEnum(Gender, { message: 'gender không hợp lệ' })
  gender?: Gender;

  @IsOptional()
  @IsBoolean({ message: 'isVerified phải là boolean' })
  isVerified?: boolean;

  @IsOptional()
  @IsEnum(UserRole, { message: 'role không hợp lệ' })
  role?: UserRole;
}