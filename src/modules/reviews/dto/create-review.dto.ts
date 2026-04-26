import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReviewContentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  // FE cũ có thể gửi comment
  @IsOptional()
  @IsString()
  comment?: string;

  // FE mới có thể gửi content
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  images?: string[];
}

// Dùng cho POST /orders/:id/review
export class CreateReviewDto extends ReviewContentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;
}

// Dùng cho POST /product-reviews
export class CreateReviewByOrderDto extends ReviewContentDto {
  @IsUUID()
  orderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;
}