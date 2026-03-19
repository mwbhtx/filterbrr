import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core'; // DemoWriteGuard runs after CognitoAuthGuard
import { AuthModule } from './auth/auth.module';
import { CognitoAuthGuard } from './auth/cognito-auth.guard';
import { DemoWriteGuard } from './auth/demo.guard';
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
import { CryptoModule } from './crypto/crypto.module';

@Module({
  imports: [AuthModule, CryptoModule, DynamoModule, S3Module, HealthModule, SettingsModule, FiltersModule, DatasetsModule, PipelineModule, SimulationModule, AutobrrModule, SyncModule],
  providers: [
    { provide: APP_GUARD, useClass: CognitoAuthGuard },
    { provide: APP_GUARD, useClass: DemoWriteGuard },
  ],
})
export class AppModule {}
