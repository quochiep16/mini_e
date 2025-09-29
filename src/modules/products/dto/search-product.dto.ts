import { IsString, IsOptional, IsNumber, IsInt, Min, Max } from 'class-validator';

export class SearchProductDto {
  @IsString()
  @IsOptional()
  query?: string;

  @IsInt()
  @IsOptional()
  categoryId?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  maxPrice?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  page?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;
}