import { Module } from '@nestjs/common';
import { LocalSeedService } from './local-seed.service';

@Module({
  providers: [LocalSeedService],
})
export class LocalSeedModule {}
