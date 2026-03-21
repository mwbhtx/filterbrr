import { Injectable } from '@nestjs/common';
import { ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class DatasetsService {
  constructor(private readonly s3: S3Service) {}

  private async ensureDemoDataset(): Promise<void> {
    const key = 'demo/datasets/freeleech_2026-02-16_0000.json';
    try {
      await this.s3.client.send(new HeadObjectCommand({ Bucket: this.s3.bucket, Key: key }));
    } catch {
      try {
        const data = readFileSync(join(__dirname, 'demo-dataset.json'), 'utf-8');
        await this.s3.client.send(new PutObjectCommand({
          Bucket: this.s3.bucket,
          Key: key,
          Body: data,
          ContentType: 'application/json',
        }));
      } catch (err) {
        console.error('Failed to seed demo dataset:', err);
      }
    }
  }

  async list(userId: string, role?: string): Promise<Record<string, unknown>[]> {
    const prefix = role === 'demo' ? 'demo/datasets/' : `${userId}/datasets/`;
    if (role === 'demo') {
      await this.ensureDemoDataset();
    }
    const result = await this.s3.client.send(
      new ListObjectsV2Command({ Bucket: this.s3.bucket, Prefix: prefix })
    );
    const items = await Promise.all((result.Contents ?? []).map(async (obj) => {
      const filename = obj.Key?.split('/').pop() ?? '';

      // Format: {category}_{YYYY-MM-DD_HHmm}.json
      const match = filename.match(/^([^_]+)_(\d{4}-\d{2}-\d{2}_\d{4})\.json$/);
      if (!match) return null; // skip non-JSON files
      const category = match[1];
      const scraped_at = match[2].replace('_', 'T').replace(/(\d{2})(\d{2})$/, '$1:$2');

      let torrent_count: number | null = null;
      let min_date: string | null = null;
      let max_date: string | null = null;
      let scrape_duration_sec: number | null = null;

      try {
        const dataObj = await this.s3.client.send(new GetObjectCommand({ Bucket: this.s3.bucket, Key: obj.Key! }));
        const text = await (dataObj.Body as { transformToString: () => Promise<string> }).transformToString();
        const parsed = JSON.parse(text);
        const torrents: Array<{ date?: string }> = Array.isArray(parsed) ? parsed : (parsed.torrents ?? []);
        const meta = Array.isArray(parsed) ? null : parsed.meta;
        torrent_count = meta?.torrentCount ?? torrents.length;
        scrape_duration_sec = meta?.durationSec ?? null;
        const dates = torrents.map(t => t.date).filter(Boolean).sort() as string[];
        min_date = dates[0] ?? null;
        max_date = dates[dates.length - 1] ?? null;
      } catch { /* leave nulls if read fails */ }

      return {
        key: obj.Key,
        path: obj.Key,
        filename,
        last_modified: obj.LastModified,
        category,
        tracker_type: 'TorrentLeech',
        scraped_at,
        torrent_count,
        min_date,
        max_date,
        scrape_duration_sec,
      };
    }));
    return items.filter(Boolean).sort((a, b) => {
      const aTime = (a!.scraped_at as string | null) ?? '';
      const bTime = (b!.scraped_at as string | null) ?? '';
      return bTime.localeCompare(aTime);
    }) as Record<string, unknown>[];
  }

  async delete(userId: string, filename: string): Promise<void> {
    await this.s3.client.send(
      new DeleteObjectCommand({ Bucket: this.s3.bucket, Key: `${userId}/datasets/${filename}` })
    );
  }
}
