import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity({ name: 'product_images' })
@Index('IDX_image_product', ['productId'])
export class ProductImage {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'product_id', type: 'int', unsigned: true })
  productId: number;

  @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ length: 255 })
  url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  alt?: string | null;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ name: 'is_main', type: 'boolean', default: false })
  isMain: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
