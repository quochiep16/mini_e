import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import {
  CreateReviewByOrderDto,
  CreateReviewDto,
} from './dto/create-review.dto';

function parseOptionalPositiveInt(value?: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException('productId không hợp lệ');
  }

  return parsed;
}

@Controller()
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Post('orders/:id/review')
  async createForOrder(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ) {
    const data = await this.service.createForOrder(userId, id, dto);
    return { success: true, data };
  }

  @Get('orders/:id/review')
  async getByOrder(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('productId') productId?: string,
  ) {
    const parsedProductId = parseOptionalPositiveInt(productId);

    const data = await this.service.getByOrder(userId, id, parsedProductId);
    return { success: true, data };
  }

  @Public()
  @Get('products/:productId/reviews')
  async listByProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

    const data = await this.service.listByProduct(productId, p, l);
    return { success: true, data };
  }

  @Get('product-reviews/by-order/:orderId')
  async getByOrderV2(
    @CurrentUser('sub') userId: number,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query('productId') productId?: string,
  ) {
    const parsedProductId = parseOptionalPositiveInt(productId);

    const data = await this.service.getByOrder(
      userId,
      orderId,
      parsedProductId,
    );

    return { success: true, data };
  }

  @Post('product-reviews')
  async createV2(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateReviewByOrderDto,
  ) {
    const data = await this.service.createForOrder(userId, dto.orderId, dto);
    return { success: true, data };
  }
}