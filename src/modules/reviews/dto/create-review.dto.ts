import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  // cũ
  @IsOptional()
  @IsString()
  comment?: string;

  // ✅ mới: FE có thể gửi content thay cho comment
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  images?: string[];
}

// ✅ dùng cho POST /product-reviews { orderId, rating, content? }
export class CreateReviewByOrderDto extends CreateReviewDto {
  @IsUUID()
  orderId: string;
}
