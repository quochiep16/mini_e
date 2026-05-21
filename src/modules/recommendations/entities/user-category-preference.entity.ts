import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_category_preferences')
export class UserCategoryPreference {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;

  @Column({ name: 'category_id', type: 'int', unsigned: true })
  categoryId: number;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ name: 'last_interacted_at', type: 'datetime', nullable: true })
  lastInteractedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}