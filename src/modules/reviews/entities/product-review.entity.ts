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
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('product_reviews')
@Index('UQ_reviews_order_product', ['orderId', 'productId'], { unique: true })
@Index('IDX_reviews_product', ['productId'])
@Index('IDX_reviews_user', ['userId'])
@Index('IDX_reviews_order', ['orderId'])
export class ProductReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'char', length: 36, name: 'order_id' })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  /**
   * user_id cho phép NULL.
   * Khi user bị xóa cứng, review vẫn còn và user_id sẽ thành NULL.
   */
  @Column({ type: 'int', unsigned: true, name: 'user_id', nullable: true })
  userId!: number | null;

  /**
   * Đổi từ CASCADE sang SET NULL để xóa cứng user không làm mất review.
   */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  /**
   * Snapshot tên user tại thời điểm tạo review.
   * Dùng để hiển thị review kể cả khi user bị xóa cứng.
   */
  @Column({
    type: 'varchar',
    length: 120,
    name: 'user_name_snapshot',
    nullable: true,
  })
  userNameSnapshot!: string | null;

  /**
   * Snapshot avatar user tại thời điểm tạo review.
   * Dùng để hiển thị review kể cả khi user bị xóa cứng.
   */
  @Column({
    type: 'varchar',
    length: 500,
    name: 'user_avatar_snapshot',
    nullable: true,
  })
  userAvatarSnapshot!: string | null;

  @Column({ type: 'int', unsigned: true, name: 'product_id' })
  productId!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'tinyint', unsigned: true })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'json', nullable: true })
  images!: string[] | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt!: Date;
}