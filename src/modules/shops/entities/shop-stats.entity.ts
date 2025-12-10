import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Shop } from './shop.entity';

@Entity({ name: 'shop_stats' })
export class ShopStats {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'shop_id', type: 'int', unsigned: true, unique: true })
  shopId: number;

  @OneToOne(() => Shop, (s) => s.stats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  // Tổng số sản phẩm đang có trong shop
  @Column({ name: 'product_count', type: 'int', unsigned: true, default: 0 })
  productCount: number;

  // Tổng số lượng sản phẩm đã bán (có thể dùng sau này)
  @Column({ name: 'total_sold', type: 'int', unsigned: true, default: 0 })
  totalSold: number;

  // Tổng doanh thu (VND) – kiểu number cho dễ tính toán ở TS
  @Column({
    name: 'total_revenue',
    type: 'decimal',
    precision: 16,
    scale: 2,
    unsigned: true,
    default: 0,
  })
  totalRevenue: number;

  // Tổng số đơn hàng
  @Column({ name: 'total_orders', type: 'int', unsigned: true, default: 0 })
  totalOrders: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
