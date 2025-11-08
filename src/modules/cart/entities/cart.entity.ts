import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CartItem } from './cart-item.entity';

@Entity('carts')
@Index('UQ_carts_user', ['userId'], { unique: true })
export class Cart {
  @PrimaryGeneratedColumn() id: number;

  @Column({ type: 'int', nullable: false }) userId: number;

  @Column({ type: 'int', default: 0 }) itemsCount: number;
  @Column({ type: 'int', default: 0 }) itemsQuantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) subtotal: string;

  @Column({ type: 'varchar', length: 10, default: 'VND' }) currency: string;

  @OneToMany(() => CartItem, (i) => i.cart, { cascade: false }) items: CartItem[];

  @CreateDateColumn({ type: 'datetime' }) createdAt: Date;
  @UpdateDateColumn({ type: 'datetime' }) updatedAt: Date;
}
