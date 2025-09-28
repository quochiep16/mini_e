import {
IsBoolean, IsDateString, IsEmail, IsEnum, IsNotEmpty,
IsOptional, IsString, MinLength, MaxLength, Matches, IsUrl,
} from 'class-validator';
import { Gender, UserRole } from '../entities/user.entity';


export class CreateUserDto {
@IsNotEmpty({ message: 'Name không được để trống' })
@MinLength(2, { message: 'Name phải có ít nhất 2 ký tự' })
@MaxLength(120, { message: 'Name tối đa 120 ký tự' })
name: string;


@IsNotEmpty({ message: 'Email không được để trống' })
@IsEmail({}, { message: 'Email không hợp lệ' })
email: string;


@IsNotEmpty({ message: 'Mật khẩu không được để trống' })
@MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
@Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Mật khẩu phải gồm cả chữ và số' })
password: string;


@IsOptional()
@Matches(/^\+?[0-9]{8,15}$/, { message: 'Số điện thoại không hợp lệ' })
phone?: string;


@IsOptional()
@IsUrl({ require_protocol: true }, { message: 'avatarUrl phải là URL hợp lệ' })
avatarUrl?: string | null;


@IsOptional()
@IsDateString({}, { message: 'birthday phải có định dạng YYYY-MM-DD' })
birthday?: string | null;


@IsOptional()
@IsEnum(Gender, { message: 'gender không hợp lệ' })
gender?: Gender | null;


@IsOptional()
@IsBoolean({ message: 'isVerified phải là boolean' })
isVerified?: boolean;


@IsOptional()
@IsEnum(UserRole, { message: 'role không hợp lệ' })
role?: UserRole;
}