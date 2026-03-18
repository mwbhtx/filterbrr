import { IsString, IsNumber, IsNotEmpty, IsOptional } from 'class-validator';

export class AnalyzeRequestDto {
  @IsString() @IsNotEmpty() source: string;
  @IsOptional() @IsNumber() storage_tb?: number;
  @IsOptional() @IsString() dataset_path?: string;
  @IsOptional() @IsNumber() seed_days?: number;
}
