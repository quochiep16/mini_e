import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common'; // Import decorators
import { ProductsService } from './products.service'; // Import service
import { CreateProductDto } from './dto/create-product.dto'; // DTO tạo
import { UpdateProductDto } from './dto/update-product.dto'; // DTO cập nhật
import { SearchProductDto } from './dto/search-product.dto'; // DTO tìm kiếm
import { Product } from './entities/product.entity'; // Entity sản phẩm

@Controller('products') // Map route /api/products
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {} // Inject service

  @Post() // Map POST /api/products (public)
  async create(@Body() createProductDto: CreateProductDto): Promise<Product> { // Tạo sản phẩm
    return this.productsService.create(createProductDto); // Gọi service
  }

  @Get() // Map GET /api/products (public)
  async findAll(@Query() searchProductDto: SearchProductDto): Promise<{ products: Product[], total: number }> { // Lấy danh sách
    return this.productsService.findAll(searchProductDto); // Gọi service
  }

  @Get(':id') // Map GET /api/products/:id (public)
  async findOne(@Param('id') id: string): Promise<Product> { // Lấy chi tiết
    return this.productsService.findOne(+id); // Gọi service
  }

  @Patch(':id') // Map PATCH /api/products/:id (public)
  async update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto): Promise<Product> { // Cập nhật
    return this.productsService.update(+id, updateProductDto); // Gọi service
  }

  @Delete(':id') // Map DELETE /api/products/:id (public)
  async remove(@Param('id') id: string): Promise<void> { // Xóa mềm
    return this.productsService.remove(+id); // Gọi service
  }
}