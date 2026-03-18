import { Controller, Post, Delete, Get, Param, Body, Req, Sse, NotFoundException, MessageEvent } from '@nestjs/common';
import { Observable, interval, switchMap, from, map, takeWhile, startWith, distinctUntilChanged } from 'rxjs';
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
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
    };
  }

  @Sse('jobs/:id/stream')
  streamJob(@Param('id') id: string): Observable<MessageEvent> {
    let lastUpdatedAt = '';

    return interval(2000).pipe(
      startWith(0),
      switchMap(() => from(this.pipeline.getJob(id))),
      map((job): { job: typeof job; changed: boolean } => {
        if (!job) return { job: null, changed: true };
        const changed = job.updated_at !== lastUpdatedAt;
        if (changed) lastUpdatedAt = job.updated_at;
        return { job, changed };
      }),
      distinctUntilChanged((prev, curr) => !curr.changed),
      map(({ job }): MessageEvent => {
        if (!job) {
          return { type: 'complete', data: { status: 'failed', error: 'Job not found' } };
        }

        const isTerminal = ['completed', 'failed', 'cancelled'].includes(job.status);
        return {
          type: isTerminal ? 'complete' : 'progress',
          data: {
            status: job.status,
            progress: job.progress,
            ...(job.result && { result: job.result }),
            ...(job.error && { error: job.error }),
          },
        };
      }),
      takeWhile((event) => event.type !== 'complete', true),
    );
  }

  @Delete('jobs/:id')
  async cancelJob(@Param('id') id: string) {
    await this.pipeline.cancelJob(id);
    return { cancelled: id };
  }
}
