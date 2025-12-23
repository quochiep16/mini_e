import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cart } from './cart.entity';

@Entity('cart_items')
@Index('IDX_cart_items_cart', ['cartId'])
@Index('UQ_cartitem_unique_variant', ['cartId', 'variantId'], { unique: true })
export class CartItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: false })
  cartId: number;

  @ManyToOne(() => Cart, (c) => c.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart: Cart;

  @Column({ type: 'int', nullable: false })
  productId: number;

  // ✅ biến thể bắt buộc
  @Column({ type: 'int', nullable: false })
  variantId: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  variantName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sku: string | null;

  @Column({ type: 'int', nullable: true })
  imageId: number | null;

  // ✅ thêm cột mới lưu URL ảnh biến thể
  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  value1: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  value2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  value3: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  value4: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  value5: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
