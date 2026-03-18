import { Handler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
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

export interface ScrapeEvent {
  jobId?: string;
  userId: string;
  category: string;
  days: number;
  startPage: number;
  delay: number;
  trackerUsername: string;
  trackerPassword: string;
}

interface TorrentRow {
  name: string;
  size: number;
  date: string;
  seeders: number;
  leechers: number;
  completed: number;
  category: string;
}

const CATEGORY_FACETS: Record<string, string> = {
  freeleech: 'tags%3AFREELEECH',
  movies:    'cat%3AMovies',
  tv:        'cat%3ATV',
};

export function getCategoryFacets(category: string): string {
  return CATEGORY_FACETS[category] ?? CATEGORY_FACETS['freeleech'];
}

export function toCSV(rows: TorrentRow[]): string {
  const header = 'name,size,date,seeders,leechers,completed,category\n';
  return header + rows.map(r =>
    `"${r.name.replace(/"/g, '""')}",${r.size},"${r.date}",${r.seeders},${r.leechers},${r.completed},"${r.category}"`
  ).join('\n');
}

export const handler: Handler<ScrapeEvent> = async (event) => {
  const { userId, category, days, trackerUsername, trackerPassword } = event;

  const http = axios.create({
    baseURL: 'https://www.torrentleech.org',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/html, */*',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  // Extract name=value pairs from set-cookie headers, last value wins for duplicates
  const extractCookies = (setCookie: string[] = []) => {
    const jar: Record<string, string> = {};
    for (const c of setCookie) {
      const pair = c.split(';')[0].trim();
      const eq = pair.indexOf('=');
      if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  };

  // GET login page to get initial session cookie
  const getResp = await http.get('/user/account/login/');
  const initialCookie = extractCookies(getResp.headers['set-cookie']);

  // Extract CSRF token if present
  const csrfMatch = (getResp.data as string).match(/name="_csrf_token"\s+value="([^"]+)"/);
  const csrfToken = csrfMatch?.[1];
  console.log('CSRF token found:', !!csrfToken, csrfToken?.slice(0, 20));

  const loginBody: Record<string, string> = { username: trackerUsername, password: trackerPassword };
  if (csrfToken) loginBody['_csrf_token'] = csrfToken;

  // POST credentials with initial cookie
  const postResp = await http.post('/user/account/login/',
    new URLSearchParams(loginBody),
    { headers: { Cookie: initialCookie } }
  );
  const sessionCookie = extractCookies(postResp.headers['set-cookie']) || initialCookie;
  console.log('Login GET set-cookie:', getResp.headers['set-cookie']);
  console.log('Login POST status:', postResp.status, '| set-cookie:', postResp.headers['set-cookie'], '| still on login:', (postResp.data as string).includes('<title>Login'));

  if ((postResp.data as string).includes('<title>Login')) {
    throw new Error('Login failed — check credentials');
  }

  // All subsequent requests use the session cookie
  const session = axios.create({
    baseURL: 'https://www.torrentleech.org',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/html, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': sessionCookie,
    },
  });

  const facets = getCategoryFacets(category);
  const rows: TorrentRow[] = [];
  let page = event.startPage ?? 1;
  let referenceDate: Date | null = null;

  while (true) {
    const url = `/torrents/browse/list/facets/${facets}/orderby/added/order/desc/page/${page}`;
    const response = await session.get(url);
    const raw = response.data;
    const torrents: unknown[] = Array.isArray(raw)
      ? raw
      : (raw as { torrentList?: unknown[] })?.torrentList ?? [];
    console.log(`Page ${page}: ${torrents.length} torrents | type: ${Array.isArray(raw) ? 'array' : typeof raw} | sample: ${JSON.stringify(raw).slice(0, 200)}`);

    if (torrents.length === 0) break;

    if (referenceDate === null) {
      const first = torrents[0] as { addedTimestamp?: string };
      referenceDate = first.addedTimestamp ? new Date(first.addedTimestamp + ' UTC') : new Date();
    }

    const cutoff = new Date(referenceDate.getTime() - days * 86400_000);
    let hitOld = false;

    for (const t of torrents as Array<{
      name: string; size: number; addedTimestamp: string;
      seeders: number; leechers: number; completed: number;
    }>) {
      const added = new Date(t.addedTimestamp + ' UTC');
      if (added < cutoff) { hitOld = true; break; }
      rows.push({
        name: t.name,
        size: t.size,
        date: t.addedTimestamp,
        seeders: t.seeders,
        leechers: t.leechers,
        completed: t.completed,
        category,
      });
    }

    if (hitOld) break;
    if (event.jobId && await isCancelled(event.jobId)) {
      console.log('Job cancelled, stopping scrape early');
      break;
    }
    page++;
    await new Promise(r => setTimeout(r, (event.delay ?? 1) * 1000));
  }

  if (rows.length === 0) throw new Error('Scrape returned 0 rows — not saving empty dataset');

  const csv = toCSV(rows);
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const key = `${userId}/datasets/torrents_data_${category}_${timestamp}.csv`;

  const s3 = new S3Client({
    region: process.env.AWS_REGION ?? 'ap-southeast-2',
    ...(process.env.AWS_ENDPOINT_URL && {
      endpoint: process.env.AWS_ENDPOINT_URL,
      forcePathStyle: true,
    }),
  });

  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET ?? 'filterbrr-userdata',
    Key: key,
    Body: csv,
    ContentType: 'text/csv',
  }));

  return { key, rowCount: rows.length };
};
