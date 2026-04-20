import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsUrl,
} from 'class-validator';
import { Gender, UserRole } from '../enums/user.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Name phải là chuỗi' })
  @MinLength(2, { message: 'Name phải có ít nhất 2 ký tự' })
  @MaxLength(120, { message: 'Name tối đa 120 ký tự' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string | null;

  @IsOptional()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string | null;

  @IsOptional()
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Mật khẩu phải gồm cả chữ và số',
  })
  password?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'avatarUrl phải là URL hợp lệ' })
  avatarUrl?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'birthday phải có định dạng YYYY-MM-DD' })
  birthday?: string | null;

  @IsOptional()
  @IsEnum(Gender, { message: 'gender không hợp lệ' })
  gender?: Gender | null;

  // Chỉ ADMIN nên dùng 2 field này
  @IsOptional()
  @IsBoolean({ message: 'isVerified phải là boolean' })
  isVerified?: boolean;

  @IsOptional()
  @IsEnum(UserRole, { message: 'role không hợp lệ' })
  role?: UserRole;
}