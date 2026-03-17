import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class AnalyseRequestDto {
  @IsString() @IsNotEmpty() datasetKey: string;
  @IsNumber() storageTb: number;
  @IsNumber() seedDays: number;
  @IsString() @IsNotEmpty() source: string;
}
