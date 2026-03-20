import { Module, forwardRef } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { FiltersModule } from '../filters/filters.module';
import { SettingsModule } from '../settings/settings.module';
import { AutobrrModule } from '../autobrr/autobrr.module';

@Module({
  imports: [FiltersModule, SettingsModule, forwardRef(() => AutobrrModule)],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
