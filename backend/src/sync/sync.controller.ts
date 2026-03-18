import { Controller, Post, Get, Param, Req } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('state')
  getState(@Req() req: any) {
    return this.sync.getSyncState(req.userId ?? 'dev-user');
  }

  @Post('push/:filterId')
  pushFilter(@Req() req: any, @Param('filterId') filterId: string) {
    return this.sync.pushFilter(req.userId ?? 'dev-user', filterId);
  }
}
