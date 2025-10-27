import {
  Entity, PrimaryGeneratedColumn, Column, OneToOne, OneToMany,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn, JoinColumn, Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ShopStats } from './shop-stats.entity';
import { Product } from '../../products/entities/product.entity';

export enum ShopStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity({ name: 'shops' })
@Unique('UQ_shops_user', ['userId'])
@Unique('UQ_shops_slug', ['slug'])
export class Shop {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;

  @OneToOne(() => User, (u) => u.shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 180 })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string;

  @Column({ name: 'logo_url', type: 'varchar', length: 255, nullable: true })
  logoUrl?: string;

  @Column({ name: 'cover_url', type: 'varchar', length: 255, nullable: true })
  coverUrl?: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 20, default: ShopStatus.PENDING })
  status: ShopStatus;

  @Column({ name: 'verified_at', type: 'datetime', nullable: true })
  verifiedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt?: Date;

  @OneToOne(() => ShopStats, (s) => s.shop, { cascade: true })
  stats: ShopStats;

  @OneToMany(() => Product, (p) => p.shop)
  products: Product[];
}
