import { Controller, Post, Body, Req } from '@nestjs/common';
import { SimulationService, SimulationRequest } from './simulation.service';
import { IsArray, IsNumber, IsString, IsNotEmpty } from 'class-validator';

class SimulationRequestDto implements SimulationRequest {
  @IsString() @IsNotEmpty() datasetKey: string;
  @IsNumber() storageTb: number;
  @IsNumber() seedDays: number;
  @IsArray() filterIds: string[];
  @IsNumber() avgRatio: number;
}

@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Post('run')
  run(@Req() req: any, @Body() dto: SimulationRequestDto) {
    return this.simulation.run(req.userId ?? 'dev-user', dto);
  }
}
