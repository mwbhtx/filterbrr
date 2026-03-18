import { Injectable } from '@nestjs/common';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoService } from '../dynamo/dynamo.service';

export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelling' | 'cancelled';

export interface Job {
  job_id: string;
  user_id: string;
  command: string;
  function_name: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  progress: string;
  result: Record<string, unknown> | null;
  error: string | null;
  cancelled: boolean;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

const TABLE = 'Jobs';

@Injectable()
export class JobRepository {
  constructor(private readonly dynamo: DynamoService) {}

  async create(job: Job): Promise<void> {
    await this.dynamo.client.send(new PutCommand({ TableName: TABLE, Item: job }));
  }

  async get(jobId: string): Promise<Job | null> {
    const result = await this.dynamo.client.send(
      new GetCommand({ TableName: TABLE, Key: { job_id: jobId } })
    );
    return (result.Item as Job) ?? null;
  }

  async updateStatus(jobId: string, status: JobStatus, progress?: string, result?: Record<string, unknown>, error?: string): Promise<void> {
    let expr = 'SET #s = :s, updated_at = :u';
    const names: Record<string, string> = { '#s': 'status' };
    const values: Record<string, unknown> = {
      ':s': status,
      ':u': new Date().toISOString(),
    };
    if (progress !== undefined) {
      expr += ', progress = :p';
      values[':p'] = progress;
    }
    if (result !== undefined) {
      expr += ', #r = :r';
      names['#r'] = 'result';
      values[':r'] = result;
    }
    if (error !== undefined) {
      expr += ', #e = :e';
      names['#e'] = 'error';
      values[':e'] = error;
    }
    if (['completed', 'failed', 'cancelled'].includes(status)) {
      expr += ', completed_at = :ca';
      values[':ca'] = new Date().toISOString();
    }
    await this.dynamo.client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { job_id: jobId },
      UpdateExpression: expr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  }

  async updateProgress(jobId: string, progress: string): Promise<void> {
    await this.dynamo.client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { job_id: jobId },
      UpdateExpression: 'SET progress = :p, updated_at = :u',
      ExpressionAttributeValues: {
        ':p': progress,
        ':u': new Date().toISOString(),
      },
    }));
  }

  async setCancelling(jobId: string): Promise<void> {
    await this.dynamo.client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { job_id: jobId },
      UpdateExpression: 'SET #s = :s, progress = :p, updated_at = :u',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s': 'cancelling',
        ':p': 'Cancelling...',
        ':u': new Date().toISOString(),
      },
    }));
  }

  async isCancelling(jobId: string): Promise<boolean> {
    const job = await this.get(jobId);
    return job?.status === 'cancelling';
  }
}
