import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { InteractionEvent } from '../enums/interaction-event.enum';

@Entity('product_interactions')
export class ProductInteraction {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;

  @Column({ name: 'product_id', type: 'int', unsigned: true })
  productId: number;

  @Column({ name: 'category_id', type: 'int', unsigned: true, nullable: true })
  categoryId: number | null;

  @Column({ name: 'shop_id', type: 'int', unsigned: true, nullable: true })
  shopId: number | null;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: InteractionEvent,
  })
  eventType: InteractionEvent;

  @Column({ type: 'int', default: 1 })
  weight: number;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}