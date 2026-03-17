import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateFilterDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}
