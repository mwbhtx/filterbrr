import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CognitoAuthGuard } from './auth/cognito-auth.guard';
import { RoleGuard } from './auth/role.guard';
import { HealthModule } from './health/health.module';
import { DynamoModule } from './dynamo/dynamo.module';
import { SettingsModule } from './settings/settings.module';
import { FiltersModule } from './filters/filters.module';
import { S3Module } from './s3/s3.module';
import { DatasetsModule } from './datasets/datasets.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { FilterSimulatorModule } from './filter-simulator/simulation.module';
import { AutobrrModule } from './autobrr/autobrr.module';
import { SyncModule } from './sync/sync.module';
import { CryptoModule } from './crypto/crypto.module';
import { DemoModule } from './demo/demo.module';
import { LocalSeedModule } from './local-seed/local-seed.module';

const optionalModules = process.env.NODE_ENV === 'local' ? [LocalSeedModule] : [];

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]), AuthModule, CryptoModule, DynamoModule, S3Module, HealthModule, SettingsModule, FiltersModule, DatasetsModule, PipelineModule, FilterSimulatorModule, AutobrrModule, SyncModule, DemoModule, ...optionalModules],
  providers: [
    { provide: APP_GUARD, useClass: CognitoAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class AppModule {}
