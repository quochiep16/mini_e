import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @Length(1, 1200, { message: 'Họ tên tối đa 120 ký tự' })
  fullName: string;

  @IsString()
  @Matches(/^(?:\+?84|0)\d{9,10}$/, { message: 'Số điện thoại VN không hợp lệ' })
  phone: string;

  @IsString()
  @Length(1, 300, { message: 'Địa chỉ tối đa 300 ký tự' })
  formattedAddress: string;

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  lng?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDefault?: boolean = false;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @IsOptional()
  @Matches(/^(?:\+?84|0)\d{9,10}$/, { message: 'Số điện thoại VN không hợp lệ' })
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  formattedAddress?: string;

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  lng?: number;
}
