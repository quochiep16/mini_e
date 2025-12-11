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
  UploadedFile,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import type { Express } from 'express';

import { cloudinary } from '../../config/cloudinary.config'; // ✅ dùng config chung

import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';

import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';
import { UserRole } from '../users/entities/user.entity';

// ==== cấu hình upload 1 ảnh cho shop (lưu tạm vào uploads/shops) ====
const shopUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const dir = join(process.cwd(), 'uploads', 'shops');
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
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
};

@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  /** Đăng ký shop (kiểm tra trùng tên) */
  @Post('register')
  async register(
    @CurrentUser('sub') userSub: number,
    @Body() dto: CreateShopDto,
  ) {
    const userId = Number(userSub);
    const shop = await this.shopsService.registerForUser(userId, dto);
    return { success: true, data: shop };
  }

  /** API check nhanh tên đã tồn tại chưa: /shops/check-name?name=. */
  @Public()
  @Get('check-name')
  async checkName(@Query('name') name: string) {
    const exists = await this.shopsService.nameExists(String(name || '').trim());
    return { success: true, data: { exists } };
  }

  /** Danh sách shop (public / admin), kèm stats */
  @Public()
  @Get()
  async findAll(@Query() query: QueryShopDto) {
    const data = await this.shopsService.findAll(query);
    return { success: true, data };
  }

  /** Shop của tài khoản đang đăng nhập (kèm stats) */
  @Get('me')
  async myShop(@CurrentUser('sub') userSub: number) {
    const userId = Number(userSub);
    const shop = await this.shopsService.findMine(userId);
    return { success: true, data: shop };
  }

  /** Upload logo cho shop của chính mình */
  @Patch('me/logo')
  @UseInterceptors(FileInterceptor('file', shopUploadOptions))
  async uploadLogo(
    @CurrentUser('sub') userSub: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = Number(userSub);
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh.');

    const uploaded = await cloudinary.uploader.upload((file as any).path, {
      folder: 'mini-e/shops/logo',
    });

    const shop = await this.shopsService.updateLogoUrl(userId, uploaded.secure_url);
    return { success: true, data: shop };
  }

  /** Upload cover cho shop của chính mình */
  @Patch('me/cover')
  @UseInterceptors(FileInterceptor('file', shopUploadOptions))
  async uploadCover(
    @CurrentUser('sub') userSub: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = Number(userSub);
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh.');

    const uploaded = await cloudinary.uploader.upload((file as any).path, {
      folder: 'mini-e/shops/cover',
    });

    const shop = await this.shopsService.updateCoverUrl(userId, uploaded.secure_url);
    return { success: true, data: shop };
  }

  /** Lấy 1 shop theo id (kèm stats) */
  @Public()
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const shop = await this.shopsService.findOne(id);
    return { success: true, data: shop };
  }

  /** Cập nhật shop: chủ shop hoặc ADMIN */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userSub: number,
    @CurrentUser('role') role: UserRole,
    @Body() dto: UpdateShopDto,
  ) {
    const userId = Number(userSub);
    const shop = await this.shopsService.updateShop(id, userId, role, dto);
    return { success: true, data: shop };
  }

  /** Xoá shop: cascade xoá products & revert role */
  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userSub: number,
    @CurrentUser('role') role: UserRole,
  ) {
    const userId = Number(userSub);
    await this.shopsService.removeShop(id, userId, role);
    return { success: true };
  }
}
