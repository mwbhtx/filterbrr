import { Injectable } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

@Injectable()
export class DynamoService {
  readonly client: DynamoDBDocumentClient;

  constructor() {
    const isLocal = process.env.NODE_ENV !== 'production';
    if (!isLocal && !process.env.AWS_REGION) {
      throw new Error('AWS_REGION must be set in production');
    }
    const dynamoClient = new DynamoDBClient(
      isLocal
        ? { endpoint: 'http://localhost:8000', region: 'ap-southeast-2', credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local' } }
        : { region: process.env.AWS_REGION }
    );
    this.client = DynamoDBDocumentClient.from(dynamoClient);
  }
}
