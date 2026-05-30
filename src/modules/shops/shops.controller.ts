import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';
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
import { UpdateShopOrderShippingDto } from './dto/update-shop-order-shipping.dto';
import { ShopStatus } from './entities/shop.entity';

const MAX_SHOP_IMAGE_SIZE_MB = 5;

const shopUploadOptions: MulterOptions = {
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
    fileSize: MAX_SHOP_IMAGE_SIZE_MB * 1024 * 1024,
    files: 2,
  },
};

function uploadShopImageToCloudinary(
  file: Express.Multer.File,
  folder: string,
  label: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return reject(
        new BadRequestException('Thiếu CLOUDINARY_CLOUD_NAME trên server deploy'),
      );
    }

    if (!process.env.CLOUDINARY_API_KEY) {
      return reject(
        new BadRequestException('Thiếu CLOUDINARY_API_KEY trên server deploy'),
      );
    }

    if (!process.env.CLOUDINARY_API_SECRET) {
      return reject(
        new BadRequestException('Thiếu CLOUDINARY_API_SECRET trên server deploy'),
      );
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          console.error(`Cloudinary ${label} upload error:`, error);

          return reject(
            new BadRequestException(
              error.message || `Upload ${label} lên Cloudinary thất bại`,
            ),
          );
        }

        if (!result?.secure_url) {
          return reject(
            new BadRequestException('Cloudinary không trả về secure_url'),
          );
        }

        resolve(result.secure_url);
      },
    );

    uploadStream.end(file.buffer);
  });
}

