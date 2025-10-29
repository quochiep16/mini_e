import { IsInt, Min, IsPositive } from 'class-validator';

export class AddItemDto {
  @IsInt() @Min(1)
  variantId: number; // ID biến thể sản phẩm

  @IsInt() @IsPositive()
  quantity: number; // Số lượng thêm vào giỏ
}
