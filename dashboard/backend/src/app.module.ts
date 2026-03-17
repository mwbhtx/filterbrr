import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DynamoModule } from './dynamo/dynamo.module';

@Module({
  imports: [DynamoModule, HealthModule],
})
export class AppModule {}
