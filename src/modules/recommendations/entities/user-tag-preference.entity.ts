import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('user_tag_preferences')
@Unique('UQ_user_tag_preferences_user_tag', ['userId', 'tagNorm'])
@Index('IDX_user_tag_preferences_user_score', ['userId', 'score'])
@Index('IDX_user_tag_preferences_tag_norm', ['tagNorm'])
export class UserTagPreference {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;

  @Column({ name: 'tag_norm', type: 'varchar', length: 160 })
  tagNorm: string;

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