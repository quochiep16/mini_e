import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Controller()
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  // User tạo review cho order
  @Post('orders/:id/review')
  async createForOrder(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ) {
    const data = await this.service.createForOrder(userId, id, dto);
    return { success: true, data };
  }

  // User xem review của order đó (nếu đã tạo)
  @Get('orders/:id/review')
  async getByOrder(@CurrentUser('sub') userId: number, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.getByOrder(userId, id);
    return { success: true, data };
  }

  // Public list review theo product (dùng ở ProductDetail)
  @Public()
  @Get('products/:productId/reviews')
  async listByProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const p = Math.max(1, parseInt(page, 10));
    const l = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const data = await this.service.listByProduct(productId, p, l);
    return { success: true, data };
  }
}
