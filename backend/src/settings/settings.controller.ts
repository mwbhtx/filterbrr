import { Controller, Get, Put, Post, Body, Req } from '@nestjs/common';
import { IsString } from 'class-validator';
import axios from 'axios';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

class VerifyTrackerDto {
  @IsString() tracker_type: string;
  @IsString() username: string;
  @IsString() password: string;
}

const TRACKER_LOGIN_URLS: Record<string, string> = {
  TorrentLeech: 'https://www.torrentleech.org/user/account/login/',
};

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@Req() req: any) {
    return this.settings.get(req.user.userId);
  }

  @Put()
  update(@Req() req: any, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(req.user.userId, dto);
  }

  @Post('trackers/verify')
  async verifyTracker(@Body() dto: VerifyTrackerDto) {
    const loginUrl = TRACKER_LOGIN_URLS[dto.tracker_type];
    if (!loginUrl) {
      return { success: false, error: `No login URL configured for ${dto.tracker_type}` };
    }
    try {
      const res = await axios.post(loginUrl, new URLSearchParams({
        username: dto.username,
        password: dto.password,
      }), {
        maxRedirects: 5,
        timeout: 10000,
        validateStatus: () => true,
      });
      // TorrentLeech redirects to homepage on success, returns error page on failure
      const body = typeof res.data === 'string' ? res.data as string : '';
      const failed = body.includes('incorrect username') ||
                     body.includes('Invalid username') ||
                     body.includes('Login failed') ||
                     body.includes('login_error') ||
                     res.status === 401 ||
                     res.status === 403;
      if (failed) {
        return { success: false, error: 'Invalid username or password' };
      }
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }
}
