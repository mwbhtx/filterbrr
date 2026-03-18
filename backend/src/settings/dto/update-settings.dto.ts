import { IsString, IsOptional, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class TrackerDto {
  @IsString() id: string;
  @IsString() tracker_type: string;
  @IsString() username: string;
  @IsString() password: string;
}

export class SeedboxDto {
  @IsString() id: string;
  @IsString() name: string;
  @IsNumber() storage_tb: number;
}

export class UpdateSettingsDto {
  @IsOptional() @IsString() autobrr_url?: string;
  @IsOptional() @IsString() autobrr_api_key?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TrackerDto) trackers?: TrackerDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SeedboxDto) seedboxes?: SeedboxDto[];
}
