import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateItemDto {
  @Type(() => Number)
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(0, { message: 'quantity phải ≥ 0 (0 = xoá dòng)' })
  quantity: number;
}
