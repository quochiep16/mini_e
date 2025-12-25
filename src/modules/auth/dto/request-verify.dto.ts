import { IsIn, IsOptional } from 'class-validator';

export class RequestVerifyDto {
  @IsOptional()
  @IsIn(['email', 'phone'], { message: "via chỉ được là 'email' hoặc 'phone'" })
  via?: 'email' | 'phone';
}
