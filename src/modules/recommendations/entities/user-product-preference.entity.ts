import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('user_product_preferences')
@Unique('UQ_user_product_preferences_user_product', ['userId', 'productId'])
@Index('IDX_user_product_preferences_user_score', ['userId', 'score'])
@Index('IDX_user_product_preferences_product', ['productId'])
export class UserProductPreference {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;

  @Column({ name: 'product_id', type: 'int', unsigned: true })
  productId: number;

  @Column({ name: 'score', type: 'int', default: 0 })
  score: number;

  @Column({
    name: 'last_interacted_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastInteractedAt: Date | null;

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