// src/modules/cart/dto/add-item.dto.ts
import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class AddItemDto {
  @Type(() => Number)
  @IsInt({ message: 'productId phải là số nguyên' })
  productId: number;

  @Type(() => Number)
  @IsInt({ message: 'variantId phải là số nguyên' })
  variantId: number;

  @Type(() => Number)
  @IsPositive({ message: 'quantity phải > 0' })
  quantity: number = 1;
}
