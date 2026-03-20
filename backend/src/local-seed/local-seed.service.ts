import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DynamoService } from '../dynamo/dynamo.service';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class LocalSeedService implements OnModuleInit {
  private readonly logger = new Logger(LocalSeedService.name);

  constructor(
    private readonly dynamo: DynamoService,
    private readonly s3: S3Service,
  ) {}

  async onModuleInit() {
    const userId = process.env.LOCAL_USER_ID ?? 'local-dev-user';

    const forceSeed = process.env.SEED_FORCE === 'true';

    if (!forceSeed) {
      const existing = await this.dynamo.client.send(
        new GetCommand({ TableName: 'UserSettings', Key: { user_id: userId } }),
      );

      if (existing.Item) {
        this.logger.log(`Settings already exist for ${userId}, skipping seed`);
        return;
      }
    }

    this.logger.log(`Seeding data for ${userId}...`);

    await this.seedSettings(userId);
    await this.seedDataset(userId);

    this.logger.log('Local seed complete');
  }

  private async seedSettings(userId: string): Promise<void> {
    const trackers: Record<string, unknown>[] = [];
    const username = process.env.SEED_TRACKER_USERNAME;
    const password = process.env.SEED_TRACKER_PASSWORD;

    if (username && password) {
      trackers.push({
        id: 'seed-torrentleech',
        tracker_type: 'TorrentLeech',
        username,
        password,
      });
      this.logger.log('Seeded TorrentLeech tracker credentials');
    }

    const item: Record<string, unknown> = {
      user_id: userId,
      trackers,
      seedboxes: [],
    };

    const autobrrUrl = process.env.SEED_AUTOBRR_URL;
    const autobrrKey = process.env.SEED_AUTOBRR_API_KEY;

    if (autobrrUrl && autobrrKey) {
      item.autobrr_url = autobrrUrl;
      item.autobrr_api_key = autobrrKey;
      this.logger.log('Seeded autobrr connection');
    }

    await this.dynamo.client.send(
      new PutCommand({ TableName: 'UserSettings', Item: item }),
    );
  }

  private async seedDataset(userId: string): Promise<void> {
    const key = `${userId}/datasets/freeleech_2026-02-16_0000.json`;

    try {
      await this.s3.client.send(
        new HeadObjectCommand({ Bucket: this.s3.bucket, Key: key }),
      );
      this.logger.log('Dataset already exists, skipping');
      return;
    } catch {
      // Does not exist — seed it
    }

    try {
      const data = readFileSync(
        join(__dirname, '..', 'datasets', 'demo-dataset.json'),
        'utf-8',
      );
      await this.s3.client.send(
        new PutObjectCommand({
          Bucket: this.s3.bucket,
          Key: key,
          Body: data,
          ContentType: 'application/json',
        }),
      );
      this.logger.log('Seeded demo dataset to S3');
    } catch (err) {
      this.logger.warn(`Failed to seed dataset: ${(err as Error).message}`);
    }
  }
}
