import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service'; // Import service từ cùng thư mục
import { ProductsController } from './products.controller'; // Import controller từ cùng thư mục
import { Product } from './entities/product.entity'; // Import entity

@Module({
  imports: [TypeOrmModule.forFeature([Product])], // Đăng ký repository cho Product entity
  controllers: [ProductsController], // Đăng ký controller để load routes
  providers: [ProductsService], // Đăng ký service để inject
  exports: [ProductsService], // Export service nếu module khác cần dùng
})
export class ProductsModule {}