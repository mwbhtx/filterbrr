import { Injectable } from '@nestjs/common';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { v4 as uuidv4 } from 'uuid';

export interface Job {
  id: string;
  status: 'running' | 'complete' | 'failed';
  result?: unknown;
  error?: string;
  startedAt: string;
}

@Injectable()
export class PipelineService {
  private readonly jobs = new Map<string, Job>();
  private readonly lambda = new LambdaClient({
    region: process.env.AWS_REGION ?? 'ap-southeast-2',
  });

  async startScrape(userId: string, payload: Record<string, unknown>): Promise<Job> {
    const job: Job = { id: uuidv4(), status: 'running', startedAt: new Date().toISOString() };
    this.jobs.set(job.id, job);
    void this.invokeLambda(
      process.env.SCRAPER_FUNCTION_NAME ?? 'filterbrr-scraper',
      { userId, ...payload },
      job
    );
    return job;
  }

  async startAnalyse(userId: string, payload: Record<string, unknown>): Promise<Job> {
    const job: Job = { id: uuidv4(), status: 'running', startedAt: new Date().toISOString() };
    this.jobs.set(job.id, job);
    void this.invokeLambda(
      process.env.ANALYSER_FUNCTION_NAME ?? 'filterbrr-analyser',
      { userId, ...payload },
      job
    );
    return job;
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  private async invokeLambda(functionName: string, payload: unknown, job: Job): Promise<void> {
    try {
      const result = await this.lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          Payload: Buffer.from(JSON.stringify(payload)),
        })
      );
      const response = result.Payload
        ? (JSON.parse(Buffer.from(result.Payload).toString()) as unknown)
        : {};
      job.status = 'complete';
      job.result = response;
    } catch (err: unknown) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
    }
  }
}
