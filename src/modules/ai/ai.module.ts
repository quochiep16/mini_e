import { Module } from '@nestjs/common';
import { SentimentService } from './sentiment.service';
import { RecommendationService } from './recommendation.service';

@Module({
  providers: [SentimentService, RecommendationService]
})
export class AiModule {}
