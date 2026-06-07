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
import { Public } from '../../common/decorators/public.decorator';

@Controller('recommendations')
@UseGuards(AccessTokenGuard, ActiveUserGuard)
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  private getUserId(user: any): number {
    const id = user?.id ?? user?.userId ?? user?.sub;

    if (!id) {
      throw new UnauthorizedException('Không xác định được người dùng');
    }

    return Number(id);
  }

  private getOptionalUserId(user: any): number | null {
    const id = user?.id ?? user?.userId ?? user?.sub;

    if (!id) {
      return null;
    }

    const userId = Number(id);
    return Number.isFinite(userId) && userId > 0 ? userId : null;
  }

  @Public()
  @Get('trending-products')
  getTrendingProducts(
    @CurrentUser() user: any,
    @Query() query: RecommendationQueryDto,
  ) {
    const userId = this.getOptionalUserId(user);
    return this.recommendationsService.getTrendingProducts(userId, query);
  }

  @Post('events')
  recordEvent(
    @CurrentUser() user: any,
    @Body() dto: CreateInteractionDto,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.recordEvent(userId, dto);
  }

  @Get('products')
  getRecommendedProducts(
    @CurrentUser() user: any,
    @Query() query: RecommendationQueryDto,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.getRecommendedProducts(userId, query);
  }

  @Get('debug/product-scores')
  getRecommendationProductScores(
    @CurrentUser() user: any,
    @Query() query: RecommendationQueryDto,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.getRecommendationProductScores(
      userId,
      query,
    );
  }

  @Post('favorites/:productId')
  addFavorite(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.addFavorite(userId, productId);
  }

  @Delete('favorites/:productId')
  removeFavorite(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.removeFavorite(userId, productId);
  }

  @Get('favorites')
  getFavorites(
    @CurrentUser() user: any,
    @Query() query: RecommendationQueryDto,
  ) {
    const userId = this.getUserId(user);
    return this.recommendationsService.getFavorites(userId, query);
  }

  @Get(['preferences', 'me/preferences'])
  getMyCategoryPreferences(@CurrentUser() user: any) {
    const userId = this.getUserId(user);
    return this.recommendationsService.getMyCategoryPreferences(userId);
  }
}
