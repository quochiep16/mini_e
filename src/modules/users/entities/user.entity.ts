import { Shop } from 'src/modules/shops/entities/shop.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
} from 'typeorm';
// ✅ QUAN TRỌNG: Import Gender và UserRole từ file enum chung để đồng bộ với DTO
import { Gender, UserRole } from '../enums/user.enum'; 

@Entity('users')
@Index('users_email_uq', ['email'], { unique: true })
@Index('users_phone_uq', ['phone'], { unique: true })
export class User {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'email', type: 'varchar', length: 320, nullable: true })
  email?: string;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone?: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'text', nullable: true })
  avatarUrl?: string;

  @Column({ type: 'date', nullable: true })
  birthday?: string;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender?: Gender;

  @Column({ type: 'varchar', length: 255, nullable: true })
  otp?: string;

  @Column({ name: 'time_otp', type: 'datetime', precision: 6, nullable: true })
  timeOtp?: Date;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @OneToOne(() => Shop, (shop) => shop.user)
  shop?: Shop;
}