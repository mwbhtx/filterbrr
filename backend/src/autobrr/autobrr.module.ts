import { Module, forwardRef } from '@nestjs/common';
import { AutobrrService } from './autobrr.service';
import { AutobrrController } from './autobrr.controller';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [forwardRef(() => SyncModule)],
  controllers: [AutobrrController],
  providers: [AutobrrService],
  exports: [AutobrrService],
})
export class AutobrrModule {}
