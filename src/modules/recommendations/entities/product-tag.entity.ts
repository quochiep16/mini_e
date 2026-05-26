import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('product_tags')
@Unique('UQ_product_tags_product_tag_norm', ['productId', 'tagNorm'])
@Index('IDX_product_tags_product', ['productId'])
@Index('IDX_product_tags_tag_norm', ['tagNorm'])
export class ProductTag {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'product_id', type: 'int', unsigned: true })
  productId: number;

  @Column({ name: 'tag', type: 'varchar', length: 120 })
  tag: string;

  @Column({ name: 'tag_norm', type: 'varchar', length: 160 })
  tagNorm: string;

  @Column({
    name: 'weight',
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 1,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value),
    },
  })
  weight: number;

  @Column({ name: 'sources', type: 'json', nullable: true })
  sources: string[] | null;

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