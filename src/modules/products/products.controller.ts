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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';

import { cloudinary } from '../../config/cloudinary.config';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { GenerateVariantsDto } from './dto/generate-variants.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

import { UserRole } from '../users/enums/user.enum';

const uploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(process.cwd(), 'uploads', 'products');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${randomBytes(6).toString('hex')}`;
      cb(null, unique + extname(file.originalname).toLowerCase());
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new BadRequestException('Chỉ chấp nhận ảnh jpeg, png, webp, gif'), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
};

@UseGuards(AccessTokenGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  async list(@Query() query: QueryProductsDto) {
    const data = await this.productsService.findPublic(query);
    return { success: true, data };
  }

  @Public()
  @Get('by-shop/:shopId')
  async listByShop(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const data = await this.productsService.findByShop(shopId, Number(page), Number(limit));
    return { success: true, data };
  }

  @Public()
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.productsService.findOnePublic(id);
    return { success: true, data };
  }

  @Post()
  @UseInterceptors(FilesInterceptor('images', 10, uploadOptions))
  async create(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateProductDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const localPaths = files
      .map((file) => file?.path)
      .filter((path): path is string => Boolean(path));

    try {
      const uploadedUrls: string[] = [];

      if (files.length > 0) {
        const uploadResults = await Promise.all(
          files.map((file) =>
            cloudinary.uploader.upload(file.path, {
              folder: 'mini-e/products',
            }),
          ),
        );

        for (const result of uploadResults) {
          uploadedUrls.push(result.secure_url);
        }
      }

      const product = await this.productsService.createBySeller(userId, {
        ...dto,
        images: uploadedUrls.length > 0 ? uploadedUrls : dto.images,
      });

      return { success: true, data: product };
    } finally {
      if (localPaths.length > 0) {
        await Promise.allSettled(localPaths.map((path) => fs.promises.unlink(path)));
      }
    }
  }

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

  @Delete(':id')
  async removeProduct(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
  ) {
    const data = await this.productsService.removeProduct(id, userId, role);
    return { success: true, data };
  }

  @Post(':id/variants/generate')
  async generateVariants(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
    @Body() dto: GenerateVariantsDto,
  ) {
    const data = await this.productsService.generateVariants(id, userId, role, dto);
    return { success: true, data };
  }

  @Get(':id/variants')
  async listVariants(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
  ) {
    const data = await this.productsService.listVariants(id, userId, role);
    return { success: true, data };
  }

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