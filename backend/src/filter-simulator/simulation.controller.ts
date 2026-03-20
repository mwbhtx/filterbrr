import { Controller, Post, Body, Req } from '@nestjs/common';
import { FilterSimulatorService } from './simulation.service';
import { IsArray, IsNumber, IsString, IsNotEmpty, IsOptional } from 'class-validator';

class FilterSimulatorRequestDto {
  @IsString() @IsNotEmpty() dataset_path: string;
  @IsNumber() storage_tb: number;
  @IsNumber() avg_seed_days: number;
  @IsOptional() @IsArray() filter_ids?: string[];
  @IsOptional() @IsArray() filters_inline?: any[];
  @IsNumber() avg_ratio: number;
}

@Controller('filter-simulator')
export class FilterSimulatorController {
  constructor(private readonly simulator: FilterSimulatorService) {}

  @Post('run')
  run(@Req() req: any, @Body() dto: FilterSimulatorRequestDto) {
    return this.simulator.run(req.user.userId, {
      datasetKey: dto.dataset_path,
      storageTb: dto.storage_tb,
      avgSeedDays: dto.avg_seed_days,
      filterIds: dto.filter_ids ?? [],
      avgRatio: dto.avg_ratio,
      filtersInline: dto.filters_inline,
    });
  }
}
