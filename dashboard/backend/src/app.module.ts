import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DynamoModule } from './dynamo/dynamo.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [DynamoModule, HealthModule, SettingsModule],
})
export class AppModule {}
