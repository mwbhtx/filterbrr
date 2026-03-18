import { Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { parse } from 'csv-parse/sync';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.DYNAMODB_ENDPOINT && {
    endpoint: process.env.DYNAMODB_ENDPOINT,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local' },
  }),
}));

async function updateProgress(jobId: string, progress: string): Promise<void> {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: 'Jobs',
      Key: { job_id: jobId },
      UpdateExpression: 'SET progress = :p, updated_at = :u',
      ExpressionAttributeValues: {
        ':p': progress,
        ':u': new Date().toISOString(),
      },
    }));
  } catch {
    // Best-effort
  }
}

async function isCancelling(jobId: string): Promise<boolean> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'Jobs',
      Key: { job_id: jobId },
      ProjectionExpression: '#s',
      ExpressionAttributeNames: { '#s': 'status' },
    }));
    return result.Item?.status === 'cancelling';
  } catch {
    return false;
  }
}

async function completeJob(jobId: string, status: 'completed' | 'failed' | 'cancelled', progress: string, result?: Record<string, unknown>, error?: string): Promise<void> {
  let expr = 'SET #s = :s, progress = :p, updated_at = :u';
  const names: Record<string, string> = { '#s': 'status' };
  const values: Record<string, unknown> = {
    ':s': status,
    ':p': progress,
    ':u': new Date().toISOString(),
  };
  if (result !== undefined) {
    expr += ', #r = :r';
    names['#r'] = 'result';
    values[':r'] = result;
  }
  if (error !== undefined) {
    expr += ', #e = :e';
    names['#e'] = 'error';
    values[':e'] = error;
  }
  await dynamo.send(new UpdateCommand({
    TableName: 'Jobs',
    Key: { job_id: jobId },
    UpdateExpression: expr,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
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
  const { jobId } = event;

  try {
    if (jobId) await updateProgress(jobId, 'Loading dataset...');

    const s3 = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL && {
        endpoint: process.env.AWS_ENDPOINT_URL,
        forcePathStyle: true,
      }),
    });
    const bucket = process.env.S3_BUCKET ?? 'filterbrr-userdata';

    const csvObj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: event.datasetKey }));
    const csvText = await (csvObj.Body as { transformToString: () => Promise<string> }).transformToString();
    const rows = parse(csvText, { columns: true, cast: true }) as TorrentRow[];

    if (jobId) await updateProgress(jobId, `Loading dataset (${rows.length} rows)...`);

    const tiers = analyzeTiers(rows, event.storageTb);

    const outputKeys: string[] = [];
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];

      if (jobId) await updateProgress(jobId, `Generating tier ${i + 1} of ${tiers.length}...`);

      const key = `${event.userId}/filters/generated/${event.source}/tier-${tier.tier}-${tier.name}.json`;
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(tier, null, 2),
        ContentType: 'application/json',
      }));
      outputKeys.push(key);

      if (jobId && await isCancelling(jobId)) {
        await completeJob(jobId, 'cancelled', 'Cancelled');
        return { outputKeys, cancelled: true };
      }
    }

    if (jobId) await updateProgress(jobId, 'Uploading filters...');

    const result = { outputKeys };
    if (jobId) await completeJob(jobId, 'completed', `Complete — ${tiers.length} filters generated`, result);

    return result;
  } catch (err) {
    if (jobId) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await completeJob(jobId, 'failed', `Failed: ${errMsg}`, undefined, errMsg);
    }
    throw err;
  }
};
