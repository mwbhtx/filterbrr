import { Controller, Delete, Post, Req } from '@nestjs/common';
import { DemoService } from './demo.service';
import { Public } from '../auth/public.decorator';

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Public()
  @Post()
  create(@Req() req: any) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    return this.demo.getOrCreateSession(ip);
  }

  @Public()
  @Delete()
  reset(@Req() req: any) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    return this.demo.deleteSession(ip);
  }
}
