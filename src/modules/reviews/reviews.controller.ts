import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewByOrderDto, CreateReviewDto } from './dto/create-review.dto';

@Controller()
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  // =========================
  // API CŨ (đang có sẵn)
  // =========================

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

  // =========================
  // ✅ API MỚI (đúng theo FE bạn chốt)
  // =========================

  // GET /product-reviews/by-order/:orderId
  @Get('product-reviews/by-order/:orderId')
  async getByOrderV2(
    @CurrentUser('sub') userId: number,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const data = await this.service.getByOrder(userId, orderId);
    return { success: true, data };
  }

  // POST /product-reviews { orderId, rating, content? }
  @Post('product-reviews')
  async createV2(@CurrentUser('sub') userId: number, @Body() dto: CreateReviewByOrderDto) {
    if (!dto.orderId) throw new BadRequestException('orderId is required');
    const data = await this.service.createForOrder(userId, dto.orderId, dto);
    return { success: true, data };
  }
}
