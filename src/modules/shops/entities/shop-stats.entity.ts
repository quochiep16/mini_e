import {
  Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
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

  @Column({ name: 'product_count', type: 'int', unsigned: true, default: 0 })
  productCount: number;

  @Column({ name: 'total_sold', type: 'int', unsigned: true, default: 0 })
  totalSold: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
