import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('product_trending')
@Unique('UQ_product_trending_product', ['productId'])
@Index('IDX_product_trending_score_7d', ['score7d'])
@Index('IDX_product_trending_is_trending_score', ['isTrending', 'score7d'])
export class ProductTrending {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'product_id', type: 'int', unsigned: true })
  productId: number;

  @Column({ name: 'score_24h', type: 'int', default: 0 })
  score24h: number;

  @Column({ name: 'score_7d', type: 'int', default: 0 })
  score7d: number;

  @Column({ name: 'score_30d', type: 'int', default: 0 })
  score30d: number;

  @Column({ name: 'click_count_7d', type: 'int', default: 0 })
  clickCount7d: number;

  @Column({ name: 'view_count_7d', type: 'int', default: 0 })
  viewCount7d: number;

  @Column({ name: 'add_to_cart_count_7d', type: 'int', default: 0 })
  addToCartCount7d: number;

  @Column({ name: 'favorite_count_7d', type: 'int', default: 0 })
  favoriteCount7d: number;

  @Column({ name: 'purchase_count_7d', type: 'int', default: 0 })
  purchaseCount7d: number;

  @Column({ name: 'is_trending', type: 'tinyint', width: 1, default: 0 })
  isTrending: boolean;

  @Column({
    name: 'last_interacted_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastInteractedAt: Date | null;

  @Column({
    name: 'last_calculated_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastCalculatedAt: Date | null;

  @Column({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt: Date;
}