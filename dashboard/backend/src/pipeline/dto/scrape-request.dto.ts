import { IsString, IsNumber, IsOptional, IsNotEmpty } from 'class-validator';

export class ScrapeRequestDto {
  @IsString() @IsNotEmpty() trackerId: string;
  @IsString() @IsNotEmpty() category: string;
  @IsNumber() days: number;
  @IsOptional() @IsNumber() startPage?: number;
  @IsOptional() @IsNumber() delay?: number;
}
