import { Controller, Post, Get, Param, Req } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('state')
  getState(@Req() req: any) {
    return this.sync.getSyncState(req.user.userId);
  }

  @Post('push/:filterId')
  pushFilter(@Req() req: any, @Param('filterId') filterId: string) {
    return this.sync.pushFilter(req.user.userId, filterId);
  }

  @Post('pull/:filterId')
  pullFilter(@Req() req: any, @Param('filterId') filterId: string) {
    return this.sync.pullFilter(req.user.userId, filterId);
  }
}
