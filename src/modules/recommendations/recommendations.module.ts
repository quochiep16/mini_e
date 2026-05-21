import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

import { ProductFavorite } from './entities/product-favorite.entity';
import { ProductInteraction } from './entities/product-interaction.entity';
import { UserCategoryPreference } from './entities/user-category-preference.entity';

// Thêm User entity để ActiveUserGuard có thể dùng UserRepository
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,

      ProductFavorite,
      ProductInteraction,
      UserCategoryPreference,
    ]),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}