@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Roles(AppRole.USER, AppRole.ADMIN)
  @Post('register')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
      ],
      shopUploadOptions,
    ),
  )
  async register(
    @CurrentUser('sub') userSub: number,
    @Body() dto: CreateShopDto,
    @UploadedFiles()
    files?: {
      logo?: Express.Multer.File[];
      cover?: Express.Multer.File[];
    },
  ) {
    const userId = Number(userSub);

    const logoFile = files?.logo?.[0];
    const coverFile = files?.cover?.[0];

    let logoUrl = dto.logoUrl;
    let coverUrl = dto.coverUrl;

    if (logoFile) {
      logoUrl = await uploadShopImageToCloudinary(
        logoFile,
        'mini-e/shops/logo',
        'logo shop',
      );
    }

    if (coverFile) {
      coverUrl = await uploadShopImageToCloudinary(
        coverFile,
        'mini-e/shops/cover',
        'ảnh bìa shop',
      );
    }

    const shop = await this.shopsService.registerForUser(userId, {
      ...dto,
      logoUrl,
      coverUrl,
    });

    return {
      success: true,
      message: 'Đăng ký shop thành công, vui lòng chờ admin duyệt.',
      data: shop,
    };
  }

  @Public()
  @Get('check-name')
  async checkName(@Query('name') name: string) {
    const exists = await this.shopsService.nameExists(String(name || '').trim());

    return {
      success: true,
      data: { exists },
    };
  }

  @Roles(AppRole.ADMIN)
  @Get('admin/all')
  async findAllForAdmin(@Query() query: QueryShopDto) {
    const data = await this.shopsService.findAll(query);

    return {
      success: true,
      data,
    };
  }

  @Public()
  @Get()
  async findPublic(@Query() query: QueryShopDto) {
    const data = await this.shopsService.findAll({
      ...query,
      status: ShopStatus.ACTIVE,
    });

    return {
      success: true,
      data,
    };
  }

  @Roles(AppRole.USER, AppRole.SELLER, AppRole.ADMIN)
  @Get('me')
  async myShop(@CurrentUser('sub') userSub: number) {
    const userId = Number(userSub);
    const shop = await this.shopsService.findMine(userId);

    return {
      success: true,
      data: shop,
    };
  }

  @Roles(AppRole.SELLER, AppRole.ADMIN)
  @Get('me/orders')
  async myShopOrders(
    @CurrentUser('sub') userSub: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('range') range?: string,
  ) {
    const userId = Number(userSub);
    const p = Math.max(1, parseInt(page || '1', 10));
    const l = Math.max(1, Math.min(1000, parseInt(limit || '20', 10)));

    const data = await this.shopsService.listMyShopOrders(userId, p, l, range);

    return {
      success: true,
      data,
    };
  }

  @Roles(AppRole.SELLER, AppRole.ADMIN)
  @Get('me/orders/:id')
  async myShopOrderDetail(
    @CurrentUser('sub') userSub: number,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = Number(userSub);
    const data = await this.shopsService.getMyShopOrderDetail(userId, id);

    return {
      success: true,
      data,
    };
  }

  @Roles(AppRole.SELLER, AppRole.ADMIN)
  @Patch('me/orders/:id/shipping-status')
  async updateMyShopOrderShippingStatus(
    @CurrentUser('sub') userSub: number,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopOrderShippingDto,
  ) {
    const userId = Number(userSub);

    const data = await this.shopsService.updateMyShopOrderShippingStatus(
      userId,
      id,
      dto.shippingStatus,
    );

    return {
      success: true,
      data,
    };
  }

  @Roles(AppRole.USER, AppRole.SELLER, AppRole.ADMIN)
  @Patch('me/logo')
  @UseInterceptors(FileInterceptor('file', shopUploadOptions))
  async uploadLogo(
    @CurrentUser('sub') userSub: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = Number(userSub);

    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh logo.');
    }

    const logoUrl = await uploadShopImageToCloudinary(
      file,
      'mini-e/shops/logo',
      'logo shop',
    );

    const shop = await this.shopsService.updateLogoUrl(userId, logoUrl);

    return {
      success: true,
      message: 'Cập nhật logo shop thành công',
      data: shop,
    };
  }

  @Roles(AppRole.USER, AppRole.SELLER, AppRole.ADMIN)
  @Patch('me/cover')
  @UseInterceptors(FileInterceptor('file', shopUploadOptions))
  async uploadCover(
    @CurrentUser('sub') userSub: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = Number(userSub);

    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh bìa.');
    }

    const coverUrl = await uploadShopImageToCloudinary(
      file,
      'mini-e/shops/cover',
      'ảnh bìa shop',
    );

    const shop = await this.shopsService.updateCoverUrl(userId, coverUrl);

    return {
      success: true,
      message: 'Cập nhật ảnh bìa shop thành công',
      data: shop,
    };
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const shop = await this.shopsService.findOnePublic(id);

    return {
      success: true,
      data: shop,
    };
  }

  @Roles(AppRole.USER, AppRole.SELLER, AppRole.ADMIN)
  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
      ],
      shopUploadOptions,
    ),
  )
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userSub: number,
    @CurrentUser('role') role: AppRole,
    @Body() dto: UpdateShopDto,
    @UploadedFiles()
    files?: {
      logo?: Express.Multer.File[];
      cover?: Express.Multer.File[];
    },
  ) {
    const userId = Number(userSub);

    if (role !== AppRole.ADMIN && dto.status !== undefined) {
      throw new ForbiddenException('Chỉ ADMIN được đổi trạng thái shop.');
    }

    const logoFile = files?.logo?.[0];
    const coverFile = files?.cover?.[0];

    let logoUrl = dto.logoUrl;
    let coverUrl = dto.coverUrl;

    if (logoFile) {
      logoUrl = await uploadShopImageToCloudinary(
        logoFile,
        'mini-e/shops/logo',
        'logo shop',
      );
    }

    if (coverFile) {
      coverUrl = await uploadShopImageToCloudinary(
        coverFile,
        'mini-e/shops/cover',
        'ảnh bìa shop',
      );
    }

    const payload: UpdateShopDto = {
      ...dto,
      logoUrl,
      coverUrl,
    };

    const shop =
      role === AppRole.ADMIN
        ? await this.shopsService.updateShopAsAdmin(id, payload)
        : await this.shopsService.updateShopAsOwner(id, userId, payload);

    return {
      success: true,
      message: 'Cập nhật shop thành công',
      data: shop,
    };
  }

  @Roles(AppRole.USER, AppRole.SELLER, AppRole.ADMIN)
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

    return {
      success: true,
      message: 'Xóa shop thành công',
    };
  }
  @Roles(AppRole.ADMIN)
  @Get('admin/stats')
  async getAdminStats() {
    const data = await this.shopsService.getAdminStats();

    return {
      success: true,
      data,
    };
  }
}