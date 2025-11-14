import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  // Đăng ký shop (USER -> SELLER)
  @Post('register')
  async register(
    @CurrentUser() user: any,
    @Body() dto: CreateShopDto,
  ) {
    const data = await this.shopsService.register(user.id, dto);
    return { success: true, data };
  }

  // Danh sách shop (public) + tìm kiếm cơ bản
  @Get()
  async findAll(@Query() query: QueryShopDto) {
    const data = await this.shopsService.findAll(query);
    return { success: true, data };
  }

  // Shop của tài khoản hiện tại
  @Get('me')
  async myShop(@CurrentUser() user: any) {
    const data = await this.shopsService.findMine(user.id);
    return { success: true, data };
  }

  // Cập nhật shop (owner hoặc ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateShopDto,
  ) {
    const data = await this.shopsService.update(Number(id), user.id, user.role, dto);
    return { success: true, data };
  }

  // Xoá shop (owner hoặc ADMIN) → xoá toàn bộ products + revert role USER
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    await this.shopsService.remove(Number(id), user.id, user.role);
    return { success: true };
  }
}
