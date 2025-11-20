import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum PaymentSessionStatus { PENDING='PENDING', PAID='PAID', FAILED='FAILED', CANCELED='CANCELED' }

@Entity('payment_sessions')
@Index('IDX_payment_sessions_user', ['userId'])
@Index('UQ_payment_sessions_code', ['code'], { unique: true })
export class PaymentSession {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'int', name: 'user_id' }) userId: number;

  // chỉ VNPay
  @Column({ type: 'varchar', length: 32 }) code: string; // dùng làm vnp_TxnRef

  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount: string;
  @Column({ type: 'varchar', length: 6, default: 'VND' }) currency: string;

  @Column({ type: 'enum', enum: PaymentSessionStatus, default: PaymentSessionStatus.PENDING })
  status: PaymentSessionStatus;

  // [{orderId, code, total}]
  @Column({ type: 'json', name: 'orders_json' }) ordersJson: any;

  @Column({ type: 'varchar', length: 64, name: 'payment_ref', nullable: true }) paymentRef: string | null;
  @Column({ type: 'json', name: 'payment_meta', nullable: true }) paymentMeta: any | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' }) updatedAt: Date;
}
