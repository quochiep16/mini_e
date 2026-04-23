// src/modules/cart/dto/add-item.dto.ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class AddItemDto {
  @Type(() => Number)
  @IsInt({ message: 'productId phải là số nguyên' })
  productId !: number;

  @Type(() => Number)
  @IsInt({ message: 'variantId phải là số nguyên' })
  variantId !: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(1, { message: 'quantity phải >= 1' })
  quantity?: number = 1;
}