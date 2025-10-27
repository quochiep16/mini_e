import {
  Entity, PrimaryGeneratedColumn, Column, Unique, Index,
  OneToMany, CreateDateColumn, UpdateDateColumn
} from 'typeorm';
import { CartItem } from './cart-item.entity';

export enum CartStatus {
  OPEN = 'OPEN',
  CHECKING_OUT = 'CHECKING_OUT',
  LOCKED = 'LOCKED',
}

@Entity({ name: 'carts' })
@Unique('UQ_cart_user', ['userId'])
export class Cart {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Index('IDX_cart_user')
  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;

  // Tổng nháp để hiển thị nhanh (không dùng cho thanh toán cuối cùng)
  @Column({ name: 'items_count', type: 'int', default: 0 })
  itemsCount: number;

  @Column({ name: 'subtotal', type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: string;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currency: string;

  @Column({ type: 'enum', enum: CartStatus, default: CartStatus.OPEN })
  status: CartStatus;

  @OneToMany(() => CartItem, (i) => i.cart, { cascade: true })
  items: CartItem[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
