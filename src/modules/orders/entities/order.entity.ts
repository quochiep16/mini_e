import {
  Column, CreateDateColumn, Entity, Index, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

export enum OrderStatus { PENDING='PENDING', PAID='PAID', PROCESSING='PROCESSING', SHIPPED='SHIPPED', COMPLETED='COMPLETED', CANCELLED='CANCELLED' }
export enum PaymentStatus { UNPAID='UNPAID', PAID='PAID', REFUNDED='REFUNDED' }
export enum ShippingStatus { PENDING='PENDING', PICKED='PICKED', IN_TRANSIT='IN_TRANSIT', DELIVERED='DELIVERED', RETURNED='RETURNED', CANCELED='CANCELED' }
export enum PaymentMethod { COD='COD', VNPAY='VNPAY' }

@Entity('orders')
@Index('IDX_orders_user', ['userId'])
@Index('IDX_orders_created_at', ['createdAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'int', name: 'user_id' }) userId: number;
  @Column({ type: 'varchar', length: 32, unique: true }) code: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING }) status: OrderStatus;
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.UNPAID, name: 'payment_status' }) paymentStatus: PaymentStatus;
  @Column({ type: 'enum', enum: ShippingStatus, default: ShippingStatus.PENDING, name: 'shipping_status' }) shippingStatus: ShippingStatus;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.COD, name: 'payment_method' }) paymentMethod: PaymentMethod;
  @Column({ type: 'varchar', length: 64, name: 'payment_ref', nullable: true }) paymentRef: string | null;
  @Column({ type: 'json', name: 'payment_meta', nullable: true }) paymentMeta: any | null;

  @Column({ type: 'json', name: 'address_snapshot' }) addressSnapshot: any;

  @Column({ type: 'decimal', precision: 12, scale: 2 }) subtotal: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) discount: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'shipping_fee', default: 0 }) shippingFee: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) total: string;

  @Column({ type: 'varchar', length: 255, nullable: true }) note: string | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' }) updatedAt: Date;

  @OneToMany(() => OrderItem, (i) => i.order) items: OrderItem[];
}
