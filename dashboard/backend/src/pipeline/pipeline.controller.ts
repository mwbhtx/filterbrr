import { Controller, Post, Get, Param, Body, Req, NotFoundException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { ScrapeRequestDto } from './dto/scrape-request.dto';
import { AnalyseRequestDto } from './dto/analyse-request.dto';

@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Post('scrape')
  scrape(@Req() req: any, @Body() dto: ScrapeRequestDto) {
    return this.pipeline.startScrape(req.userId ?? 'dev-user', dto as unknown as Record<string, unknown>);
  }

  @Post('analyse')
  analyse(@Req() req: any, @Body() dto: AnalyseRequestDto) {
    return this.pipeline.startAnalyse(req.userId ?? 'dev-user', dto as unknown as Record<string, unknown>);
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    const job = this.pipeline.getJob(id);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }
}
