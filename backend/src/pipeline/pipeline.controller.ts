import { Controller, Post, Delete, Get, Param, Body, Req, NotFoundException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { ScrapeRequestDto } from './dto/scrape-request.dto';
import { AnalyzeRequestDto } from './dto/analyze-request.dto';

@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Post('scrape')
  scrape(@Req() req: any, @Body() dto: ScrapeRequestDto) {
    return this.pipeline.startScrape(req.userId ?? 'dev-user', dto as unknown as Record<string, unknown>);
  }

  @Post('analyze')
  analyze(@Req() req: any, @Body() dto: AnalyzeRequestDto) {
    return this.pipeline.startAnalyze(req.userId ?? 'dev-user', dto as unknown as Record<string, unknown>);
  }

  @Post('parse')
  parse(@Req() req: any, @Body() dto: AnalyzeRequestDto) {
    return this.pipeline.startAnalyze(req.userId ?? 'dev-user', dto as unknown as Record<string, unknown>);
  }

  @Post('report-only')
  reportOnly(@Req() req: any, @Body() dto: AnalyzeRequestDto) {
    return this.pipeline.startAnalyze(req.userId ?? 'dev-user', dto as unknown as Record<string, unknown>);
  }

  @Post('clear-temp')
  clearTemp() { return { cleared: true }; }

  @Post('save-all-temp')
  saveAllTemp() { return { saved: 0 }; }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const job = await this.pipeline.getJob(id);
    if (!job) throw new NotFoundException('Job not found');
    return {
      id: job.job_id,
      command: job.command,
      status: job.status === 'queued' ? 'running' : job.status === 'cancelled' ? 'failed' : job.status,
      output: job.output,
      return_code: job.return_code,
    };
  }

  @Delete('jobs/:id')
  async cancelJob(@Param('id') id: string) {
    await this.pipeline.cancelJob(id);
    return { cancelled: id };
  }
}
