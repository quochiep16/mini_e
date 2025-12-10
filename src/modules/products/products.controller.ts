import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import type { Request } from 'express';
import { Express } from 'express';
import { v2 as cloudinary } from 'cloudinary';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { GenerateVariantsDto } from './dto/generate-variants.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../modules/users/entities/user.entity';
import { UpdateProductDto } from './dto/search-product.dto';

// ==== cấu hình upload nhiều ảnh (vẫn lưu vào uploads/products) ====
const uploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const dir = join(process.cwd(), 'uploads', 'products');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${randomBytes(6).toString('hex')}`;
      cb(null, unique + extname(file.originalname).toLowerCase());
    },
  }),
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new BadRequestException('Chỉ chấp nhận ảnh (jpeg, png, webp, gif)'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
};

// ==== cấu hình Cloudinary dùng env ====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ===== public list/detail =====
  @Get()
  async list(@Query('page') page = '1', @Query('limit') limit = '20') {
    const data = await this.productsService.findAllBasic(Number(page), Number(limit));
    return { success: true, data };
  }

  @Get('by-shop/:shopId')
  async listByShop(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const data = await this.productsService.findByShop(shopId, Number(page), Number(limit));
    return { success: true, data };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const data = await this.productsService.findOnePublic(Number(id));
    return { success: true, data };
  }

  @Post()
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(FilesInterceptor('images', 10, uploadOptions))
  async create(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateProductDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request, // không dùng nữa nhưng giữ cho đỡ phải sửa signature ở chỗ khác
  ) {
    // 1) Multer đã lưu file vào uploads/products
    // 2) Ta lấy đường dẫn local đó để upload lên Cloudinary
    const cloudinaryUrls: string[] = [];

    if (files && files.length > 0) {
      const uploadResults = await Promise.all(
        files.map((file) =>
          cloudinary.uploader.upload((file as any).path, {
            folder: 'mini-e/products', // bạn có thể đổi tên folder trên Cloudinary nếu muốn
          }),
        ),
      );

      uploadResults.forEach((res) => {
        cloudinaryUrls.push(res.secure_url); // URL cuối cùng dùng để lưu DB
      });
    }

    const product = await this.productsService.createBySeller(userId, {
      ...dto,
      // ưu tiên dùng URL từ Cloudinary; nếu không có file upload thì fallback sang dto.images (nếu FE gửi sẵn)
      images: cloudinaryUrls.length ? cloudinaryUrls : dto.images,
    });

    return { success: true, data: product };
  }

  @Patch(':id')
  @UseGuards(AccessTokenGuard)
  async updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
    @Body() dto: UpdateProductDto,
  ) {
    const data = await this.productsService.updateProduct(id, userId, role, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(AccessTokenGuard)
  async removeProduct(
    @Param('id') id: string,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
  ) {
    const res = await this.productsService.removeProduct(Number(id), userId, role);
    return { res };
  }

  @Post(':id/variants/generate')
  @UseGuards(AccessTokenGuard)
  async generateVariants(
    @Param('id') id: string,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
    @Body() dto: GenerateVariantsDto,
  ) {
    const data = await this.productsService.generateVariants(Number(id), userId, role, dto);
    return { success: true, data };
  }

  @Get(':id/variants')
  @UseGuards(AccessTokenGuard)
  async listVariants(
    @Param('id') id: string,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
  ) {
    const data = await this.productsService.listVariants(Number(id), userId, role);
    return { success: true, data };
  }

  @Patch(':productId/variants/:variantId')
  @UseGuards(AccessTokenGuard)
  async updateVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
    @Body() dto: UpdateVariantDto,
  ) {
    const data = await this.productsService.updateVariant(
      Number(productId),
      Number(variantId),
      userId,
      role,
      dto,
    );
    return { success: true, data };
  }
}
