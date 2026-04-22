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
import { User } from '../../users/entities/user.entity';

@Entity('user_addresses')
@Index('IDX_user_addresses_user', ['userId'])
export class Address {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true, nullable: false })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user?: User;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName!: string;

  @Column({ name: 'phone', type: 'varchar', length: 20 })
  phone!: string;

  @Column({ name: 'formatted_address', type: 'varchar', length: 300 })
  formattedAddress!: string;

  @Column({ name: 'place_id', type: 'varchar', length: 128, nullable: true })
  placeId?: string;

  // MySQL DECIMAL khi đọc ra thường là string
  @Column({ name: 'lat', type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat?: string;

  @Column({ name: 'lng', type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng?: string;

  @Column({ name: 'is_default', type: 'tinyint', width: 1, default: 0 })
  isDefault!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}