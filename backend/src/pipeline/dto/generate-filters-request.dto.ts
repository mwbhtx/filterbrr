import { IsString, IsNumber, IsNotEmpty, IsOptional } from 'class-validator';

export class GenerateFiltersRequestDto {
  @IsString() @IsNotEmpty() source: string;
  @IsOptional() @IsNumber() storage_tb?: number;
  @IsOptional() @IsString() dataset_path?: string;
  @IsOptional() @IsNumber() avg_seed_days?: number;
}
