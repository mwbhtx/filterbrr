import { Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { GenerateFiltersEvent, NormalizedTorrent, ScoredTorrent, GeneratedFilter } from './types';
import type { SimulationConfig, FilterDef } from 'filter-engine';
import { runSimulation } from 'filter-engine';
import { matchExceptReleases } from 'filter-engine';
import { scoreTorrents, analyzeAllAttributes } from './scoring';
import { assignTiers, calculateDailyVolume, calculateRateLimits } from './tiers';
import { generateFilter, EXCEPT_RELEASES } from './filters';
import { calibrateLowTier } from './simulation';
import { generateReport } from './report';

// Helper to convert GeneratedFilter[] to FilterDef[]
const toFilterDefs = (filters: GeneratedFilter[]): FilterDef[] =>
  filters.map(f => ({ name: f.name, data: f.data as any }));

// ---------------------------------------------------------------------------
// AWS clients
// ---------------------------------------------------------------------------

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.DYNAMODB_ENDPOINT && {
    endpoint: process.env.DYNAMODB_ENDPOINT,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local' },
  }),
}));

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.AWS_ENDPOINT_URL && {
    endpoint: process.env.AWS_ENDPOINT_URL,
    forcePathStyle: true,
  }),
});

const BUCKET = process.env.S3_BUCKET ?? 'filterbrr-userdata';
const FILTERS_TABLE = process.env.FILTERS_TABLE ?? 'Filters';

