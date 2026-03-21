import { Injectable } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
  readonly client: S3Client;
  readonly bucket = process.env.S3_BUCKET ?? 'filterbrr-userdata';

  constructor() {
    const isLocal = process.env.NODE_ENV !== 'production';
    if (!isLocal && !process.env.S3_BUCKET) {
      throw new Error('S3_BUCKET must be set in production');
    }
    this.client = new S3Client(
      isLocal
        ? {
            endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:4567',
            region: 'us-east-1',
            forcePathStyle: true,
            credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local' },
          }
        : { region: process.env.AWS_REGION ?? 'us-east-1' }
    );
  }
}
