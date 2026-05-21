import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { ActiveUserGuard } from '../../common/guards/active-user.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('recommendations')
@UseGuards(AccessTokenGuard, ActiveUserGuard)
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  /**
   * Lấy user id từ payload JWT.
   * Tùy project, payload có thể là id, userId hoặc sub.
   */
  private getUserId(user: any): number {
    const id = user?.id ?? user?.userId ?? user?.sub;

    if (!id) {
      throw new UnauthorizedException('Không xác định được người dùng');
    }

    return Number(id);
  }

  /**
   * Ghi nhận hành vi:
   * CLICK, VIEW_DETAIL, ADD_TO_CART, PURCHASE...
   *
   * POST /recommendations/events
   */
  @Post('events')
  recordEvent(
    @CurrentUser() user: any,
    @Body() dto: CreateInteractionDto,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.recordEvent(userId, dto);
  }

  /**
   * Lấy sản phẩm gợi ý cho trang home.
   *
   * GET /recommendations/products?page=1&limit=20
   */
  @Get('products')
  getRecommendedProducts(
    @CurrentUser() user: any,
    @Query() query: RecommendationQueryDto,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.getRecommendedProducts(userId, query);
  }

  /**
   * Thêm sản phẩm vào yêu thích.
   *
   * POST /recommendations/favorites/:productId
   */
  @Post('favorites/:productId')
  addFavorite(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.addFavorite(userId, productId);
  }

  /**
   * Bỏ sản phẩm khỏi yêu thích.
   *
   * DELETE /recommendations/favorites/:productId
   */
  @Delete('favorites/:productId')
  removeFavorite(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.removeFavorite(userId, productId);
  }

  /**
   * Lấy danh sách sản phẩm user đã yêu thích.
   *
   * GET /recommendations/favorites?page=1&limit=20
   */
  @Get('favorites')
  getFavorites(
    @CurrentUser() user: any,
    @Query() query: RecommendationQueryDto,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.getFavorites(userId, query);
  }

  /**
   * Xem điểm sở thích category của user.
   * API này dùng để test.
   *
   * GET /recommendations/preferences
   */
  @Get('preferences')
  getMyCategoryPreferences(@CurrentUser() user: any) {
    const userId = this.getUserId(user);
    return this.recommendationsService.getMyCategoryPreferences(userId);
  }
}