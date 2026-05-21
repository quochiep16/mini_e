import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';
import type { Express } from 'express';

import { cloudinary } from '../../config/cloudinary.config';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user.enum';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { SearchCategoriesDto } from './dto/search-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const MAX_CATEGORY_IMAGE_SIZE_MB = 2;

const uploadOptions: MulterOptions = {
  // Dùng memoryStorage giống products.controller:
  // ảnh nằm trong RAM qua file.buffer,
  // không lưu vào thư mục local.
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
    fileSize: MAX_CATEGORY_IMAGE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
};

// Upload ảnh từ RAM buffer lên Cloudinary.
function uploadBufferToCloudinary(file: Express.Multer.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'mini-e/categories',
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

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // Public: user, seller, guest đều xem được category active
  @Public()
  @Get()
  async list(@Query() query: SearchCategoriesDto) {
    const data = await this.categoriesService.findAllPublic(query);

    return {
      success: true,
      data,
    };
  }

  @Public()
  @Get('tree')
  async tree() {
    const data = await this.categoriesService.findTreePublic();

    return {
      success: true,
      data,
    };
  }

  @Public()
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.categoriesService.findOnePublic(id);

    return {
      success: true,
      data,
    };
  }

  // Admin only
  // FE gửi multipart/form-data với field ảnh tên là: image
  @Post()
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  async create(
    @CurrentUser('role') role: UserRole,
    @Body() dto: CreateCategoryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl = dto.imageUrl;

    if (file) {
      imageUrl = await uploadBufferToCloudinary(file);
    }

    const data = await this.categoriesService.create(role, {
      ...dto,
      imageUrl,
    });

    return {
      success: true,
      message: 'Tạo category thành công',
      data,
    };
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  async update(
    @CurrentUser('role') role: UserRole,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl = dto.imageUrl;

    if (file) {
      imageUrl = await uploadBufferToCloudinary(file);
    }

    const data = await this.categoriesService.update(role, id, {
      ...dto,
      imageUrl,
    });

    return {
      success: true,
      message: 'Cập nhật category thành công',
      data,
    };
  }

  @Delete(':id')
  async remove(
    @CurrentUser('role') role: UserRole,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.categoriesService.remove(role, id);

    return {
      success: true,
      message: 'Xóa category thành công',
      data,
    };
  }
}