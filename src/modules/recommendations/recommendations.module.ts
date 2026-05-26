import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { TagExtractorService } from './services/tag-extractor.service';

import { ProductFavorite } from './entities/product-favorite.entity';
import { ProductInteraction } from './entities/product-interaction.entity';
import { UserCategoryPreference } from './entities/user-category-preference.entity';
import { ProductTag } from './entities/product-tag.entity';
import { UserTagPreference } from './entities/user-tag-preference.entity';
import { UserProductPreference } from './entities/user-product-preference.entity';
import { ProductTrending } from './entities/product-trending.entity';

import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      User,

      ProductFavorite,
      ProductInteraction,
      UserCategoryPreference,

      ProductTag,
      UserTagPreference,
      UserProductPreference,
      ProductTrending,
    ]),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, TagExtractorService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}