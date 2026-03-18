import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import axios from 'axios';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { SqsService } from './sqs.service';
import { JobRepository } from './job.repository';

const LOCAL_LAMBDA_URLS: Record<string, string> = {
  'filterbrr-scraper':  'http://localhost:9001/2015-03-31/functions/function/invocations',
  'filterbrr-analyzer': 'http://localhost:9002/2015-03-31/functions/function/invocations',
};

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly isLocal = process.env.NODE_ENV !== 'production';
  private readonly lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  private running = false;
  private activeJobId: string | null = null;

  constructor(
    private readonly sqs: SqsService,
    private readonly jobs: JobRepository,
  ) {}

  onModuleInit(): void {
    this.running = true;
    void this.poll();
  }

  onModuleDestroy(): void {
    this.running = false;
  }

  getActiveJobId(): string | null {
    return this.activeJobId;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const msg = await this.sqs.receive();
        if (!msg) continue;

        const { jobId, receiptHandle } = msg;
        this.activeJobId = jobId;

        try {
          await this.runJob(jobId);
        } finally {
          this.activeJobId = null;
          await this.sqs.deleteMessage(receiptHandle);
        }
      } catch (err) {
        this.logger.error('Worker poll error:', err);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  private async runJob(jobId: string): Promise<void> {
    const job = await this.jobs.get(jobId);
    if (!job) { this.logger.warn(`Job ${jobId} not found`); return; }
    if (job.cancelled) { this.logger.log(`Job ${jobId} already cancelled, skipping`); return; }

    await this.jobs.updateStatus(jobId, 'running');

    try {
      const result = this.isLocal
        ? await this.invokeLocalLambda(job.function_name, { ...job.payload, jobId }, jobId)
        : await this.invokeLambda(job.function_name, { ...job.payload, jobId });

      const isCancelled = await this.jobs.isCancelled(jobId);
      if (!isCancelled) {
        await this.jobs.updateStatus(jobId, 'completed', 0);
        await this.jobs.appendOutput(jobId, `Completed: ${JSON.stringify(result)}`);
      }
    } catch (err: unknown) {
      const isCancelled = await this.jobs.isCancelled(jobId);
      if (!isCancelled) {
        await this.jobs.updateStatus(jobId, 'failed', 1);
        await this.jobs.appendOutput(jobId, `Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async invokeLocalLambda(functionName: string, payload: unknown, jobId: string): Promise<unknown> {
    const url = LOCAL_LAMBDA_URLS[functionName];
    if (!url) throw new Error(`No local URL configured for ${functionName}`);
    await this.jobs.appendOutput(jobId, `Invoking ${functionName}...`);
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 900_000,
    });
    const body = response.data;
    if (body?.errorMessage) throw new Error(`${body.errorType ?? 'LambdaError'}: ${body.errorMessage}`);
    return body;
  }

  private async invokeLambda(functionName: string, payload: unknown): Promise<unknown> {
    const result = await this.lambda.send(new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    }));
    return result.Payload ? JSON.parse(Buffer.from(result.Payload).toString()) : {};
  }
}
