import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { ProductImage } from './product-image.entity';

@Entity({ name: 'product_variants' })
@Unique('UQ_variant_sku', ['sku'])
@Index('IDX_variant_product', ['productId'])
@Index('IDX_variant_image', ['imageId'])
@Unique('UQ_variant_combo', ['productId', 'combinationKey'])
export class ProductVariant {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'product_id', type: 'int', unsigned: true })
  productId: number;

  @ManyToOne(() => Product, (p) => p.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 60 })
  sku: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price?: string | null;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ name: 'image_id', type: 'int', unsigned: true, nullable: true })
  imageId?: number | null;

  @ManyToOne(() => ProductImage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'image_id' })
  image?: ProductImage | null;

  // Lưu giá trị của tối đa 5 ô option
  @Column({ name: 'value1', type: 'varchar', length: 100, nullable: true }) value1?: string | null;
  @Column({ name: 'value2', type: 'varchar', length: 100, nullable: true }) value2?: string | null;
  @Column({ name: 'value3', type: 'varchar', length: 100, nullable: true }) value3?: string | null;
  @Column({ name: 'value4', type: 'varchar', length: 100, nullable: true }) value4?: string | null;
  @Column({ name: 'value5', type: 'varchar', length: 100, nullable: true }) value5?: string | null;

  // Cột generated ở DB, không insert/update ở app
  @Column({
    name: 'combination_key',
    type: 'varchar',
    length: 600,
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  combinationKey?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
