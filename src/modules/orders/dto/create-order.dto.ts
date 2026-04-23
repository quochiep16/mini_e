import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '../entities/order.entity';

export class PreviewOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  addressId?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  itemIds?: number[];
}

export class CreateOrderDto {
  @IsEnum(PaymentMethod)
  paymentMethod !: PaymentMethod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  addressId?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  itemIds?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}