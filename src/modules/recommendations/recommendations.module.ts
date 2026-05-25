import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { TagExtractorService } from './services/tag-extractor.service';

import { ProductFavorite } from './entities/product-favorite.entity';
import { ProductInteraction } from './entities/product-interaction.entity';
import { UserCategoryPreference } from './entities/user-category-preference.entity';
import { ProductTag } from './entities/product-tag.entity';
import { UserTagPreference } from './entities/user-tag-preference.entity';
import { ProductTrending } from './entities/product-trending.entity';

import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,

      ProductFavorite,
      ProductInteraction,
      UserCategoryPreference,

      ProductTag,
      UserTagPreference,
      ProductTrending,
    ]),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, TagExtractorService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}