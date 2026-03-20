import { Module } from '@nestjs/common';
import { FilterSimulatorService } from './simulation.service';
import { FilterSimulatorController } from './simulation.controller';
import { FiltersModule } from '../filters/filters.module';

@Module({
  imports: [FiltersModule],
  controllers: [FilterSimulatorController],
  providers: [FilterSimulatorService],
})
export class FilterSimulatorModule {}
