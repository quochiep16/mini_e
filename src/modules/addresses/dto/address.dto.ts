import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateAddressDto {
  @IsString({ message: 'Họ tên phải là chuỗi' })
  @Length(1, 120, { message: 'Họ tên tối đa 120 ký tự' })
  fullName!: string;

  @IsString({ message: 'Số điện thoại phải là chuỗi' })
  @Matches(/^(?:\+?84|0)\d{9,10}$/, {
    message: 'Số điện thoại VN không hợp lệ',
  })
  phone!: string;

  @IsString({ message: 'Địa chỉ phải là chuỗi' })
  @Length(1, 300, { message: 'Địa chỉ tối đa 300 ký tự' })
  formattedAddress!: string;

  @IsOptional()
  @IsString({ message: 'placeId phải là chuỗi' })
  @Length(1, 128, { message: 'placeId tối đa 128 ký tự' })
  placeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'lat phải là số' })
  @Min(-90, { message: 'lat không hợp lệ' })
  @Max(90, { message: 'lat không hợp lệ' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'lng phải là số' })
  @Min(-180, { message: 'lng không hợp lệ' })
  @Max(180, { message: 'lng không hợp lệ' })
  lng?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isDefault phải là boolean' })
  isDefault?: boolean = false;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString({ message: 'Họ tên phải là chuỗi' })
  @Length(1, 120, { message: 'Họ tên tối đa 120 ký tự' })
  fullName?: string;

  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi' })
  @Matches(/^(?:\+?84|0)\d{9,10}$/, {
    message: 'Số điện thoại VN không hợp lệ',
  })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi' })
  @Length(1, 300, { message: 'Địa chỉ tối đa 300 ký tự' })
  formattedAddress?: string;

  @IsOptional()
  @IsString({ message: 'placeId phải là chuỗi' })
  @Length(1, 128, { message: 'placeId tối đa 128 ký tự' })
  placeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'lat phải là số' })
  @Min(-90, { message: 'lat không hợp lệ' })
  @Max(90, { message: 'lat không hợp lệ' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'lng phải là số' })
  @Min(-180, { message: 'lng không hợp lệ' })
  @Max(180, { message: 'lng không hợp lệ' })
  lng?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isDefault phải là boolean' })
  isDefault?: boolean;
}