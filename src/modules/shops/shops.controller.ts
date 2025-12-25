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
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import type { Express } from 'express';

import { cloudinary } from '../../config/cloudinary.config';

import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

import { Roles } from 'src/common/decorators/roles.decorator';
import { AppRole } from 'src/common/constants/roles';

import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';

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

  @Post('register')
  async register(
    @CurrentUser('sub') userSub: number,
    @Body() dto: CreateShopDto,
  ) {
    const userId = Number(userSub);
    const shop = await this.shopsService.registerForUser(userId, dto);
    return { success: true, data: shop };
  }

  @Get('check-name')
  async checkName(@Query('name') name: string) {
    const exists = await this.shopsService.nameExists(String(name || '').trim());
    return { success: true, data: { exists } };
  }

  @Roles(AppRole.ADMIN)
  @Get()
  async findAll(@Query() query: QueryShopDto) {
    const data = await this.shopsService.findAll(query);
    return { success: true, data };
  }

  @Roles(AppRole.SELLER, AppRole.ADMIN)
  @Get('me')
  async myShop(@CurrentUser('sub') userSub: number) {
    const userId = Number(userSub);
    const shop = await this.shopsService.findMine(userId);
    return { success: true, data: shop };
  }

  @Roles(AppRole.SELLER, AppRole.ADMIN)
  @Get('me/orders')
  async myShopOrders(
    @CurrentUser('sub') userSub: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = Number(userSub);
    const p = Math.max(1, parseInt(page || '1', 10));
    const l = Math.max(1, Math.min(100, parseInt(limit || '20', 10)));
    const data = await this.shopsService.listMyShopOrders(userId, p, l);
    return { success: true, data };
  }


  @Roles(AppRole.SELLER, AppRole.ADMIN)
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

  @Roles(AppRole.SELLER, AppRole.ADMIN)
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

  @Public()
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const shop = await this.shopsService.findOnePublic(id);
    return { success: true, data: shop };
  }

  @Roles(AppRole.SELLER, AppRole.ADMIN)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userSub: number,
    @CurrentUser('role') role: AppRole,
    @Body() dto: UpdateShopDto,
  ) {
    const userId = Number(userSub);

    if (role !== AppRole.ADMIN && dto.status !== undefined) {
      throw new ForbiddenException('Chỉ ADMIN được đổi trạng thái shop.');
    }

    const shop =
      role === AppRole.ADMIN
        ? await this.shopsService.updateShopAsAdmin(id, dto)
        : await this.shopsService.updateShopAsOwner(id, userId, dto);

    return { success: true, data: shop };
  }

  @Roles(AppRole.SELLER, AppRole.ADMIN)
  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userSub: number,
    @CurrentUser('role') role: AppRole,
  ) {
    const userId = Number(userSub);

    if (role === AppRole.ADMIN) {
      await this.shopsService.removeShopAsAdmin(id);
    } else {
      await this.shopsService.removeShopAsOwner(id, userId);
    }

    return { success: true };
  }
}
