import {
  IsEmail,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { ShopStatus } from '../entities/shop.entity';

export class UpdateShopDto {
  @IsOptional()
  @IsNotEmpty({ message: 'Tên shop không được để trống' })
  @MaxLength(150, { message: 'Tên shop tối đa 150 ký tự' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email liên hệ không hợp lệ' })
  @MaxLength(150, { message: 'Email shop tối đa 150 ký tự' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Địa chỉ shop phải là chuỗi' })
  @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự' })
  shopAddress?: string;

  @IsOptional()
  @IsLatitude({ message: 'shopLat phải là vĩ độ hợp lệ [-90..90]' })
  shopLat?: number;

  @IsOptional()
  @IsLongitude({ message: 'shopLng phải là kinh độ hợp lệ [-180..180]' })
  shopLng?: number;

  @IsOptional()
  @MaxLength(191, { message: 'shopPlaceId tối đa 191 ký tự' })
  shopPlaceId?: string;

  @IsOptional()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'Số điện thoại shop không hợp lệ',
  })
  shopPhone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'logoUrl không hợp lệ' })
  @MaxLength(255, { message: 'logoUrl tối đa 255 ký tự' })
  logoUrl?: string;

  @IsOptional()
  @IsUrl({}, { message: 'coverUrl không hợp lệ' })
  @MaxLength(255, { message: 'coverUrl tối đa 255 ký tự' })
  coverUrl?: string;

  // Chỉ ADMIN được phép thay đổi status, kiểm soát thêm ở controller/service
  @IsOptional()
  @IsEnum(ShopStatus, {
    message: 'Status không hợp lệ (chỉ nhận: PENDING, ACTIVE, SUSPENDED)',
  })
  status?: ShopStatus;
}