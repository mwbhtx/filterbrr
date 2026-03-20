import { Controller, Post, Delete, Get, Param, Body, Req, NotFoundException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { ScrapeRequestDto } from './dto/scrape-request.dto';
import { GenerateFiltersRequestDto } from './dto/generate-filters-request.dto';

@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Post('scrape')
  scrape(@Req() req: any, @Body() dto: ScrapeRequestDto) {
    return this.pipeline.startScrape(req.user.userId, dto as unknown as Record<string, unknown>);
  }

  @Post('generate-filters')
  generateFilters(@Req() req: any, @Body() dto: GenerateFiltersRequestDto) {
    return this.pipeline.startGenerateFilters(req.user.userId, dto as unknown as Record<string, unknown>);
  }

  @Post('parse')
  parse(@Req() req: any, @Body() dto: GenerateFiltersRequestDto) {
    return this.pipeline.startGenerateFilters(req.user.userId, dto as unknown as Record<string, unknown>);
  }

  @Post('report-only')
  reportOnly(@Req() req: any, @Body() dto: GenerateFiltersRequestDto) {
    return this.pipeline.startGenerateFilters(req.user.userId, dto as unknown as Record<string, unknown>);
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
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
    };
  }

  @Delete('jobs/:id')
  async cancelJob(@Param('id') id: string) {
    await this.pipeline.cancelJob(id);
    return { cancelled: id };
  }
}
