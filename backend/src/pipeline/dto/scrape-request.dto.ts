import { IsString, IsNumber, IsOptional, IsNotEmpty, IsIn } from 'class-validator';

export class ScrapeRequestDto {
  @IsOptional() @IsString() tracker_id?: string;
  @IsString() @IsNotEmpty() category: string;
  @IsNumber() @IsIn([30, 60, 90]) days: number;
  @IsOptional() @IsNumber() start_page?: number;
}
