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
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';
import { Express } from 'express';

import { cloudinary } from '../../config/cloudinary.config';

import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { GenerateVariantsDto } from './dto/generate-variants.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

import { UserRole } from '../users/enums/user.enum';

const MAX_PRODUCT_IMAGES = 6;
const MAX_IMAGE_SIZE_MB = 2;

const uploadOptions: MulterOptions = {
  // Dùng memoryStorage:
  // File ảnh sẽ nằm trong RAM qua file.buffer,
  // không tạo thư mục uploads/products nữa.
  storage: memoryStorage(),

  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(
        new BadRequestException('Chỉ chấp nhận ảnh jpeg, png, webp hoặc gif'),
        false,
      );
    }

    cb(null, true);
  },

  limits: {
    fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024,
    files: MAX_PRODUCT_IMAGES,
  },
};

// Upload ảnh từ RAM buffer lên Cloudinary.
// Vì dùng memoryStorage nên file sẽ có file.buffer.
function uploadBufferToCloudinary(file: Express.Multer.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'mini-e/products',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result?.secure_url) {
          return reject(new BadRequestException('Upload ảnh thất bại'));
        }

        resolve(result.secure_url);
      },
    );

    uploadStream.end(file.buffer);
  });
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // Public: người mua xem danh sách sản phẩm.
  // Chỉ lấy sản phẩm chưa bị xóa mềm, shop ACTIVE,
  // product status ACTIVE hoặc OUT_OF_STOCK.
  @Public()
  @Get()
  async list(@Query() q: QueryProductsDto) {
    const data = await this.productsService.findPublic(q);
    return { success: true, data };
  }

  // Public: người mua xem sản phẩm theo shop.
  // Không trả sản phẩm LOCKED hoặc đã deleted_at.
  @Public()
  @Get('by-shop/:shopId')
  async listByShop(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const data = await this.productsService.findByShop(
      shopId,
      Number(page),
      Number(limit),
    );

    return { success: true, data };
  }

  // Seller: xem sản phẩm của shop mình.
  // Seller thấy ACTIVE, OUT_OF_STOCK, LOCKED.
  // Seller không thấy sản phẩm đã deleted_at.
  @UseGuards(AccessTokenGuard)
  @Get('my-shop')
  async listMyShopProducts(
    @CurrentUser('sub') userId: number,
    @Query() query: QueryProductsDto,
  ) {
    const data = await this.productsService.findMyShopProducts(userId, query);
    return { success: true, data };
  }

  // Admin: xem toàn bộ sản phẩm, bao gồm cả sản phẩm đã deleted_at.
  // Admin chỉ được xem deleted_at, không được sửa product đã deleted_at.
  @UseGuards(AccessTokenGuard)
  @Get('admin/all')
  async listForAdmin(
    @CurrentUser('role') role: UserRole,
    @Query() query: QueryProductsDto,
  ) {
    const data = await this.productsService.findAdminAll(role, query);
    return { success: true, data };
  }

  @Public()
  @Get(':id/variants')
  async listPublicVariants(@Param('id', ParseIntPipe) id: number) {
    const data = await this.productsService.listPublicVariants(id);
    return { success: true, data };
  }

  @Public()
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.productsService.findOnePublic(id);
    return { success: true, data };
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  @UseInterceptors(FilesInterceptor('images', MAX_PRODUCT_IMAGES, uploadOptions))
  async create(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateProductDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    let cloudinaryUrls: string[] = [];

    if (files.length > 0) {
      cloudinaryUrls = await Promise.all(
        files.map((file) => uploadBufferToCloudinary(file)),
      );
    }

    const product = await this.productsService.createBySeller(userId, {
      ...dto,

      // Nếu FE gửi file ảnh dạng multipart thì dùng URL từ Cloudinary.
      // Nếu không có file, vẫn cho phép dùng dto.images như logic cũ.
      images: cloudinaryUrls.length > 0 ? cloudinaryUrls : dto.images,
    });

    return { success: true, data: product };
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':id')
  async updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
    @Body() dto: UpdateProductDto,
  ) {
    const data = await this.productsService.updateProduct(id, userId, role, dto);
    return { success: true, data };
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':id')
  async removeProduct(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
  ) {
    const data = await this.productsService.removeProduct(id, userId, role);
    return { success: true, data };
  }

  @UseGuards(AccessTokenGuard)
  @Post(':id/variants/generate')
  async generateVariants(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
    @Body() dto: GenerateVariantsDto,
  ) {
    const data = await this.productsService.generateVariants(
      id,
      userId,
      role,
      dto,
    );

    return { success: true, data };
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':productId/variants/:variantId')
  async updateVariant(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
    @Body() dto: UpdateVariantDto,
  ) {
    const data = await this.productsService.updateVariant(
      productId,
      variantId,
      userId,
      role,
      dto,
    );

    return { success: true, data };
  }
}