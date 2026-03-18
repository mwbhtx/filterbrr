import { Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { parse } from 'csv-parse/sync';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-southeast-2',
  ...(process.env.DYNAMODB_ENDPOINT && {
    endpoint: process.env.DYNAMODB_ENDPOINT,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local' },
  }),
}));

async function isCancelled(jobId: string): Promise<boolean> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'Jobs',
      Key: { job_id: jobId },
      ProjectionExpression: 'cancelled',
    }));
    return result.Item?.cancelled === true;
  } catch {
    return false;
  }
}

export interface AnalyzeEvent {
  jobId?: string;
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

export function analyzeTiers(rows: TorrentRow[], storageTb: number): FilterTier[] {
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

export const handler: Handler<AnalyzeEvent> = async (event) => {
  const s3 = new S3Client({
    region: process.env.AWS_REGION ?? 'ap-southeast-2',
    ...(process.env.AWS_ENDPOINT_URL && {
      endpoint: process.env.AWS_ENDPOINT_URL,
      forcePathStyle: true,
    }),
  });
  const bucket = process.env.S3_BUCKET ?? 'filterbrr-userdata';

  const csvObj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: event.datasetKey }));
  const csvText = await (csvObj.Body as { transformToString: () => Promise<string> }).transformToString();
  const rows = parse(csvText, { columns: true, cast: true }) as TorrentRow[];

  const tiers = analyzeTiers(rows, event.storageTb);

  const outputKeys: string[] = [];
  for (const tier of tiers) {
    const key = `${event.userId}/filters/generated/${event.source}/tier-${tier.tier}-${tier.name}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(tier, null, 2),
      ContentType: 'application/json',
    }));
    if (event.jobId && await isCancelled(event.jobId)) {
      console.log('Job cancelled, stopping analysis early');
      break;
    }
    outputKeys.push(key);
  }

  return { outputKeys };
};
