import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

class VariantOptionInput {
  @IsNotEmpty({ message: 'name không được để trống' })
  @IsString({ message: 'name phải là chuỗi' })
  @MaxLength(50, { message: 'name tối đa 50 ký tự' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @IsArray({ message: 'values phải là mảng' })
  @ArrayMinSize(1, { message: 'Mỗi option phải có ít nhất 1 value' })
  @ArrayMaxSize(50, { message: 'Mỗi option tối đa 50 value' })
  @IsString({ each: true, message: 'Mỗi value phải là chuỗi' })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v: any) => (typeof v === 'string' ? v.trim() : v)).filter((v: any) => v)
      : value
  )
  values: string[];
}

export class GenerateVariantsDto {
  @IsArray({ message: 'options phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 option' })
  @ArrayMaxSize(5, { message: 'Tối đa 5 option' })
  @ValidateNested({ each: true })
  @Type(() => VariantOptionInput)
  options: VariantOptionInput[];

  // Nếu có sẵn variant, chọn cách xử lý chúng  
  @IsOptional()
  @IsString({ message: 'mode phải là chuỗi' }) // 'replace' | 'add'
  mode?: 'replace' | 'add';
}
