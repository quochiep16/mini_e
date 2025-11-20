import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
@Index('IDX_order_items_order', ['orderId'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'char', length: 36, name: 'order_id' }) orderId: string;
  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' }) order: Order;

  @Column({ type: 'int', name: 'product_id' }) productId: number;
  @Column({ type: 'int', name: 'product_variant_id', nullable: true }) productVariantId: number | null;

  @Column({ type: 'varchar', length: 220, name: 'name_snapshot' }) nameSnapshot: string;
  @Column({ type: 'varchar', length: 300, name: 'image_snapshot', nullable: true }) imageSnapshot: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 }) price: string;
  @Column({ type: 'int' }) quantity: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'total_line' }) totalLine: string;

  @Column({ type: 'varchar', length: 100, nullable: true }) value1: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) value2: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) value3: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) value4: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) value5: string | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' }) updatedAt: Date;
}
