import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DynamoDBClient, CreateTableCommand, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const LOCAL_TABLES = [
  {
    TableName: 'UserSettings',
    KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'user_id', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'Filters',
    KeySchema: [
      { AttributeName: 'user_id', KeyType: 'HASH' },
      { AttributeName: 'filter_id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'user_id', AttributeType: 'S' },
      { AttributeName: 'filter_id', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'SyncState',
    KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'user_id', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'Jobs',
    KeySchema: [{ AttributeName: 'job_id', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'job_id', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'DemoSessions',
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
];

@Injectable()
export class DynamoService implements OnModuleInit {
  private readonly logger = new Logger(DynamoService.name);
  readonly client: DynamoDBDocumentClient;
  private readonly rawClient: DynamoDBClient;
  private readonly isLocal: boolean;

  constructor() {
    this.isLocal = process.env.NODE_ENV !== 'production';
    if (!this.isLocal && !process.env.AWS_REGION) {
      throw new Error('AWS_REGION must be set in production');
    }
    this.rawClient = new DynamoDBClient(
      this.isLocal
        ? { endpoint: 'http://localhost:8000', region: 'us-east-1', credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local' } }
        : { region: process.env.AWS_REGION }
    );
    this.client = DynamoDBDocumentClient.from(this.rawClient);
  }

  async onModuleInit() {
    if (!this.isLocal) return;
    for (const table of LOCAL_TABLES) {
      try {
        await Promise.race([
          this.rawClient.send(new CreateTableCommand(table as any)),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);
        this.logger.log(`Created table: ${table.TableName}`);
      } catch (err) {
        if (err instanceof ResourceInUseException) {
          // Table already exists — fine
        } else {
          this.logger.warn(`Could not create table ${table.TableName}: ${(err as Error).message}`);
        }
      }
    }
  }
}
