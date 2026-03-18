import { Injectable } from '@nestjs/common';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoService } from '../dynamo/dynamo.service';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  job_id: string;
  user_id: string;
  command: string;
  function_name: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  output: string[];
  return_code: number | null;
  cancelled: boolean;
  started_at: string;
  updated_at: string;
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

  async updateStatus(jobId: string, status: JobStatus, returnCode?: number): Promise<void> {
    await this.dynamo.client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { job_id: jobId },
      UpdateExpression: 'SET #s = :s, updated_at = :u' + (returnCode !== undefined ? ', return_code = :r' : ''),
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s': status,
        ':u': new Date().toISOString(),
        ...(returnCode !== undefined && { ':r': returnCode }),
      },
    }));
  }

  async appendOutput(jobId: string, line: string): Promise<void> {
    await this.dynamo.client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { job_id: jobId },
      UpdateExpression: 'SET output = list_append(if_not_exists(output, :empty), :line), updated_at = :u',
      ExpressionAttributeValues: {
        ':line': [line],
        ':empty': [],
        ':u': new Date().toISOString(),
      },
    }));
  }

  async setCancelled(jobId: string): Promise<void> {
    await this.dynamo.client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { job_id: jobId },
      UpdateExpression: 'SET cancelled = :t, #s = :s, updated_at = :u',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':t': true,
        ':s': 'cancelled',
        ':u': new Date().toISOString(),
      },
    }));
  }

  async isCancelled(jobId: string): Promise<boolean> {
    const job = await this.get(jobId);
    return job?.cancelled === true;
  }
}
