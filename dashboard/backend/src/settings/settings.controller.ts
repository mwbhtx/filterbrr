import { Controller, Get, Put, Body, Req } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@Req() req: any) {
    return this.settings.get(req.userId ?? 'dev-user');
  }

  @Put()
  update(@Req() req: any, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(req.userId ?? 'dev-user', dto);
  }
}
