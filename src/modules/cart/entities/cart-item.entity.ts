import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, Unique,
  CreateDateColumn, UpdateDateColumn
} from 'typeorm';
import { Cart } from './cart.entity';

@Entity({ name: 'cart_items' })
@Unique('UQ_cartitem_variant', ['cartId', 'variantId'])
export class CartItem {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Index('IDX_ci_cart')
  @Column({ name: 'cart_id', type: 'int', unsigned: true })
  cartId: number;

  @ManyToOne(() => Cart, (c) => c.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: Cart;

  @Index('IDX_ci_shop')
  @Column({ name: 'shop_id', type: 'int', unsigned: true })
  shopId: number;

  @Index('IDX_ci_product')
  @Column({ name: 'product_id', type: 'int', unsigned: true })
  productId: number;

  @Index('IDX_ci_variant')
  @Column({ name: 'variant_id', type: 'int', unsigned: true })
  variantId: number;

  @Column({ type: 'int', unsigned: true, default: 1 })
  quantity: number;

  // Snapshot giá tại thời điểm thêm giỏ (để hiển thị); thanh toán sẽ tính lại
  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: string;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currency: string;

  // Snapshot thông tin hiển thị, tránh lệ thuộc join nhiều bảng
  @Column({ name: 'product_title', type: 'varchar', length: 255 })
  productTitle: string;

  @Column({ name: 'variant_label', type: 'varchar', length: 255, nullable: true })
  variantLabel?: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl?: string | null;

  // Lựa chọn cho checkout theo lô (mua một phần giỏ)
  @Index('IDX_ci_selected')
  @Column({ name: 'is_selected', type: 'boolean', default: true })
  isSelected: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
