// src/modules/cart/cart.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@CurrentUser('sub') userId: number) {
    const data = await this.cartService.getCart(userId);
    return { success: true, data };
  }

  @Post('items')
  async addItem(@CurrentUser('sub') userId: number, @Body() dto: AddItemDto) {
    const data = await this.cartService.addItem(userId, dto);
    return { success: true, data };
  }

  @Patch('items/:itemId')
  async updateItem(
    @CurrentUser('sub') userId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateItemDto,
  ) {
    const data = await this.cartService.updateItem(userId, itemId, dto);
    return { success: true, data };
  }

  @Delete('items/:itemId')
  async removeItem(
    @CurrentUser('sub') userId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    const data = await this.cartService.removeItem(userId, itemId);
    return { success: true, data };
  }

  @Delete()
  async clear(@CurrentUser('sub') userId: number) {
    const data = await this.cartService.clear(userId);
    return { success: true, data };
  }
}
