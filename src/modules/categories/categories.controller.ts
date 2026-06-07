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
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/constants/roles';

import { CategoriesService } from './categories.service';
import {CategorySuggestionService,type SuggestCategoryInput,} from './services/category-suggestion.service';
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
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly categorySuggestionService: CategorySuggestionService,
  ) {}

  /**
   * User / Home / MainLayout:
   * Chỉ lấy category cha active.
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

  /**
   * User / Home / MainLayout:
   * Chỉ lấy category cha active.
   */
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
   * Public tree:
   * Nếu sau này FE cần menu dạng cây.
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
   * Seller/Admin:
   * Dùng ở trang tạo/sửa sản phẩm.
   * Lấy tất cả category active, gồm cha/con/cháu.
   */
  @Get('seller-options')
  @Roles(AppRole.SELLER, AppRole.ADMIN)
  async sellerOptions() {
    const data = await this.categoriesService.findSellerOptions();

    return {
      success: true,
      data,
    };
  }

  /**
   * Seller/Admin:
   * Gợi ý category khi seller nhập tên sản phẩm.
   */
  @Post('suggestions')
  @Roles(AppRole.SELLER, AppRole.ADMIN)
  async suggestCategories(@Body() body: SuggestCategoryInput) {
    const data = await this.categorySuggestionService.suggest(body);

    return {
      success: true,
      data,
    };
  }

  /**
   * Admin:
   * Quản lý toàn bộ category, có search/lọc/phân trang.
   */
  @Get('admin')
  @Roles(AppRole.ADMIN)
  async adminList(@Query() query: SearchCategoriesDto) {
    const data = await this.categoriesService.findAllForAdmin(query);

    return {
      success: true,
      data,
    };
  }

  /**
   * Public detail:
   * Chỉ lấy category active.
   */
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
  @Roles(AppRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  async create(
    @Body() dto: CreateCategoryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl = dto.imageUrl;

    if (file) {
      imageUrl = await uploadBufferToCloudinary(file);
    }

    const data = await this.categoriesService.create({
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
   * Nếu upload file mới thì imageUrl được thay bằng URL Cloudinary.
   * Nếu FE gửi imageUrl rỗng/null thì service sẽ xóa ảnh cũ.
   */
  @Patch(':id')
  @Roles(AppRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl = dto.imageUrl;

    if (file) {
      imageUrl = await uploadBufferToCloudinary(file);
    }

    const data = await this.categoriesService.update(id, {
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
   */
  @Delete(':id')
  @Roles(AppRole.ADMIN)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const data = await this.categoriesService.remove(id);

    return {
      success: true,
      message: 'Xóa category thành công',
      data,
    };
  }
}