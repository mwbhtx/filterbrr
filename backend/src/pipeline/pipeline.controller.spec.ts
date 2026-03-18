import { NotFoundException } from '@nestjs/common';
import { firstValueFrom, toArray, take } from 'rxjs';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { Job } from './job.repository';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    job_id: 'job-1',
    user_id: 'user-1',
    command: 'scrape TorrentLeech freeleech 7d',
    function_name: 'filterbrr-scraper',
    payload: {},
    status: 'running',
    progress: 'Scraping day 3 of 7',
    result: null,
    error: null,
    cancelled: false,
    started_at: '2026-03-18T00:00:00.000Z',
    updated_at: '2026-03-18T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

const mockPipeline = {
  startScrape: jest.fn(),
  startAnalyze: jest.fn(),
  getJob: jest.fn(),
  cancelJob: jest.fn(),
} as unknown as PipelineService;

describe('PipelineController', () => {
  let controller: PipelineController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PipelineController(mockPipeline);
  });

  describe('getJob', () => {
    it('returns formatted job response', async () => {
      const job = makeJob({ progress: 'Scraping day 5 of 30', result: { key: 'test.csv' } });
      (mockPipeline.getJob as jest.Mock).mockResolvedValue(job);

      const result = await controller.getJob('job-1');
      expect(result).toEqual({
        id: 'job-1',
        command: 'scrape TorrentLeech freeleech 7d',
        status: 'running',
        progress: 'Scraping day 5 of 30',
        result: { key: 'test.csv' },
        error: null,
      });
    });

    it('throws NotFoundException when job not found', async () => {
      (mockPipeline.getJob as jest.Mock).mockResolvedValue(null);
      await expect(controller.getJob('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelJob', () => {
    it('calls pipeline.cancelJob and returns id', async () => {
      (mockPipeline.cancelJob as jest.Mock).mockResolvedValue(undefined);
      const result = await controller.cancelJob('job-1');
      expect(mockPipeline.cancelJob).toHaveBeenCalledWith('job-1');
      expect(result).toEqual({ cancelled: 'job-1' });
    });
  });

  describe('streamJob', () => {
    it('emits progress event for running job', async () => {
      const job = makeJob({ updated_at: '2026-03-18T00:00:01.000Z' });
      (mockPipeline.getJob as jest.Mock).mockResolvedValue(job);

      const observable = controller.streamJob('job-1');
      const event = await firstValueFrom(observable);
      expect(event.type).toBe('progress');
      expect(event.data).toEqual({
        status: 'running',
        progress: 'Scraping day 3 of 7',
      });
    });

    it('emits complete event for completed job', async () => {
      const job = makeJob({
        status: 'completed',
        progress: 'Complete — 500 torrents scraped',
        result: { key: 'test.csv', rowCount: 500 },
        updated_at: '2026-03-18T00:00:01.000Z',
      });
      (mockPipeline.getJob as jest.Mock).mockResolvedValue(job);

      const observable = controller.streamJob('job-1');
      const event = await firstValueFrom(observable);
      expect(event.type).toBe('complete');
      expect(event.data).toEqual({
        status: 'completed',
        progress: 'Complete — 500 torrents scraped',
        result: { key: 'test.csv', rowCount: 500 },
      });
    });

    it('emits complete event for failed job with error', async () => {
      const job = makeJob({
        status: 'failed',
        progress: 'Failed: Login failed',
        error: 'Login failed',
        updated_at: '2026-03-18T00:00:01.000Z',
      });
      (mockPipeline.getJob as jest.Mock).mockResolvedValue(job);

      const observable = controller.streamJob('job-1');
      const event = await firstValueFrom(observable);
      expect(event.type).toBe('complete');
      expect(event.data).toEqual({
        status: 'failed',
        progress: 'Failed: Login failed',
        error: 'Login failed',
      });
    });

    it('emits progress event for cancelling job', async () => {
      const job = makeJob({
        status: 'cancelling',
        progress: 'Cancelling...',
        updated_at: '2026-03-18T00:00:01.000Z',
      });
      (mockPipeline.getJob as jest.Mock).mockResolvedValue(job);

      const observable = controller.streamJob('job-1');
      const event = await firstValueFrom(observable);
      expect(event.type).toBe('progress');
      expect(event.data).toEqual({
        status: 'cancelling',
        progress: 'Cancelling...',
      });
    });

    it('emits complete event when job not found', async () => {
      (mockPipeline.getJob as jest.Mock).mockResolvedValue(null);

      const observable = controller.streamJob('nonexistent');
      const event = await firstValueFrom(observable);
      expect(event.type).toBe('complete');
      expect(event.data).toEqual({ status: 'failed', error: 'Job not found' });
    });

    it('terminates after emitting complete event', async () => {
      const job = makeJob({
        status: 'completed',
        progress: 'Done',
        updated_at: '2026-03-18T00:00:01.000Z',
      });
      (mockPipeline.getJob as jest.Mock).mockResolvedValue(job);

      const observable = controller.streamJob('job-1');
      const events = await firstValueFrom(observable.pipe(toArray()));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('complete');
    });
  });
});
