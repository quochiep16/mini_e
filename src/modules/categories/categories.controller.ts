import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user.enum';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { SearchCategoriesDto } from './dto/search-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

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
  @Post()
  async create(
    @CurrentUser('role') role: UserRole,
    @Body() dto: CreateCategoryDto,
  ) {
    const data = await this.categoriesService.create(role, dto);

    return {
      success: true,
      message: 'Tạo category thành công',
      data,
    };
  }

  @Patch(':id')
  async update(
    @CurrentUser('role') role: UserRole,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    const data = await this.categoriesService.update(role, id, dto);

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