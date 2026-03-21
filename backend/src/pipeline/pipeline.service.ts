import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';
import { SettingsService } from '../settings/settings.service';
import { JobRepository, Job } from './job.repository';

const LOCAL_LAMBDA_URLS: Record<string, string> = {
  'filterbrr-torrent-scraper':  'http://localhost:9001/2015-03-31/functions/function/invocations',
  'filterbrr-filter-generator': 'http://localhost:9002/2015-03-31/functions/function/invocations',
};

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private readonly isLocal = process.env.NODE_ENV !== 'production';
  private readonly lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

  constructor(
    private readonly settings: SettingsService,
    private readonly jobRepo: JobRepository,
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
    return this.createAndInvoke(userId, command, 'filterbrr-torrent-scraper', payload);
  }

  async startGenerateFilters(userId: string, dto: Record<string, unknown>): Promise<{ job_id: string }> {
    const source = dto['source'] as string;
    const storageTb = (dto['storage_tb'] as number | undefined) ?? 4;
    const seedDays = (dto['avg_seed_days'] as number | undefined) ?? 30;
    const datasetKey = dto['dataset_path'] as string | undefined;
    const trackerType = dto['tracker_type'] as string | undefined;

    if (!datasetKey) throw new Error('dataset_path is required for analysis');

    const payload: Record<string, unknown> = { userId, datasetKey, storageTb, seedDays, source, ...(trackerType && { trackerType }) };
    const command = `generate-filters ${source} storageTb=${storageTb} seedDays=${seedDays}`;
    return this.createAndInvoke(userId, command, 'filterbrr-filter-generator', payload);
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.jobRepo.get(jobId);
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.jobRepo.setCancelling(jobId);
  }

  private async createAndInvoke(
    userId: string,
    command: string,
    functionName: string,
    payload: Record<string, unknown>,
  ): Promise<{ job_id: string }> {
    const jobId = randomUUID();
    const job: Job = {
      job_id: jobId,
      user_id: userId,
      command,
      function_name: functionName,
      payload,
      status: 'running',
      progress: 'Starting...',
      result: null,
      error: null,
      cancelled: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    await this.jobRepo.create(job);

    const lambdaPayload = { ...payload, jobId };
    if (this.isLocal) {
      this.invokeLocalLambda(functionName, lambdaPayload, jobId);
    } else {
      this.invokeLambda(functionName, lambdaPayload, jobId);
    }

    return { job_id: jobId };
  }

  private invokeLocalLambda(functionName: string, payload: unknown, jobId: string): void {
    const url = LOCAL_LAMBDA_URLS[functionName];
    if (!url) {
      this.logger.error(`No local URL configured for ${functionName}`);
      return;
    }
    axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 900_000,
    }).then(async (response) => {
      const body = response.data;
      if (body?.errorMessage) {
        await this.jobRepo.updateStatus(jobId, 'failed', undefined, undefined, `${body.errorType ?? 'LambdaError'}: ${body.errorMessage}`);
      } else {
        await this.jobRepo.updateStatus(jobId, 'completed', undefined, body ?? {});
      }
    }).catch(async (err) => {
      const isCancelling = await this.jobRepo.isCancelling(jobId);
      if (!isCancelling) {
        await this.jobRepo.updateStatus(jobId, 'failed', undefined, undefined, err instanceof Error ? err.message : String(err));
      }
    });
  }

  private invokeLambda(functionName: string, payload: unknown, jobId: string): void {
    this.lambda.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: InvocationType.Event,
      Payload: Buffer.from(JSON.stringify(payload)),
    })).catch(async (err) => {
      await this.jobRepo.updateStatus(jobId, 'failed', undefined, undefined, err instanceof Error ? err.message : String(err));
    });
  }
}
