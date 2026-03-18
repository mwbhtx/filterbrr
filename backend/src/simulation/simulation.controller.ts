import { Controller, Post, Body, Req } from '@nestjs/common';
import { SimulationService, SimulationRequest, FilterDef } from './simulation.service';
import { IsArray, IsNumber, IsString, IsNotEmpty, IsOptional } from 'class-validator';

class SimulationRequestDto {
  @IsString() @IsNotEmpty() dataset_path: string;
  @IsNumber() storage_tb: number;
  @IsNumber() max_seed_days: number;
  @IsOptional() @IsArray() filter_ids?: string[];
  @IsOptional() @IsArray() filters_inline?: FilterDef[];
  @IsNumber() avg_ratio: number;
}

@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Post('run')
  run(@Req() req: any, @Body() dto: SimulationRequestDto) {
    const simReq: SimulationRequest = {
      datasetKey: dto.dataset_path,
      storageTb: dto.storage_tb,
      seedDays: dto.max_seed_days,
      filterIds: dto.filter_ids ?? [],
      avgRatio: dto.avg_ratio,
      filtersInline: dto.filters_inline,
    };
    return this.simulation.run(req.userId ?? 'dev-user', simReq);
  }
}
