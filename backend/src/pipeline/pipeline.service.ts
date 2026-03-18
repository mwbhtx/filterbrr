import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SettingsService } from '../settings/settings.service';
import { JobRepository, Job } from './job.repository';
import { SqsService } from './sqs.service';

@Injectable()
export class PipelineService {
  constructor(
    private readonly settings: SettingsService,
    private readonly jobRepo: JobRepository,
    private readonly sqs: SqsService,
  ) {}

  async startScrape(userId: string, dto: Record<string, unknown>): Promise<{ job_id: string }> {
    const userSettings = await this.settings.get(userId) as {
      trackers?: Array<{ id: string; tracker_type: string; username: string; password: string }>;
    };
    const trackers = userSettings.trackers ?? [];
    const trackerId = dto['tracker_id'] as string | undefined;
    const tracker = trackerId ? trackers.find(t => t.id === trackerId) : trackers[0];

    if (!tracker) throw new Error('No tracker configured. Add a tracker in Settings first.');

    const payload: Record<string, unknown> = {
      userId,
      category: dto['category'],
      days: dto['days'],
      startPage: dto['start_page'] ?? 1,
      delay: 1,
      trackerUsername: tracker.username,
      trackerPassword: tracker.password,
    };

    const command = `scrape ${tracker.tracker_type} ${dto['category']} ${dto['days']}d`;
    return this.enqueue(userId, command, 'filterbrr-scraper', payload);
  }

  async startAnalyze(userId: string, dto: Record<string, unknown>): Promise<{ job_id: string }> {
    const source = dto['source'] as string;
    const storageTb = (dto['storage_tb'] as number | undefined) ?? 4;
    const seedDays = (dto['seed_days'] as number | undefined) ?? 30;
    const datasetKey = dto['dataset_path'] as string | undefined;

    if (!datasetKey) throw new Error('dataset_path is required for analysis');

    const payload: Record<string, unknown> = { userId, datasetKey, storageTb, seedDays, source };
    const command = `analyze ${source} storageTb=${storageTb} seedDays=${seedDays}`;
    return this.enqueue(userId, command, 'filterbrr-analyzer', payload);
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.jobRepo.get(jobId);
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.jobRepo.setCancelled(jobId);
  }

  private async enqueue(
    userId: string,
    command: string,
    functionName: string,
    payload: Record<string, unknown>,
  ): Promise<{ job_id: string }> {
    const job: Job = {
      job_id: uuidv4(),
      user_id: userId,
      command,
      function_name: functionName,
      payload,
      status: 'queued',
      output: [],
      return_code: null,
      cancelled: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await this.jobRepo.create(job);
    await this.sqs.enqueue(job.job_id);
    return { job_id: job.job_id };
  }
}
