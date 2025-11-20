import { Type } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaymentMethod } from '../entities/order.entity';

export class PreviewOrderDto {
  @IsOptional() @Type(() => Number) @IsInt() addressId?: number;
  @IsOptional() @IsArray() @ArrayNotEmpty() @ArrayUnique() @Type(() => Number) itemIds?: number[];
}

export class CreateOrderDto {
  @IsEnum(PaymentMethod) paymentMethod: PaymentMethod; // 'COD' | 'VNPAY'
  @IsOptional() @Type(() => Number) @IsInt() addressId?: number;
  @IsOptional() @IsArray() @ArrayNotEmpty() @ArrayUnique() @Type(() => Number) itemIds?: number[];
  @IsOptional() note?: string;
}
