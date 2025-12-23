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
import { Order } from '../../orders/entities/order.entity';

@Entity('product_reviews')
@Index('UQ_reviews_order', ['orderId'], { unique: true }) // ✅ 1 order chỉ 1 review
@Index('IDX_reviews_product', ['productId'])
@Index('IDX_reviews_user', ['userId'])
export class ProductReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @Column({ type: 'int', name: 'product_id' })
  productId: number;

  @Column({ type: 'tinyint', unsigned: true })
  rating: number; // 1..5

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'json', nullable: true })
  images: string[] | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt: Date;
}
