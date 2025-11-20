import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus, PaymentStatus, ShippingStatus } from '../entities/order.entity';

export class UpdateOrderStatusDto {
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @IsOptional() @IsEnum(PaymentStatus) paymentStatus?: PaymentStatus;
  @IsOptional() @IsEnum(ShippingStatus) shippingStatus?: ShippingStatus;
}
