import { Injectable } from '@nestjs/common';
import { ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class DatasetsService {
  constructor(private readonly s3: S3Service) {}

  async list(userId: string): Promise<Record<string, unknown>[]> {
    const result = await this.s3.client.send(
      new ListObjectsV2Command({ Bucket: this.s3.bucket, Prefix: `${userId}/datasets/` })
    );
    const items = await Promise.all((result.Contents ?? []).map(async (obj) => {
      const filename = obj.Key?.split('/').pop() ?? '';
      // filename format: torrents_data_{category}_{YYYY-MM-DD_HHmm}.csv
      const match = filename.match(/^torrents_data_([^_]+)_(\d{4}-\d{2}-\d{2}_\d{4})\.csv$/);
      const category = match?.[1] ?? null;
      const scraped_at = match?.[2]?.replace('_', 'T').replace(/(\d{2})(\d{2})$/, '$1:$2') ?? null;

      let torrent_count: number | null = null;
      let min_date: string | null = null;
      let max_date: string | null = null;

      try {
        const csvObj = await this.s3.client.send(new GetObjectCommand({ Bucket: this.s3.bucket, Key: obj.Key! }));
        const text = await (csvObj.Body as { transformToString: () => Promise<string> }).transformToString();
        const lines = text.trim().split('\n');
        torrent_count = Math.max(0, lines.length - 1); // subtract header
        const splitCsv = (line: string) => {
          const fields: string[] = [];
          let cur = '', inQuote = false;
          for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; }
            else if (ch === ',' && !inQuote) { fields.push(cur); cur = ''; }
            else { cur += ch; }
          }
          fields.push(cur);
          return fields;
        };
        const headers = splitCsv(lines[0] ?? '');
        const dateCol = headers.indexOf('date');
        if (dateCol >= 0) {
          const dates = lines.slice(1).map(l => splitCsv(l)[dateCol]).filter(Boolean).sort();
          min_date = dates[0] ?? null;
          max_date = dates[dates.length - 1] ?? null;
        }
      } catch { /* leave nulls if read fails */ }

      return {
        key: obj.Key,
        filename,
        last_modified: obj.LastModified,
        category,
        tracker_type: 'TorrentLeech',
        scraped_at,
        torrent_count,
        min_date,
        max_date,
      };
    }));
    return items.sort((a, b) => {
      const aTime = (a.scraped_at as string | null) ?? '';
      const bTime = (b.scraped_at as string | null) ?? '';
      return bTime.localeCompare(aTime);
    });
  }

  async delete(userId: string, filename: string): Promise<void> {
    await this.s3.client.send(
      new DeleteObjectCommand({ Bucket: this.s3.bucket, Key: `${userId}/datasets/${filename}` })
    );
  }
}
