import { Injectable } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

@Injectable()
export class DynamoService {
  readonly client: DynamoDBDocumentClient;

  constructor() {
    const isLocal = process.env.NODE_ENV !== 'production';
    const dynamoClient = new DynamoDBClient(
      isLocal
        ? { endpoint: 'http://localhost:8000', region: 'ap-southeast-2', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
        : { region: process.env.AWS_REGION ?? 'ap-southeast-2' }
    );
    this.client = DynamoDBDocumentClient.from(dynamoClient);
  }
}
