import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index } from 'typeorm';

@Entity('products')
@Index('products_name_idx', ['name']) // Index để tối ưu tìm kiếm theo tên
export class Product {
  @PrimaryGeneratedColumn('increment', { type: 'int', unsigned: true })
  id: number; // ID sản phẩm, tự động tăng

  @Column({ type: 'varchar', length: 255 })
  name: string; // Tên sản phẩm, ví dụ: "iPhone 13"

  @Column({ type: 'text', nullable: true })
  description: string; // Mô tả sản phẩm

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number; // Giá sản phẩm, ví dụ: 999.99

  @Column({ type: 'int', unsigned: true })
  stock: number; // Số lượng tồn kho

  @Column({ type: 'int', unsigned: true, nullable: true })
  categoryId: number; // ID danh mục, nullable vì chưa có Categories module

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date; // Thời gian tạo

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date; // Thời gian cập nhật

  @DeleteDateColumn({ type: 'datetime', precision: 6, nullable: true })
  deletedAt: Date; // Thời gian xóa mềm
}