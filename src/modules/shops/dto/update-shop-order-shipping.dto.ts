import { IsEnum } from 'class-validator';
import { ShippingStatus } from '../../orders/entities/order.entity';

export class UpdateShopOrderShippingDto {
  @IsEnum(ShippingStatus, { message: 'shippingStatus không hợp lệ' })
  shippingStatus!: ShippingStatus;
}


