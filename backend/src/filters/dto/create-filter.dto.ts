import { IsString, IsObject, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateFilterDto {
  @IsString() @IsNotEmpty() name: string;
  @IsObject() data: Record<string, unknown>;
  @IsOptional() @IsString() source?: string;
}
