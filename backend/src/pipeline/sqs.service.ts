import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  SQSClient,
  CreateQueueCommand,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
} from '@aws-sdk/client-sqs';

const QUEUE_NAME = 'filterbrr-jobs';

@Injectable()
export class SqsService implements OnModuleInit {
  private readonly logger = new Logger(SqsService.name);
  private readonly client: SQSClient;
  private readonly isLocal = process.env.NODE_ENV !== 'production';
  private queueUrl: string | null = null;

  constructor() {
    this.client = new SQSClient(
      this.isLocal
        ? {
            endpoint: 'http://localhost:4566',
            region: 'us-east-1',
            credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local' },
          }
        : { region: process.env.AWS_REGION ?? 'us-east-1' }
    );
  }

  async onModuleInit(): Promise<void> {
    // Retry loop in case LocalStack isn't ready yet at startup
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        if (this.isLocal) {
          try {
            const result = await this.client.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }));
            this.queueUrl = result.QueueUrl!;
          } catch {
            const result = await this.client.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }));
            this.queueUrl = result.QueueUrl!;
          }
        } else {
          const result = await this.client.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }));
          this.queueUrl = result.QueueUrl!;
        }
        this.logger.log(`SQS queue ready: ${this.queueUrl}`);
        return;
      } catch (err) {
        this.logger.warn(`SQS not ready (attempt ${attempt}/10): ${(err as Error).message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    this.logger.error('SQS failed to initialize after 10 attempts');
  }

  async enqueue(jobId: string): Promise<void> {
    await this.client.send(new SendMessageCommand({
      QueueUrl: this.queueUrl!,
      MessageBody: JSON.stringify({ jobId }),
    }));
  }

  async receive(): Promise<{ jobId: string; receiptHandle: string } | null> {
    if (!this.queueUrl) return null;
    const result = await this.client.send(new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
    }));
    const msg = result.Messages?.[0];
    if (!msg) return null;
    const body = JSON.parse(msg.Body!);
    return { jobId: body.jobId, receiptHandle: msg.ReceiptHandle! };
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    await this.client.send(new DeleteMessageCommand({
      QueueUrl: this.queueUrl!,
      ReceiptHandle: receiptHandle,
    }));
  }
}