// ---------------------------------------------------------------------------
// DynamoDB helpers (job tracking)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handler: Handler<GenerateFiltersEvent> = async (event) => {
  const { jobId } = event;

  try {
    // ------------------------------------------------------------------
    // 1. Load dataset from S3
    // ------------------------------------------------------------------
    if (jobId) await updateProgress(jobId, 'Loading dataset...');

    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: event.datasetKey }));
    const text = await (obj.Body as { transformToString: () => Promise<string> }).transformToString();
    const parsed = JSON.parse(text);
    const rawTorrents: NormalizedTorrent[] = Array.isArray(parsed) ? parsed : (parsed.torrents ?? []);

    if (jobId) await updateProgress(jobId, `Loading dataset (${rawTorrents.length} rows)...`);

    // ------------------------------------------------------------------
    // 2. Compute age_days and cast to ScoredTorrent
    // ------------------------------------------------------------------
    const now = Date.now();
    const allScored: ScoredTorrent[] = rawTorrents.map(t => ({
      ...t,
      score: 0,
      score_per_gb: 0,
      age_days: (now - new Date(t.date + (t.date.includes('T') ? '' : ' UTC')).getTime()) / 86400_000,
    }));

    // ------------------------------------------------------------------
    // 3. Filter to mature torrents and exclude EXCEPT_RELEASES
    // ------------------------------------------------------------------
    if (jobId) await updateProgress(jobId, 'Filtering and scoring...');

    const matureTorrents = allScored.filter(
      t => !matchExceptReleases(t.name, EXCEPT_RELEASES),
    );

    // ------------------------------------------------------------------
    // 4. Score torrents
    // ------------------------------------------------------------------
    scoreTorrents(matureTorrents);

    if (jobId && await isCancelling(jobId)) {
      await completeJob(jobId, 'cancelled', 'Cancelled');
      return { cancelled: true };
    }

    // ------------------------------------------------------------------
    // 5. Analyze all attributes
    // ------------------------------------------------------------------
    if (jobId) await updateProgress(jobId, 'Analyzing attributes...');

    const analyses = analyzeAllAttributes(matureTorrents);

    // ------------------------------------------------------------------
    // 6. Assign tiers
    // ------------------------------------------------------------------
    if (jobId) await updateProgress(jobId, 'Assigning tiers...');

    const tierMap = assignTiers(analyses, matureTorrents);

    // ------------------------------------------------------------------
    // 7. Calculate daily volume and rate limits
    // ------------------------------------------------------------------
    const { dailyVolume, medianSizes } = calculateDailyVolume(matureTorrents, tierMap);
    const rateLimits = calculateRateLimits(dailyVolume, medianSizes, event.storageTb);

    // ------------------------------------------------------------------
    // 8. Generate 4 filters
    // ------------------------------------------------------------------
    if (jobId) await updateProgress(jobId, 'Generating filters...');

    const tierNames: Array<[string, number]> = [
      ['high', 0],
      ['medium', 1],
      ['low', 2],
    ];

    const generatedFilters: GeneratedFilter[] = tierNames.map(([name, idx]) =>
      generateFilter(name, idx, tierMap, rateLimits, event.source, analyses, event.trackerType),
    );

    if (jobId && await isCancelling(jobId)) {
      await completeJob(jobId, 'cancelled', 'Cancelled');
      return { cancelled: true };
    }

    // ------------------------------------------------------------------
    // 9. Staged simulation
    // ------------------------------------------------------------------
    // Use the full allScored set (including young/excluded) for simulation
    // to test that filters correctly reject them.
    const simTorrents: NormalizedTorrent[] = allScored;
    const simConfig: SimulationConfig = { storageTb: event.storageTb, avgSeedDays: 7, avgRatio: 1 };

    // Stage 1: High tier only
    if (jobId) await updateProgress(jobId, 'Running simulation (stage 1/3)...');

    const highOnly = generatedFilters.map(f => ({
      ...f,
      data: { ...f.data, enabled: f.name.includes('high') ? f.data.enabled : false },
    }));
    runSimulation(simTorrents as any[], toFilterDefs(highOnly), simConfig);

    // Stage 2: High + medium
    if (jobId) await updateProgress(jobId, 'Running simulation (stage 2/3)...');

    const highMedium = generatedFilters.map(f => ({
      ...f,
      data: {
        ...f.data,
        enabled: (f.name.includes('high') || f.name.includes('medium')) ? f.data.enabled : false,
      },
    }));
    runSimulation(simTorrents as any[], toFilterDefs(highMedium), simConfig);

    // Stage 3: Calibrate low tier with all 4 filters
    if (jobId) await updateProgress(jobId, 'Calibrating low tier (stage 3/3)...');

    const { bestSettings, bestSim } = calibrateLowTier(
      generatedFilters,
      simTorrents as any[],
      event.storageTb,
    );

    // Update the low filter with calibrated settings
    const lowFilter = generatedFilters.find(f => f.name.includes('low'));
    if (lowFilter) {
      lowFilter.data.max_downloads = bestSettings.rate;
      lowFilter.data.max_size = bestSettings.maxSize;
      lowFilter.data.enabled = true;
    }

    const simResult = bestSim;

    if (jobId && await isCancelling(jobId)) {
      await completeJob(jobId, 'cancelled', 'Cancelled');
      return { cancelled: true };
    }

    // ------------------------------------------------------------------
    // 10. Write filters to DynamoDB
    // ------------------------------------------------------------------
    if (jobId) await updateProgress(jobId, 'Writing filters to database...');

    for (const [tierName, idx] of tierNames) {
      const filter = generatedFilters[idx];
      await dynamo.send(new PutCommand({
        TableName: FILTERS_TABLE,
        Item: {
          user_id: event.userId,
          filter_id: `gen-${event.source}-${tierName}`,
          name: filter.name,
          version: filter.version,
          data: filter.data,
          _source: 'generated',
          ...(event.trackerType && { tracker_type: event.trackerType }),
          created_at: new Date().toISOString(),
        },
      }));
    }

    // ------------------------------------------------------------------
    // 11. Generate markdown report
    // ------------------------------------------------------------------
    if (jobId) await updateProgress(jobId, 'Generating report...');

    const report = generateReport(
      event.source,
      matureTorrents,
      analyses,
      tierMap,
      dailyVolume,
      medianSizes,
      rateLimits,
      event.storageTb,
      generatedFilters,
      simResult,
    );

    // ------------------------------------------------------------------
    // 12. Upload report to S3
    // ------------------------------------------------------------------
    const reportKey = `${event.userId}/reports/analysis_${event.source}.md`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: reportKey,
      Body: report,
      ContentType: 'text/markdown',
    }));

    // ------------------------------------------------------------------
    // 13. Complete
    // ------------------------------------------------------------------
    const result = { filterCount: 4, reportKey };
    if (jobId) await completeJob(jobId, 'completed', `Complete — 4 filters generated`, result);

    return result;
  } catch (err) {
    if (jobId) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await completeJob(jobId, 'failed', `Failed: ${errMsg}`, undefined, errMsg);
    }
    throw err;
  }
};
