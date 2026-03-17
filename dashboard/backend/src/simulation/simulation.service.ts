import { Injectable } from '@nestjs/common';
import { S3Service } from '../s3/s3.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { parse } from 'csv-parse/sync';

export interface SimulationRequest {
  datasetKey: string;
  storageTb: number;
  seedDays: number;
  filterIds: string[];
  avgRatio: number;
}

export interface DailyStat {
  date: string;
  grabbed: number;
  storageUsedTb: number;
  uploadedGb: number;
}

export interface SimulationResult {
  dailyStats: DailyStat[];
  totalGrabbed: number;
  grabRate: number;
  peakStorageTb: number;
  estimatedRatio: number;
}

interface TorrentRow {
  date: string;
  size: string;
  [key: string]: unknown;
}

@Injectable()
export class SimulationService {
  constructor(private readonly s3: S3Service) {}

  async run(userId: string, req: SimulationRequest): Promise<SimulationResult> {
    const obj = await this.s3.client.send(
      new GetObjectCommand({ Bucket: this.s3.bucket, Key: req.datasetKey })
    );
    const csvText = await (obj.Body as { transformToString: () => Promise<string> }).transformToString();
    const rows = parse(csvText, { columns: true, cast: true }) as TorrentRow[];
    return this.simulate(rows, req);
  }

  simulate(rows: TorrentRow[], req: SimulationRequest): SimulationResult {
    const storageLimitBytes = req.storageTb * 1e12;
    let storageUsed = 0;
    let totalGrabbed = 0;
    let totalUploaded = 0;
    const dailyStats: DailyStat[] = [];

    const byDate = new Map<string, TorrentRow[]>();
    for (const row of rows) {
      const date = (row.date as string)?.slice(0, 10) ?? 'unknown';
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(row);
    }

    for (const [date, dayRows] of [...byDate.entries()].sort()) {
      let dayGrabbed = 0;
      let dayUploaded = 0;

      for (const row of dayRows) {
        const sizeBytes = parseSize(row.size as string);
        if (storageUsed + sizeBytes > storageLimitBytes) continue;
        storageUsed += sizeBytes;
        storageUsed -= sizeBytes / req.seedDays;
        if (storageUsed < 0) storageUsed = 0;
        dayGrabbed++;
        dayUploaded += sizeBytes * req.avgRatio;
        totalGrabbed++;
        totalUploaded += sizeBytes * req.avgRatio;
      }

      dailyStats.push({
        date,
        grabbed: dayGrabbed,
        storageUsedTb: Math.round((storageUsed / 1e12) * 100) / 100,
        uploadedGb: Math.round((dayUploaded / 1e9) * 10) / 10,
      });
    }

    return {
      dailyStats,
      totalGrabbed,
      grabRate: rows.length > 0 ? Math.round((totalGrabbed / rows.length) * 100) : 0,
      peakStorageTb: Math.max(...dailyStats.map((d) => d.storageUsedTb), 0),
      estimatedRatio: req.avgRatio,
    };
  }
}

function parseSize(size: string): number {
  if (!size) return 0;
  const parts = size.trim().split(' ');
  const n = parseFloat(parts[0]);
  const unit = parts[1]?.toUpperCase();
  switch (unit) {
    case 'GB': return n * 1e9;
    case 'MB': return n * 1e6;
    case 'TB': return n * 1e12;
    default: return n;
  }
}
