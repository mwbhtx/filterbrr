import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DynamoModule } from './dynamo/dynamo.module';
import { SettingsModule } from './settings/settings.module';
import { FiltersModule } from './filters/filters.module';
import { S3Module } from './s3/s3.module';
import { DatasetsModule } from './datasets/datasets.module';
import { PipelineModule } from './pipeline/pipeline.module';

@Module({
  imports: [DynamoModule, S3Module, HealthModule, SettingsModule, FiltersModule, DatasetsModule, PipelineModule],
})
export class AppModule {}
