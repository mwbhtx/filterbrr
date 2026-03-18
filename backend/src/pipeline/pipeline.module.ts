import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { JobRepository } from './job.repository';
import { DynamoModule } from '../dynamo/dynamo.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [DynamoModule, SettingsModule],
  controllers: [PipelineController],
  providers: [PipelineService, JobRepository],
})
export class PipelineModule {}
