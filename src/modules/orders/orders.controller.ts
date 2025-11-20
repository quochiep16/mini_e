import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, PreviewOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller()
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Post('orders/preview')
  async preview(@CurrentUser('sub') userId: number, @Body() dto: PreviewOrderDto) {
    const data = await this.service.preview(userId, dto);
    return { success: true, data };
  }

  @Post('orders')
  async create(@CurrentUser('sub') userId: number, @Req() req: any, @Body() dto: CreateOrderDto) {
    const data = await this.service.create(userId, dto, req.ip);
    return { success: true, data };
  }

  @Get('orders')
  async list(@CurrentUser('sub') userId: number, @Query('page') page?: string, @Query('limit') limit?: string) {
    const p = Math.max(1, parseInt(page || '1', 10));
    const l = Math.max(1, Math.min(100, parseInt(limit || '20', 10)));
    const data = await this.service.listMine(userId, p, l);
    return { success: true, data };
  }

  @Get('orders/:id')
  async detail(@CurrentUser('sub') userId: number, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.detailMine(userId, id);
    return { success: true, data };
  }

  @Post('orders/:id/status')
  @UseGuards(RolesGuard)
  async updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto) {
    const data = await this.service.updateStatus(id, dto);
    return { success: true, data };
  }
}
