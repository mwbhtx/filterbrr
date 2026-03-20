import { Controller, Post, Body, Param, Req } from '@nestjs/common';
import { AutobrrService } from './autobrr.service';
import { SyncService } from '../sync/sync.service';
import { IsString, IsNotEmpty } from 'class-validator';

class TestConnectionDto {
  @IsString() @IsNotEmpty() autobrr_url: string;
  @IsString() @IsNotEmpty() autobrr_api_key: string;
}

@Controller('autobrr')
export class AutobrrController {
  constructor(
    private readonly autobrr: AutobrrService,
    private readonly sync: SyncService,
  ) {}

  @Post('test')
  test(@Body() dto: TestConnectionDto) {
    return this.autobrr.testConnection(dto.autobrr_url, dto.autobrr_api_key);
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
