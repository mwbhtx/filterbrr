import { Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { parse } from 'csv-parse/sync';

export interface AnalyseEvent {
  userId: string;
  datasetKey: string;
  storageTb: number;
  seedDays: number;
  source: string;
}

export interface TorrentRow {
  name: string;
  size: string;
  date: string;
  seeders: number;
  leechers: number;
  completed: number;
}

export interface FilterTier {
  tier: number;
  name: string;
  minSeeders: number;
  maxSizeGb: number;
  releaseGroups: string[];
}

export function analyseTiers(rows: TorrentRow[], storageTb: number): FilterTier[] {
  const sorted = [...rows].sort((a, b) => b.seeders - a.seeders);
  const total = sorted.length;

  const percentileSeeders = (pct: number): number =>
    sorted[Math.floor(total * pct)]?.seeders ?? 0;

  return [
    { tier: 1, name: 'opportunistic', minSeeders: percentileSeeders(0.75), maxSizeGb: storageTb * 100, releaseGroups: [] },
    { tier: 2, name: 'low',           minSeeders: percentileSeeders(0.50), maxSizeGb: storageTb * 75,  releaseGroups: [] },
    { tier: 3, name: 'medium',        minSeeders: percentileSeeders(0.25), maxSizeGb: storageTb * 50,  releaseGroups: [] },
    { tier: 4, name: 'high',          minSeeders: sorted[0]?.seeders ?? 0, maxSizeGb: storageTb * 25,  releaseGroups: [] },
  ];
}

export const handler: Handler<AnalyseEvent> = async (event) => {
  const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-2' });
  const bucket = process.env.S3_BUCKET ?? 'filterbrr-userdata';

  const csvObj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: event.datasetKey }));
  const csvText = await (csvObj.Body as { transformToString: () => Promise<string> }).transformToString();
  const rows = parse(csvText, { columns: true, cast: true }) as TorrentRow[];

  const tiers = analyseTiers(rows, event.storageTb);

  const outputKeys: string[] = [];
  for (const tier of tiers) {
    const key = `${event.userId}/filters/generated/${event.source}/tier-${tier.tier}-${tier.name}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(tier, null, 2),
      ContentType: 'application/json',
    }));
    outputKeys.push(key);
  }

  return { outputKeys };
};
