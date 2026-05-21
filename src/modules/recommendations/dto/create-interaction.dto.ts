import { IsEnum, IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { InteractionEvent } from '../enums/interaction-event.enum';

export class CreateInteractionDto {
  // ID sản phẩm mà user vừa tương tác
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  // Loại hành vi: CLICK, VIEW_DETAIL, ADD_TO_CART, FAVORITE...
  @IsEnum(InteractionEvent)
  eventType: InteractionEvent;

  // Dữ liệu phụ nếu sau này cần lưu thêm, ví dụ source: home/product_detail
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}