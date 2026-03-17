import { Injectable } from '@nestjs/common';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class DatasetsService {
  constructor(private readonly s3: S3Service) {}

  async list(userId: string): Promise<Record<string, unknown>[]> {
    const result = await this.s3.client.send(
      new ListObjectsV2Command({ Bucket: this.s3.bucket, Prefix: `${userId}/datasets/` })
    );
    return (result.Contents ?? []).map((obj) => ({
      key: obj.Key,
      filename: obj.Key?.split('/').pop(),
      size_mb: Math.round(((obj.Size ?? 0) / 1024 / 1024) * 10) / 10,
      last_modified: obj.LastModified,
    }));
  }

  async delete(userId: string, filename: string): Promise<void> {
    await this.s3.client.send(
      new DeleteObjectCommand({ Bucket: this.s3.bucket, Key: `${userId}/datasets/${filename}` })
    );
  }
}
