import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { FiltersModule } from '../filters/filters.module';
import { SettingsModule } from '../settings/settings.module';
import { AutobrrModule } from '../autobrr/autobrr.module';

@Module({
  imports: [FiltersModule, SettingsModule, AutobrrModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
