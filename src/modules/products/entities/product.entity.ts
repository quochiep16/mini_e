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
import { Shop } from '../../shops/entities/shop.entity';
import { ProductImage } from './product-image.entity';
import { ProductVariant } from './product-variant.entity';
import { Category } from '../../categories/entities/category.entity';

export enum ProductStatus {
  // Đang bán
  ACTIVE = 'ACTIVE',

  // Hết hàng
  OUT_OF_STOCK = 'OUT_OF_STOCK',

  // Đã khóa bởi admin vì vi phạm
  LOCKED = 'LOCKED',
}

@Entity({ name: 'products' })
@Index('IDX_products_category', ['categoryId'])
@Index('UQ_products_slug', ['slug'], { unique: true })
@Index('IDX_products_shop', ['shopId'])
@Index('IDX_products_status', ['status'])
export class Product {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'shop_id', type: 'int', unsigned: true })
  shopId: number;

  @ManyToOne(() => Shop, (s) => s.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ name: 'category_id', type: 'int', unsigned: true, nullable: true })
  categoryId?: number | null;

  @ManyToOne(() => Category, (c) => c.products, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  @Column({ length: 180 })
  title: string;

  @Column({ length: 200 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  // Lưu cấu trúc tối đa 5 ô option cho riêng product
  // ví dụ: [{ name: 'Màu', values: ['Đỏ','Xanh'] }, { name: 'Size', values: ['M','L'] }]
  @Column({ name: 'option_schema', type: 'json', nullable: true })
  optionSchema?: { name: string; values: string[] }[] | null;

  // DECIMAL -> nên map string ở runtime để tránh sai số
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  price: number;

  @Column({
    name: 'compare_at_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  compareAtPrice?: string | null;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currency: string;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'int', default: 0 })
  sold: number;

  // Dùng varchar để khớp với migration hiện tại.
  // ACTIVE = đang bán
  // OUT_OF_STOCK = hết hàng
  // LOCKED = đã khóa
  @Column({
    type: 'varchar',
    length: 20,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  // Xóa mềm sản phẩm.
  // Khi xóa product sẽ chỉ gán deleted_at, không xóa cứng khỏi database.
  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => ProductImage, (img) => img.product)
  images: ProductImage[];

  @OneToMany(() => ProductVariant, (v) => v.product)
  variants: ProductVariant[];
}