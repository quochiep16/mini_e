import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { PaymentSession } from './entities/payment-session.entity';
import { CartModule } from '../cart/cart.module';
import { Address } from '../addresses/entities/address.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { Shop } from '../shops/entities/shop.entity';
import { PaymentsController } from './payments.controller';
import { PaymentGatewayService } from './payment.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, PaymentSession, Address, Product, ProductVariant, ProductImage, Shop]),
    CartModule,
  ],
  controllers: [OrdersController, PaymentsController],
  providers: [OrdersService, PaymentGatewayService],
  exports: [OrdersService],
})
export class OrdersModule {}
