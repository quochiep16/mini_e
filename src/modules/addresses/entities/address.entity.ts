import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_addresses')
@Index('IDX_user_addresses_user', ['userId'])
export class Address {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: false })
  userId: number;

  @Column({ type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  // Hiển thị cho người dùng
  @Column({ type: 'varchar', length: 300 })
  formattedAddress: string;

  // Lưu của Google (để về sau refresh chi tiết nếu cần)
  @Column({ type: 'varchar', length: 128, nullable: true })
  placeId: string | null;

  // Tính ship (distance-based)
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng: string | null;

  // 1 user có thể đặt 1 địa chỉ mặc định
  @Column({ type: 'tinyint', width: 1, default: 0 })
  isDefault: boolean;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
