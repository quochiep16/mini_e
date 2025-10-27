import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserRole } from '.././users/entities/user.entity';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  /** Đăng ký shop (kiểm tra trùng tên) */
  @Post('register')
  async register(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateShopDto,
  ) {
    const shop = await this.shopsService.registerForUser(userId, dto);
    return { success: true, data: shop };
  }

  /** (Tuỳ chọn) API check nhanh tên đã tồn tại chưa: /shops/check-name?name=... */
  @Get('check-name')
  async checkName(@Query('name') name: string) {
    const exists = await this.shopsService.nameExists(String(name || '').trim());
    return { success: true, data: { exists } };
  }

  /** Danh sách shop (public) */
  @Get()
  async findAll(@Query() query: QueryShopDto) {
    const data = await this.shopsService.findAll(query);
    return { success: true, data };
  }

  /** Shop của tài khoản đang đăng nhập */
  @Get('me')
  async myShop(@CurrentUser('sub') userId: number) {
    const shop = await this.shopsService.findMine(userId);
    return { success: true, data: shop };
  }

  /** Cập nhật shop: chỉ chủ shop hoặc ADMIN */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
    @Body() dto: UpdateShopDto,
  ) {
    const shop = await this.shopsService.updateShop(Number(id), userId, role, dto);
    return { success: true, data: shop };
  }

  /** Xoá shop: cascade xoá products & revert role */
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: UserRole,
  ) {
    const res = await this.shopsService.removeShop(Number(id), userId, role);
    return { res };
  }
}
