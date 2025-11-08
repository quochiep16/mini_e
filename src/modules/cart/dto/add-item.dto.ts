import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class AddItemDto {
  @Type(() => Number)
  @IsInt({ message: 'productId phải là số nguyên' })
  productId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'variantId phải là số nguyên' })
  variantId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: 'quantity phải > 0' })
  quantity?: number = 1;
}
