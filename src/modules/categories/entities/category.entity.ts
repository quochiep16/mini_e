import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

@Entity({ name: 'categories' })
@Index('UQ_categories_slug', ['slug'], { unique: true })
@Index('IDX_categories_parent', ['parentId'])
@Index('IDX_categories_active', ['isActive'])
export class Category {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 160 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'parent_id', type: 'int', unsigned: true, nullable: true })
  parentId?: number | null;

  @ManyToOne(() => Category, (c) => c.children, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent?: Category | null;

  @OneToMany(() => Category, (c) => c.parent)
  children: Category[];

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => Product, (p) => p.category)
  products: Product[];
}
