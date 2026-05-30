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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../users/enums/user.enum';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { SearchCategoriesDto } from './dto/search-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const MAX_CATEGORY_IMAGE_SIZE_MB = 2;

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
    fileSize: MAX_CATEGORY_IMAGE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
};

function uploadBufferToCloudinary(file: Express.Multer.File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return reject(
        new BadRequestException('Thiếu CLOUDINARY_CLOUD_NAME trên server'),
      );
    }

    if (!process.env.CLOUDINARY_API_KEY) {
      return reject(
        new BadRequestException('Thiếu CLOUDINARY_API_KEY trên server'),
      );
    }

    if (!process.env.CLOUDINARY_API_SECRET) {
      return reject(
        new BadRequestException('Thiếu CLOUDINARY_API_SECRET trên server'),
      );
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'mini-e/categories',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary category upload error:', error);

          return reject(
            new BadRequestException(
              error.message || 'Upload ảnh category lên Cloudinary thất bại',
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

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * Public cho trang home:
   * chỉ lấy category gốc trên cùng parent_id IS NULL và is_active = true.
   */
  @Public()
  @Get()
  async homeAlias() {
    const data = await this.categoriesService.findHomeRootCategories();

    return {
      success: true,
      data,
    };
  }

  @Public()
  @Get('home')
  async home() {
    const data = await this.categoriesService.findHomeRootCategories();

    return {
      success: true,
      data,
    };
  }

  /**
   * Public tree nếu sau này FE cần menu dạng cây.
   * Trang home không nên dùng API này nếu chỉ muốn category cha.
   */
  @Public()
  @Get('tree')
  async tree() {
    const data = await this.categoriesService.findActiveTree();

    return {
      success: true,
      data,
    };
  }

  /**
   * Seller/Admin dùng khi thêm sản phẩm:
   * lấy tất cả category active, gồm cha/con/cháu.
   */
  @Get('seller-options')
  async sellerOptions(@CurrentUser('role') role: UserRole) {
    const data = await this.categoriesService.findSellerOptions(role);

    return {
      success: true,
      data,
    };
  }

  /**
   * Admin quản lý category:
   * lấy tất cả category, có search/lọc/phân trang.
   */
  @Get('admin')
  async adminList(
    @CurrentUser('role') role: UserRole,
    @Query() query: SearchCategoriesDto,
  ) {
    const data = await this.categoriesService.findAllForAdmin(role, query);

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

  /**
   * Admin tạo category.
   * FE gửi multipart/form-data, field ảnh tên là: image
   */
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

  /**
   * Admin sửa category.
   * Nếu gửi imageUrl = null hoặc '' thì xóa ảnh cũ.
   * Nếu upload file mới thì imageUrl được thay bằng URL Cloudinary.
   */
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

  /**
   * Admin xóa mềm category.
   * Khi xóa mềm:
   * - category con sẽ được đưa lên thành category gốc
   * - sản phẩm đang gắn category này sẽ được set categoryId = null
   */
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