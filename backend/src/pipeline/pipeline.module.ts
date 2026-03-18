import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { WorkerService } from './worker.service';
import { SqsService } from './sqs.service';
import { JobRepository } from './job.repository';
import { DynamoModule } from '../dynamo/dynamo.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [DynamoModule, SettingsModule],
  controllers: [PipelineController],
  providers: [PipelineService, WorkerService, SqsService, JobRepository],
})
export class PipelineModule {}
