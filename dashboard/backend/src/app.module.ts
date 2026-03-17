import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DynamoModule } from './dynamo/dynamo.module';
import { SettingsModule } from './settings/settings.module';
import { FiltersModule } from './filters/filters.module';
import { S3Module } from './s3/s3.module';
import { DatasetsModule } from './datasets/datasets.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { SimulationModule } from './simulation/simulation.module';
import { AutobrrModule } from './autobrr/autobrr.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [DynamoModule, S3Module, HealthModule, SettingsModule, FiltersModule, DatasetsModule, PipelineModule, SimulationModule, AutobrrModule, SyncModule],
})
export class AppModule {}
