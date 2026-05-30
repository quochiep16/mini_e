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
import { Roles } from 'src/common/decorators/roles.decorator';
import { AppRole } from 'src/common/constants/roles';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { GenerateVariantsDto } from './dto/generate-variants.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

import { UserRole } from '../users/enums/user.enum';

const MAX_PRODUCT_IMAGES = 10;
const MAX_IMAGE_SIZE_MB = 2;

const uploadOptions: MulterOptions = {
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

  // PUBLIC: danh sách sản phẩm
  // Nếu categoryId là category cha thì service sẽ lấy cả category con/cháu.
  @Public()
  @Get()
  async list(@Query() q: QueryProductsDto) {
    const data = await this.productsService.findPublic(q);
    return { success: true, data };
  }

  // PUBLIC: sản phẩm theo shop
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

  // SELLER/ADMIN: xem sản phẩm của shop mình
  @Roles(AppRole.ADMIN, AppRole.SELLER)
  @UseGuards(AccessTokenGuard)
  @Get('my-shop')
  async listMyShopProducts(
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
    @Query() query: QueryProductsDto,
  ) {
    const data = await this.productsService.findMyShopProducts(userId, query);
    return { success: true, data };
  }

  // ADMIN: xem toàn bộ sản phẩm
  @Roles(AppRole.ADMIN)
  @UseGuards(AccessTokenGuard)
  @Get('admin/all')
  async listForAdmin(
    @CurrentUser('role') role: UserRole,
    @Query() query: QueryProductsDto,
  ) {
    const data = await this.productsService.findAdminAll(role, query);
    return { success: true, data };
  }

  // SELLER/ADMIN: xem chi tiết quản lý
  // Route này phải đặt TRƯỚC @Get(':id') để tránh nhầm route.
  @Roles(AppRole.ADMIN, AppRole.SELLER)
  @UseGuards(AccessTokenGuard)
  @Get(':id/manage')
  async manageDetail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
  ) {
    const data = await this.productsService.findManageDetail(id, userId, role);
    return { success: true, data };
  }

  // PUBLIC: xem biến thể sản phẩm
  @Public()
  @Get(':id/variants')
  async listPublicVariants(@Param('id', ParseIntPipe) id: number) {
    const data = await this.productsService.listPublicVariants(id);
    return { success: true, data };
  }

  // PUBLIC: chi tiết sản phẩm
  @Public()
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.productsService.findOnePublic(id);
    return { success: true, data };
  }

  // SELLER: tạo sản phẩm cho shop của mình
  @Roles(AppRole.SELLER)
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
      images: cloudinaryUrls.length > 0 ? cloudinaryUrls : dto.images,
    });

    return { success: true, data: product };
  }

  // SELLER/ADMIN: sửa sản phẩm
  @Roles(AppRole.ADMIN, AppRole.SELLER)
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

  // SELLER/ADMIN: xóa sản phẩm
  @Roles(AppRole.ADMIN, AppRole.SELLER)
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

  // SELLER/ADMIN: tạo biến thể
  @Roles(AppRole.ADMIN, AppRole.SELLER)
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

  // SELLER/ADMIN: sửa biến thể
  @Roles(AppRole.ADMIN, AppRole.SELLER)
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