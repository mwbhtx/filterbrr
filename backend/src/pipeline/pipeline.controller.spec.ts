import { NotFoundException } from '@nestjs/common';
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
});
