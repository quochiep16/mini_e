import { Injectable, NotFoundException } from '@nestjs/common'; // Import decorators và exceptions
import { InjectRepository } from '@nestjs/typeorm'; // Import để inject repository
import { Repository, Like, IsNull } from 'typeorm'; // Import TypeORM utilities
import { Product } from './entities/product.entity'; // Import entity sản phẩm
import { CreateProductDto } from './dto/create-product.dto'; // Import DTO tạo sản phẩm
import { UpdateProductDto } from './dto/update-product.dto'; // Import DTO cập nhật
import { SearchProductDto } from './dto/search-product.dto'; // Import DTO tìm kiếm

@Injectable() // Đánh dấu class là injectable service
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>, // Inject repository sản phẩm
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> { // Tạo sản phẩm mới
    const product = this.productRepository.create(createProductDto); // Tạo entity từ DTO
    return this.productRepository.save(product); // Lưu vào DB
  }

  async findAll(searchProductDto: SearchProductDto): Promise<{ products: Product[], total: number }> { // Lấy danh sách sản phẩm
    const { query, categoryId, minPrice, maxPrice, page = 1, limit = 10 } = searchProductDto; // Lấy params từ DTO
    const queryBuilder = this.productRepository.createQueryBuilder('product')
      .where('product.deletedAt IS NULL'); // Chỉ lấy sản phẩm chưa xóa mềm

    if (query) queryBuilder.andWhere('product.name LIKE :query', { query: `%${query}%` }); // Lọc theo tên
    if (categoryId) queryBuilder.andWhere('product.categoryId = :categoryId', { categoryId }); // Lọc theo danh mục
    if (minPrice) queryBuilder.andWhere('product.price >= :minPrice', { minPrice }); // Lọc giá tối thiểu
    if (maxPrice) queryBuilder.andWhere('product.price <= :maxPrice', { maxPrice }); // Lọc giá tối đa

    const skip = (page - 1) * limit; // Tính offset cho pagination
    queryBuilder.skip(skip).take(limit); // Áp dụng phân trang

    const [products, total] = await queryBuilder.getManyAndCount(); // Lấy sản phẩm và tổng số
    return { products, total }; // Trả về kết quả
  }

  async findOne(id: number): Promise<Product> { // Lấy chi tiết sản phẩm
    const product = await this.productRepository.findOne({
      where: { id, deletedAt: IsNull() }, // Tìm sản phẩm chưa xóa mềm
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`); // Throw lỗi nếu không tìm thấy
    }
    return product; // Trả về sản phẩm
  }

  async update(id: number, updateProductDto: UpdateProductDto): Promise<Product> { // Cập nhật sản phẩm
    const product = await this.findOne(id); // Tìm sản phẩm
    Object.assign(product, updateProductDto); // Cập nhật field từ DTO
    return this.productRepository.save(product); // Lưu vào DB
  }

  async remove(id: number): Promise<void> { // Xóa mềm sản phẩm
    const product = await this.findOne(id); // Tìm sản phẩm
    await this.productRepository.softDelete(id); // Xóa mềm
  }
}