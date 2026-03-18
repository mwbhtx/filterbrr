import { Handler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { normalizeTorrent } from './normalize';
import { RawTorrent, NormalizedTorrent, ScrapeEvent } from './types';

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
    // Best-effort progress update
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

const CATEGORY_FACETS: Record<string, string> = {
  freeleech: 'tags%3AFREELEECH',
  movies:    'cat%3AMovies',
  tv:        'cat%3ATV',
};

export { ScrapeEvent };

export const handler: Handler<ScrapeEvent> = async (event) => {
  const { userId, category, days, trackerUsername, trackerPassword, jobId } = event;

  try {
    if (jobId) await updateProgress(jobId, 'Logging in...');

    const http = axios.create({
      baseURL: 'https://www.torrentleech.org',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const extractCookies = (setCookie: string[] = []) => {
      const jar: Record<string, string> = {};
      for (const c of setCookie) {
        const pair = c.split(';')[0].trim();
        const eq = pair.indexOf('=');
        if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
      }
      return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    };

    const getResp = await http.get('/user/account/login/');
    const initialCookie = extractCookies(getResp.headers['set-cookie']);

    const csrfMatch = (getResp.data as string).match(/name="_csrf_token"\s+value="([^"]+)"/);
    const csrfToken = csrfMatch?.[1];

    const loginBody: Record<string, string> = { username: trackerUsername, password: trackerPassword };
    if (csrfToken) loginBody['_csrf_token'] = csrfToken;

    const postResp = await http.post('/user/account/login/',
      new URLSearchParams(loginBody),
      { headers: { Cookie: initialCookie } }
    );
    const sessionCookie = extractCookies(postResp.headers['set-cookie']) || initialCookie;

    if ((postResp.data as string).includes('<title>Login')) {
      throw new Error('Login failed — check credentials');
    }

    const session = axios.create({
      baseURL: 'https://www.torrentleech.org',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': sessionCookie,
      },
    });

    const facets = CATEGORY_FACETS[category] ?? CATEGORY_FACETS['freeleech'];
    const normalizedTorrents: NormalizedTorrent[] = [];
    let page = event.startPage ?? 1;
    let referenceDate: Date | null = null;
    let currentDay = 1;

    if (jobId) await updateProgress(jobId, `Scraping day 1 of ${days} (0 torrents)`);

    while (true) {
      const url = `/torrents/browse/list/facets/${facets}/orderby/added/order/desc/page/${page}`;
      const response = await session.get(url);
      const raw = response.data;
      const torrents: RawTorrent[] = Array.isArray(raw)
        ? raw
        : (raw as { torrentList?: RawTorrent[] })?.torrentList ?? [];

      if (torrents.length === 0) break;

      if (referenceDate === null) {
        const first = torrents[0];
        referenceDate = first.addedTimestamp ? new Date(first.addedTimestamp + ' UTC') : new Date();
      }

      const cutoff = new Date(referenceDate.getTime() - days * 86400_000);
      let hitOld = false;

      for (const t of torrents) {
        const added = new Date(t.addedTimestamp + ' UTC');
        if (added < cutoff) { hitOld = true; break; }

        const daysSinceRef = Math.floor((referenceDate!.getTime() - added.getTime()) / 86400_000) + 1;
        if (daysSinceRef > currentDay) {
          currentDay = daysSinceRef;
          if (jobId) await updateProgress(jobId, `Scraping day ${currentDay} of ${days} (${normalizedTorrents.length} torrents)`);
        }

        normalizedTorrents.push(normalizeTorrent(t));
      }

      if (hitOld) break;

      if (jobId && await isCancelling(jobId)) {
        await completeJob(jobId, 'cancelled', 'Cancelled');
        return { key: null, torrentCount: normalizedTorrents.length, cancelled: true };
      }

      page++;
      await new Promise(r => setTimeout(r, (event.delay ?? 1) * 1000));
    }

    if (normalizedTorrents.length === 0) {
      const errMsg = 'Scrape returned 0 torrents — not saving empty dataset';
      if (jobId) await completeJob(jobId, 'failed', errMsg, undefined, errMsg);
      throw new Error(errMsg);
    }

    if (jobId) await updateProgress(jobId, `Uploading results (${normalizedTorrents.length} torrents)...`);

    const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const key = `${userId}/datasets/${category}_${timestamp}.json`;

    const s3 = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL && {
        endpoint: process.env.AWS_ENDPOINT_URL,
        forcePathStyle: true,
      }),
    });

    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET ?? 'filterbrr-userdata',
      Key: key,
      Body: JSON.stringify(normalizedTorrents),
      ContentType: 'application/json',
    }));

    const result = { key, torrentCount: normalizedTorrents.length };
    if (jobId) await completeJob(jobId, 'completed', `Complete — ${normalizedTorrents.length} torrents scraped`, result);

    return result;
  } catch (err) {
    if (jobId) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await completeJob(jobId, 'failed', `Failed: ${errMsg}`, undefined, errMsg);
    }
    throw err;
  }
};
