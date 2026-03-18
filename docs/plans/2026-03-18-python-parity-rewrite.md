# Python-Parity Rewrite: Scraper + Analyzer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the scraper and analyzer TypeScript Lambdas to achieve 1:1 feature parity with the Python originals (`scraper.py`, `parse_and_analyze.py`, `analyze_and_generate_filters.py`).

**Architecture:** Two Lambdas. The Scraper scrapes TorrentLeech, normalizes and derives fields (resolution, source, codec, HDR, release group) from torrent names, and saves a rich JSON dataset to S3. The Analyzer reads that JSON, performs multi-dimensional scoring/tiering/simulation, generates proper autobrr filter objects, writes them to DynamoDB as `Filter` records (with `_source: "generated"`), and saves a markdown report to S3.

**Tech Stack:** TypeScript, AWS Lambda (Node.js 22), AWS SDK v3 (S3, DynamoDB), axios

**Python reference files:**
- `lambdas/old_python_scripts/scraper.py` — scraping logic
- `lambdas/old_python_scripts/parse_and_analyze.py` — field derivation, normalization
- `lambdas/old_python_scripts/analyze_and_generate_filters.py` — analysis, filter generation, simulation, report

---

## Task 1: Define Shared Types

**Files:**
- Create: `lambdas/scraper/src/types.ts`
- Create: `lambdas/analyzer/src/types.ts`

These types are the contract between scraper output and analyzer input.

**Step 1: Create scraper types**

```typescript
// lambdas/scraper/src/types.ts

export interface RawTorrent {
  fid: number;
  name: string;
  filename: string;
  categoryID: number;
  size: number;
  seeders: number;
  leechers: number;
  completed: number;
  numComments: number;
  addedTimestamp: string;
  tags: string[];
  genres: string;
  rating: number;
  imdbID: string;
}

export interface NormalizedTorrent {
  torrent_id: number;
  name: string;
  filename: string;
  category: string;
  category_id: number;
  subcategory: string;
  resolution: string;
  source: string;
  codec: string;
  hdr: string;
  release_group: string;
  size_bytes: number;
  size_gb: number;
  size_str: string;
  snatched: number;
  seeders: number;
  leechers: number;
  comments: number;
  date: string;
  tags: string[];
  genres: string;
  rating: number;
  imdb_id: string;
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
```

**Step 2: Create analyzer types**

```typescript
// lambdas/analyzer/src/types.ts

export interface NormalizedTorrent {
  torrent_id: number;
  name: string;
  filename: string;
  category: string;
  category_id: number;
  subcategory: string;
  resolution: string;
  source: string;
  codec: string;
  hdr: string;
  release_group: string;
  size_bytes: number;
  size_gb: number;
  size_str: string;
  snatched: number;
  seeders: number;
  leechers: number;
  comments: number;
  date: string;
  tags: string[];
  genres: string;
  rating: number;
  imdb_id: string;
}

export interface ScoredTorrent extends NormalizedTorrent {
  score: number;
  score_per_gb: number;
  age_days: number;
}

export interface AttributeStats {
  median: number;
  mean: number;
  median_spg: number;
  mean_spg: number;
  count: number;
  daily_count: number;
  daily_gb: number;
}

export interface DailyVolume {
  count: number;
  torrents_per_day: number;
  daily_gb: number;
}

export interface RateLimit {
  enabled: boolean;
  daily_gb: number;
  torrents_per_day: number;
  max_downloads_per_hour: number;
}

export interface FilterData {
  enabled: boolean;
  min_size: string;
  max_size: string;
  delay: number;
  priority: number;
  max_downloads: number;
  max_downloads_unit: string;
  except_releases: string;
  announce_types: string[];
  freeleech: boolean;
  resolutions: string[];
  sources: string[];
  match_categories: string;
  is_auto_updated: boolean;
  release_profile_duplicate: string | null;
  match_release_groups: string;
  except_release_groups: string;
}

export interface GeneratedFilter {
  name: string;
  version: string;
  data: FilterData;
}

export interface SimulationResult {
  total_seen: number;
  total_grabbed: number;
  total_grabbed_gb: number;
  grab_rate_pct: number;
  total_days: number;
  skip_reasons: Record<string, number>;
  daily_stats: DailyStats[];
  per_filter_stats: Record<string, { count: number; gb: number; median_size: number }>;
  steady_state_avg_utilization: number;
  steady_state_avg_disk_gb: number;
  max_storage_gb: number;
  filters_used: string[];
  blackout_days: number;
}

export interface DailyStats {
  day: number;
  date: string;
  grabbed: number;
  grabbed_gb: number;
  expired_gb: number;
  disk_usage_gb: number;
  utilization_pct: number;
  available_torrents: number;
  skipped_no_match: number;
  skipped_rate_limit: number;
  skipped_storage: number;
}

export interface AnalyzeEvent {
  jobId?: string;
  userId: string;
  datasetKey: string;
  storageTb: number;
  seedDays: number;
  source: string;
}
```

**Step 3: Commit**

```bash
git add lambdas/scraper/src/types.ts lambdas/analyzer/src/types.ts
git commit -m "feat: add shared types for scraper and analyzer"
```

---

## Task 2: Implement Torrent Normalization (Parser Logic)

**Files:**
- Create: `lambdas/scraper/src/normalize.ts`
- Create: `lambdas/scraper/src/normalize.test.ts`

This is the `parse_and_analyze.py` logic — CATEGORY_MAP, derive_fields, normalize_torrent.

**Step 1: Write tests for field derivation**

```typescript
// lambdas/scraper/src/normalize.test.ts
import { deriveFields, normalizeTorrent, CATEGORY_MAP } from './normalize';

describe('deriveFields', () => {
  it('extracts 1080p resolution', () => {
    expect(deriveFields('Movie.2024.1080p.BluRay.x264-GROUP').resolution).toBe('1080p');
  });
  it('extracts 2160p resolution', () => {
    expect(deriveFields('Movie.2024.2160p.WEB-DL.DV.HDR.DDP5.1-GROUP').resolution).toBe('2160p');
  });
  it('maps 4K/UHD to 2160p', () => {
    expect(deriveFields('Movie.2024.4K.BluRay-GROUP').resolution).toBe('2160p');
    expect(deriveFields('Movie.2024.UHD.BluRay-GROUP').resolution).toBe('2160p');
  });
  it('defaults resolution to unknown', () => {
    expect(deriveFields('some.torrent.name').resolution).toBe('unknown');
  });

  it('extracts BluRay source', () => {
    expect(deriveFields('Movie.2024.1080p.BluRay.x264-GROUP').source).toBe('BluRay');
  });
  it('extracts Remux source from BluRay Remux', () => {
    expect(deriveFields('Movie.2024.1080p.BluRay.REMUX.AVC-GROUP').source).toBe('Remux');
  });
  it('extracts WEB-DL source', () => {
    expect(deriveFields('Movie.2024.1080p.WEB-DL.DDP5.1-GROUP').source).toBe('WEB-DL');
  });
  it('extracts WEBRip source', () => {
    expect(deriveFields('Movie.2024.1080p.WEBRip.x264-GROUP').source).toBe('WEBRip');
  });

  it('extracts H.265 codec', () => {
    expect(deriveFields('Movie.2024.1080p.BluRay.x265-GROUP').codec).toBe('H.265');
    expect(deriveFields('Movie.2024.1080p.BluRay.HEVC-GROUP').codec).toBe('H.265');
  });
  it('extracts H.264 codec', () => {
    expect(deriveFields('Movie.2024.1080p.BluRay.x264-GROUP').codec).toBe('H.264');
  });

  it('extracts DV+HDR', () => {
    expect(deriveFields('Movie.2024.2160p.WEB-DL.DV.HDR.DDP5.1-GROUP').hdr).toBe('DV+HDR');
  });
  it('extracts HDR10+', () => {
    expect(deriveFields('Movie.2024.2160p.BluRay.HDR10+.x265-GROUP').hdr).toBe('HDR10+');
  });
  it('does not false-positive DV from DVD', () => {
    expect(deriveFields('Movie.2024.DVDRip.x264-GROUP').hdr).toBe('None');
  });

  it('extracts release group from name', () => {
    expect(deriveFields('Movie.2024.1080p.BluRay.x264-GROUP').release_group).toBe('GROUP');
  });
  it('defaults release group to unknown', () => {
    expect(deriveFields('some torrent name').release_group).toBe('unknown');
  });
});

describe('normalizeTorrent', () => {
  it('maps categoryID to category and subcategory', () => {
    const raw = { fid: 1, name: 'Test', categoryID: 13, size: 1073741824, seeders: 10, leechers: 2, completed: 50, addedTimestamp: '2026-03-17 12:00:00' };
    const t = normalizeTorrent(raw as any);
    expect(t.category).toBe('movies');
    expect(t.subcategory).toBe('Movies/BluRay');
    expect(t.size_gb).toBeCloseTo(1.0, 1);
    expect(t.snatched).toBe(50);
  });

  it('filters FREELEECH from tags', () => {
    const raw = { fid: 1, name: 'Test', categoryID: 2, size: 0, seeders: 0, leechers: 0, completed: 0, addedTimestamp: '2026-03-17', tags: ['FREELEECH', 'Comedy'] };
    const t = normalizeTorrent(raw as any);
    expect(t.tags).toEqual(['Comedy']);
  });
});

describe('CATEGORY_MAP', () => {
  it('has 41 entries', () => {
    expect(Object.keys(CATEGORY_MAP).length).toBe(41);
  });
  it('maps category 13 to movies/BluRay', () => {
    expect(CATEGORY_MAP[13]).toEqual(['movies', 'Movies/BluRay']);
  });
});
```

**Step 2: Implement normalize.ts**

```typescript
// lambdas/scraper/src/normalize.ts
import type { RawTorrent, NormalizedTorrent } from './types';

// TorrentLeech categoryID → [class, subcategory]
export const CATEGORY_MAP: Record<number, [string, string]> = {
  // Movies
  1: ['movies', 'Movies/Cam'],
  10: ['movies', 'Movies/Screener'],
  11: ['movies', 'Movies/DVD-R'],
  12: ['movies', 'Movies/DVD-Rip'],
  13: ['movies', 'Movies/BluRay'],
  14: ['movies', 'Movies/XviD'],
  15: ['movies', 'Movies/HD'],
  29: ['movies', 'Movies/Documentary'],
  36: ['movies', 'Movies/WebRip'],
  37: ['movies', 'Movies/4K'],
  43: ['movies', 'Movies/HDRip'],
  47: ['movies', 'Movies/4K-UHD'],
  // TV
  2: ['tv', 'TV/Episodes'],
  26: ['tv', 'TV/Episodes HD'],
  27: ['tv', 'TV/Boxsets'],
  32: ['tv', 'TV/Episodes SD'],
  34: ['tv', 'TV/Anime'],
  35: ['tv', 'TV/Cartoons'],
  44: ['tv', 'TV/Foreign'],
  // Games
  17: ['games', 'Games/PC'],
  18: ['games', 'Games/PS'],
  19: ['games', 'Games/Xbox'],
  40: ['games', 'Games/Nintendo'],
  42: ['games', 'Games/Mac'],
  // Apps
  20: ['apps', 'Apps/PC'],
  21: ['apps', 'Apps/Mac'],
  22: ['apps', 'Apps/Linux'],
  24: ['apps', 'Apps/Mobile'],
  // Music
  16: ['music', 'Music/Albums'],
  31: ['music', 'Music/Singles'],
  46: ['music', 'Music/Videos'],
  // Books
  45: ['books', 'Books/EBooks'],
  // Education
  23: ['education', 'Education'],
  38: ['education', 'Education/Foreign'],
  // Other
  5: ['other', 'Other/TV-Rips'],
  28: ['other', 'Subtitles'],
  33: ['other', 'Other/Foreign'],
  41: ['other', 'Other/Boxsets'],
};

function bytesToGb(bytes: number): number {
  return bytes / (1024 ** 3);
}

function formatSize(bytes: number): string {
  const gb = bytesToGb(bytes);
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TiB`;
  if (gb >= 1) return `${gb.toFixed(1)} GiB`;
  return `${(gb * 1024).toFixed(1)} MiB`;
}

export interface DerivedFields {
  resolution: string;
  source: string;
  codec: string;
  hdr: string;
  release_group: string;
}

export function deriveFields(name: string, filename?: string): DerivedFields {
  const upper = name.toUpperCase();

  // Resolution
  const resMatch = name.match(/(2160|1080|720|480|576|4320)[pPiI]/);
  let resolution: string;
  if (resMatch) {
    resolution = resMatch[1] + 'p';
  } else if (upper.includes('4K') || upper.includes('UHD')) {
    resolution = '2160p';
  } else {
    resolution = 'unknown';
  }

  // Source
  let source: string;
  if (upper.includes('BLURAY') || upper.includes('BLU-RAY') || upper.includes('BDREMUX')) {
    source = upper.includes('REMUX') ? 'Remux' : 'BluRay';
  } else if (upper.includes('WEB-DL')) {
    source = 'WEB-DL';
  } else if (upper.includes('WEBRIP') || upper.includes('WEB-RIP')) {
    source = 'WEBRip';
  } else if (upper.includes('HDTV')) {
    source = 'HDTV';
  } else if (upper.includes('REMUX')) {
    source = 'Remux';
  } else if (upper.includes('WEB')) {
    source = 'WEB';
  } else if (upper.includes('DVDRIP') || upper.includes('DVD-RIP')) {
    source = 'DVDRip';
  } else {
    source = 'Other';
  }

  // Codec
  let codec: string;
  if (['H 265', 'X265', 'HEVC', 'H.265'].some(x => upper.includes(x))) {
    codec = 'H.265';
  } else if (['H 264', 'X264', 'AVC', 'H.264'].some(x => upper.includes(x))) {
    codec = 'H.264';
  } else if (upper.includes('AV1')) {
    codec = 'AV1';
  } else if (upper.includes('XVID')) {
    codec = 'XviD';
  } else {
    codec = 'Other';
  }

  // HDR — word-boundary regex to avoid false positives (DVD, ADVISE)
  const hasDv = /\bDV\b/.test(upper) || upper.includes('DOVI');
  let hdr: string;
  if (hasDv && upper.includes('HDR')) {
    hdr = 'DV+HDR';
  } else if (hasDv) {
    hdr = 'DV';
  } else if (upper.includes('HDR10+') || upper.includes('HDR10PLUS')) {
    hdr = 'HDR10+';
  } else if (upper.includes('HDR')) {
    hdr = 'HDR';
  } else if (upper.includes('SDR')) {
    hdr = 'SDR';
  } else {
    hdr = 'None';
  }

  // Release group — try filename first, then name
  let release_group = 'unknown';
  const fn = filename ?? '';
  const fnMatch = fn.match(/-([A-Za-z0-9]+?)(?:\.torrent)?$/);
  if (fnMatch) {
    release_group = fnMatch[1];
  } else {
    const nameMatch = name.match(/-([A-Za-z0-9]+)(?:\s|$|\))/);
    if (nameMatch) release_group = nameMatch[1];
  }

  return { resolution, source, codec, hdr, release_group };
}

export function normalizeTorrent(raw: Record<string, unknown>): NormalizedTorrent {
  const catId = Number(raw.categoryID ?? 0);
  const [catClass, catSub] = CATEGORY_MAP[catId] ?? ['unknown', `Unknown (${catId})`];
  const tags = Array.isArray(raw.tags)
    ? (raw.tags as string[]).filter(tag => tag !== 'FREELEECH')
    : [];
  const sizeBytes = Number(raw.size ?? 0);
  const name = String(raw.name ?? 'unknown');
  const filename = String(raw.filename ?? '');

  const derived = deriveFields(name, filename);

  return {
    torrent_id: Number(raw.fid ?? 0),
    name,
    filename,
    category: catClass,
    category_id: catId,
    subcategory: catSub,
    resolution: derived.resolution,
    source: derived.source,
    codec: derived.codec,
    hdr: derived.hdr,
    release_group: derived.release_group,
    size_bytes: sizeBytes,
    size_gb: bytesToGb(sizeBytes),
    size_str: formatSize(sizeBytes),
    snatched: Number(raw.completed ?? 0),
    seeders: Number(raw.seeders ?? 0),
    leechers: Number(raw.leechers ?? 0),
    comments: Number(raw.numComments ?? 0),
    date: String(raw.addedTimestamp ?? 'unknown'),
    tags,
    genres: String(raw.genres ?? ''),
    rating: Number(raw.rating ?? 0),
    imdb_id: String(raw.imdbID ?? ''),
  };
}
```

**Step 3: Run tests**

Run: `cd lambdas/scraper && npx jest`

**Step 4: Commit**

```bash
git add lambdas/scraper/src/normalize.ts lambdas/scraper/src/normalize.test.ts
git commit -m "feat: implement torrent normalization with field derivation from names"
```

---

## Task 3: Rewrite Scraper Lambda

**Files:**
- Modify: `lambdas/scraper/src/index.ts`

The scraper must:
1. Scrape TorrentLeech API pages (existing logic — keep)
2. Normalize each torrent via `normalizeTorrent()` (new)
3. Save JSON array of `NormalizedTorrent[]` to S3 (instead of CSV)
4. Track progress with day counting (existing)
5. Support cancellation (existing)

**Key changes from current:**
- Import and use `normalizeTorrent` from `./normalize`
- Save raw API response objects, normalize them, output JSON not CSV
- Remove `toCSV()` function
- The S3 key changes from `.csv` to `.json`
- Progress messages stay the same

**Step 1: Rewrite index.ts**

The handler should:
1. Login (existing logic)
2. Paginate through TorrentLeech API (existing logic)
3. For each page, extract the raw torrent list (keep existing `torrentList` extraction)
4. Call `normalizeTorrent(raw)` on each raw torrent
5. Save `NormalizedTorrent[]` as JSON to S3 at key `${userId}/datasets/${category}_${timestamp}.json`
6. Return `{ key, torrentCount }`

Keep all existing: login flow, CSRF extraction, cookie handling, pagination, day tracking, cancellation, progress updates.

Remove: `toCSV()`, `getCategoryFacets()` (inline the facets map), CSV-specific logic.

Update the S3 upload to write `JSON.stringify(normalizedTorrents)` with `ContentType: 'application/json'`.

**Step 2: Update scraper tests**

Remove CSV tests (`toCSV`, `getCategoryFacets`). Add tests for the normalization integration if needed.

**Step 3: Verify compilation**

Run: `cd lambdas/scraper && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add lambdas/scraper/src/index.ts lambdas/scraper/src/index.test.ts
git commit -m "feat: scraper saves normalized JSON dataset instead of CSV"
```

---

## Task 4: Implement Analyzer Core — Scoring & Statistics

**Files:**
- Create: `lambdas/analyzer/src/scoring.ts`
- Create: `lambdas/analyzer/src/scoring.test.ts`

These are pure functions with no AWS dependencies — easy to test.

**Step 1: Write tests**

```typescript
// lambdas/analyzer/src/scoring.test.ts
import { scoreTorrents, analyzeAttribute, sizeBucket, median, mean } from './scoring';

describe('median', () => {
  it('returns middle value for odd-length array', () => {
    expect(median([1, 3, 5])).toBe(3);
  });
  it('returns average of middle values for even-length array', () => {
    expect(median([1, 3, 5, 7])).toBe(4);
  });
});

describe('scoreTorrents', () => {
  it('computes score = snatched / (seeders + 1)', () => {
    const t = [{ snatched: 100, seeders: 9, size_gb: 2 }] as any;
    scoreTorrents(t);
    expect(t[0].score).toBe(10);
  });
  it('computes score_per_gb = score / size_gb', () => {
    const t = [{ snatched: 100, seeders: 9, size_gb: 2 }] as any;
    scoreTorrents(t);
    expect(t[0].score_per_gb).toBe(5);
  });
  it('handles zero size_gb', () => {
    const t = [{ snatched: 50, seeders: 4, size_gb: 0 }] as any;
    scoreTorrents(t);
    expect(t[0].score_per_gb).toBe(0);
  });
});

describe('sizeBucket', () => {
  it('returns correct buckets', () => {
    expect(sizeBucket(3)).toBe('0-5GB');
    expect(sizeBucket(10)).toBe('5-15GB');
    expect(sizeBucket(20)).toBe('15-30GB');
    expect(sizeBucket(45)).toBe('30-60GB');
    expect(sizeBucket(100)).toBe('60GB+');
  });
});

describe('analyzeAttribute', () => {
  it('groups torrents and computes stats', () => {
    const torrents = [
      { resolution: '1080p', score: 10, score_per_gb: 5, size_gb: 2, date: new Date('2026-03-01') },
      { resolution: '1080p', score: 20, score_per_gb: 10, size_gb: 2, date: new Date('2026-03-10') },
      { resolution: '1080p', score: 15, score_per_gb: 7.5, size_gb: 2, date: new Date('2026-03-15') },
      { resolution: '720p', score: 5, score_per_gb: 2.5, size_gb: 2, date: new Date('2026-03-05') },
      { resolution: '720p', score: 8, score_per_gb: 4, size_gb: 2, date: new Date('2026-03-12') },
      { resolution: '720p', score: 6, score_per_gb: 3, size_gb: 2, date: new Date('2026-03-14') },
    ] as any;
    const result = analyzeAttribute(torrents, (t: any) => t.resolution, 'resolution');
    expect(result['1080p']).toBeDefined();
    expect(result['1080p'].count).toBe(3);
    expect(result['720p']).toBeDefined();
    expect(result['720p'].count).toBe(3);
  });
  it('filters groups with fewer than min_samples', () => {
    const torrents = [
      { resolution: '1080p', score: 10, score_per_gb: 5, size_gb: 2, date: new Date('2026-03-01') },
      { resolution: '720p', score: 5, score_per_gb: 2.5, size_gb: 2, date: new Date('2026-03-01') },
    ] as any;
    const result = analyzeAttribute(torrents, (t: any) => t.resolution, 'resolution', 3);
    expect(Object.keys(result).length).toBe(0);
  });
});
```

**Step 2: Implement scoring.ts**

```typescript
// lambdas/analyzer/src/scoring.ts
import type { ScoredTorrent, AttributeStats } from './types';

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function quantiles(values: number[], n: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const result: number[] = [];
  for (let i = 1; i < n; i++) {
    const idx = (sorted.length * i) / n;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi || hi >= sorted.length) {
      result.push(sorted[lo]);
    } else {
      const frac = idx - lo;
      result.push(sorted[lo] * (1 - frac) + sorted[hi] * frac);
    }
  }
  return result;
}

export function scoreTorrents(torrents: ScoredTorrent[]): void {
  for (const t of torrents) {
    t.score = t.snatched / (t.seeders + 1);
    t.score_per_gb = t.size_gb > 0 ? t.score / t.size_gb : 0;
  }
}

export function sizeBucket(sizeGb: number): string {
  if (sizeGb < 5) return '0-5GB';
  if (sizeGb < 15) return '5-15GB';
  if (sizeGb < 30) return '15-30GB';
  if (sizeGb < 60) return '30-60GB';
  return '60GB+';
}

export function analyzeAttribute(
  torrents: ScoredTorrent[],
  attrFn: (t: ScoredTorrent) => string,
  _label: string,
  minSamples = 3,
): Record<string, AttributeStats> {
  const groups: Record<string, number[]> = {};
  const groupSpg: Record<string, number[]> = {};
  const groupSizes: Record<string, number[]> = {};

  for (const t of torrents) {
    const val = attrFn(t);
    if (!val) continue;
    const key = String(val);
    (groups[key] ??= []).push(t.score);
    (groupSpg[key] ??= []).push(t.score_per_gb);
    (groupSizes[key] ??= []).push(t.size_gb);
  }

  // Date range for daily estimates
  const dates = torrents.map(t => new Date(t.date + ' UTC').getTime()).filter(d => !isNaN(d));
  const dateRangeDays = dates.length > 0
    ? Math.max(1, (Math.max(...dates) - Math.min(...dates)) / 86400_000)
    : 1;

  const results: Record<string, AttributeStats> = {};
  for (const [val, scores] of Object.entries(groups)) {
    if (scores.length < minSamples) continue;
    const count = scores.length;
    const dailyCount = count / dateRangeDays;
    const medSize = median(groupSizes[val]);
    results[val] = {
      median: Math.round(median(scores) * 100) / 100,
      mean: Math.round(mean(scores) * 100) / 100,
      median_spg: Math.round(median(groupSpg[val]) * 10000) / 10000,
      mean_spg: Math.round(mean(groupSpg[val]) * 10000) / 10000,
      count,
      daily_count: Math.round(dailyCount * 100) / 100,
      daily_gb: Math.round(dailyCount * medSize * 10) / 10,
    };
  }

  // Sort by median_spg descending
  const sorted = Object.entries(results).sort((a, b) => b[1].median_spg - a[1].median_spg);
  return Object.fromEntries(sorted);
}

export function analyzeAllAttributes(torrents: ScoredTorrent[]): Record<string, Record<string, AttributeStats>> {
  return {
    category: analyzeAttribute(torrents, t => t.category, 'category'),
    subcategory: analyzeAttribute(torrents, t => t.subcategory, 'subcategory'),
    resolution: analyzeAttribute(torrents, t => t.resolution, 'resolution'),
    source: analyzeAttribute(torrents, t => t.source, 'source'),
    codec: analyzeAttribute(torrents, t => t.codec, 'codec'),
    hdr: analyzeAttribute(torrents, t => t.hdr, 'hdr'),
    size_bucket: analyzeAttribute(torrents, t => sizeBucket(t.size_gb), 'size_bucket'),
    release_group: analyzeAttribute(torrents, t => t.release_group, 'release_group'),
    resolution_x_source: analyzeAttribute(
      torrents,
      t => (t.resolution && t.source) ? `${t.resolution}_${t.source}` : '',
      'resolution_x_source',
    ),
  };
}
```

**Step 3: Run tests, commit**

```bash
cd lambdas/analyzer && npx jest
git add lambdas/analyzer/src/scoring.ts lambdas/analyzer/src/scoring.test.ts
git commit -m "feat: implement scoring and multi-dimensional attribute analysis"
```

---

## Task 5: Implement Tier Assignment

**Files:**
- Create: `lambdas/analyzer/src/tiers.ts`
- Create: `lambdas/analyzer/src/tiers.test.ts`

**Step 1: Implement tiers.ts**

Contains: `assignReleaseGroupTiers`, `assignTiers`, `classifyTorrentTier`, `calculateDailyVolume`, `calculateRateLimits`

All constants: `MIN_TORRENT_AGE_DAYS`, `MAX_SEED_DAYS`, `BURST_FACTOR`, `TARGET_UTILIZATION_PCT`, `PRIORITY_MAP`, `DELAY_MAP`, `SIZE_MAP`, `EXCEPT_RELEASES`

This file implements the exact Python logic from `analyze_and_generate_filters.py` lines 240-494.

**Step 2: Write tests for key functions**

Test `assignReleaseGroupTiers` with qualified/unqualified groups, `classifyTorrentTier` with weighted attribute scoring, `calculateRateLimits` with fill-from-top logic.

**Step 3: Run tests, commit**

```bash
git add lambdas/analyzer/src/tiers.ts lambdas/analyzer/src/tiers.test.ts
git commit -m "feat: implement tier assignment with composite ranking and rate limits"
```

---

## Task 6: Implement Filter Generation

**Files:**
- Create: `lambdas/analyzer/src/filters.ts`
- Create: `lambdas/analyzer/src/filters.test.ts`

Contains: `generateFilter`, `collectTierValues`

All constants: `CATEGORY_MAP` (autobrr patterns), `EXCLUDED_RESOLUTIONS`, `EXCLUDED_SOURCES`

This implements the exact logic from `generate_filter()` in the Python — per-tier resolution/source selection, allowlist vs blocklist strategy, rate limit application.

**Step 1: Implement filters.ts**

Port `generate_filter()` 1:1 from Python. The output must be a `GeneratedFilter` object matching the `FilterData` interface (which matches the frontend's `Filter.data` shape).

**Step 2: Write tests**

Test that each tier gets correct resolutions, sources, release group strategy, priorities, delays.

**Step 3: Run tests, commit**

```bash
git add lambdas/analyzer/src/filters.ts lambdas/analyzer/src/filters.test.ts
git commit -m "feat: implement autobrr filter generation with per-tier attribute selection"
```

---

## Task 7: Implement Simulation

**Files:**
- Create: `lambdas/analyzer/src/simulation.ts`
- Create: `lambdas/analyzer/src/simulation.test.ts`

Contains: `runSimulation`, `parseSizeStr`, `matchCategoryPattern`, `matchExceptReleases`, `torrentMatchesFilter`, `calibrateLowTier`

This is the full replay engine from the Python — day/hour FIFO processing, rate limit enforcement, storage constraints, expiry logic, steady-state metrics, and the calibration sweep.

**Step 1: Implement simulation.ts**

Port the ~400 lines of simulation logic 1:1. Key behaviors:
- Group torrents by day, process hour-by-hour
- Expire torrents after MAX_SEED_DAYS (compare against grab_date truncated to midnight)
- Try filters in priority order for each torrent
- Enforce per-filter-per-hour rate limits
- Track skip reasons (no_match, rate_limited, storage_full)
- Compute steady-state metrics from days > MAX_SEED_DAYS
- `calibrateLowTier`: sweep rate (1-10) × size caps (15-30GB), penalize blackouts

**Step 2: Write tests**

Test `torrentMatchesFilter` with various criteria, `parseSizeStr`, `matchCategoryPattern`, basic simulation with a few torrents.

**Step 3: Run tests, commit**

```bash
git add lambdas/analyzer/src/simulation.ts lambdas/analyzer/src/simulation.test.ts
git commit -m "feat: implement filter simulation engine with calibration sweep"
```

---

## Task 8: Implement Markdown Report Generation

**Files:**
- Create: `lambdas/analyzer/src/report.ts`

Port the `generate_report()` function from Python. This generates the comprehensive analysis markdown report and returns it as a string. The handler will upload it to S3.

Sections: methodology, attribute rankings, release group tiers, storage budget, generated filters, simulation results, configuration reference.

**Step 1: Implement report.ts**

**Step 2: Commit**

```bash
git add lambdas/analyzer/src/report.ts
git commit -m "feat: implement markdown analysis report generation"
```

---

## Task 9: Rewrite Analyzer Lambda Handler

**Files:**
- Modify: `lambdas/analyzer/src/index.ts`

The handler orchestrates everything:

1. Read JSON dataset from S3
2. Filter mature torrents (`age_days >= MIN_TORRENT_AGE_DAYS`)
3. Filter except_releases patterns
4. Score torrents
5. Analyze all attributes
6. Assign tiers
7. Calculate daily volume and rate limits
8. Generate 4 filter JSONs
9. Run staged simulation:
   - Stage 1: high only
   - Stage 2: high + medium
   - Stage 3: calibrate low tier
10. Write final filters to DynamoDB (Filters table with `_source: "generated"`)
11. Upload markdown report to S3
12. Report progress throughout via DynamoDB job updates

**Step 1: Rewrite index.ts**

The handler imports from `scoring.ts`, `tiers.ts`, `filters.ts`, `simulation.ts`, `report.ts` and orchestrates the full pipeline. Progress updates at each stage.

**Step 2: Add `@aws-sdk/lib-dynamodb` PutCommand for writing filters to DynamoDB**

Each generated filter is written as a record in the Filters table:
```typescript
{
  user_id: event.userId,
  filter_id: `gen-${source}-${tierName}`,  // deterministic ID for upsert
  name: filter.name,
  version: filter.version,
  data: filter.data,
  _source: 'generated',
  created_at: new Date().toISOString(),
}
```

Using a deterministic `filter_id` means re-running "Generate Filters" overwrites the previous generated filters rather than creating duplicates.

**Step 3: Verify compilation, commit**

```bash
cd lambdas/analyzer && npx tsc --noEmit
git add lambdas/analyzer/src/
git commit -m "feat: rewrite analyzer handler with full Python-parity pipeline"
```

---

## Task 10: Update Backend to Return Generated Filters

**Files:**
- Modify: `backend/src/filters/filters.controller.ts`

The `GET /filters` endpoint already queries the DynamoDB Filters table. Since generated filters are now written there with `_source: "generated"`, they'll be returned automatically.

However, the controller needs to map `filter_id` to `_id` and include `_source` in the response so the frontend can distinguish generated from saved filters.

**Step 1: Update the list response mapping**

In `filters.controller.ts`, map the DynamoDB response to include `_id` and `_source`:

```typescript
@Get()
async list(@Req() req: any) {
  const items = await this.filters.list(req.userId ?? 'dev-user');
  return items.map((item: any) => ({
    _id: item.filter_id,
    _source: item._source ?? 'saved',
    name: item.name,
    version: item.version ?? '1.0',
    data: item.data,
  }));
}
```

**Step 2: Commit**

```bash
git add backend/src/filters/filters.controller.ts
git commit -m "feat: map filter records to include _id and _source for frontend"
```

---

## Task 11: Update Backend Pipeline for New Data Flow

**Files:**
- Modify: `backend/src/pipeline/pipeline.service.ts`

The `startAnalyze` method currently passes `datasetKey` which points to a CSV. Now it needs to point to the JSON dataset.

The datasets service also needs updating to list `.json` files instead of `.csv`.

**Step 1: Update datasets service**

In `backend/src/datasets/datasets.service.ts`, update the filename regex to match `.json`:

Old: `torrents_data_{category}_{timestamp}.csv`
New: `{category}_{timestamp}.json`

**Step 2: Commit**

```bash
git add backend/src/datasets/datasets.service.ts backend/src/pipeline/pipeline.service.ts
git commit -m "feat: update backend for JSON dataset format"
```

---

## Task 12: Update Docker Compose

**Files:**
- Modify: `docker-compose.yml`

No new Lambda container needed — we still have 2 Lambdas (scraper + analyzer). The scraper now does normalization inline. Just verify existing Docker setup works.

**Step 1: Rebuild containers**

```bash
docker compose down && docker compose up -d --build
```

**Step 2: Verify scraper and analyzer containers start**

**Step 3: Commit if any changes needed**

---

## Task 13: End-to-End Verification

**Manual testing:**

1. Start Docker stack + backend + frontend
2. Run a scrape → verify JSON dataset saved to S3 with all normalized fields
3. Check dataset appears in frontend dropdown
4. Click "Generate Filters" → verify:
   - Analyzer reads JSON dataset
   - Progress updates show in UI
   - 4 filters appear in DynamoDB Filters table with `_source: "generated"`
   - Filters appear in the frontend filter list under "Generated" section
   - Markdown report saved to S3
5. Select a generated filter → verify all fields populated (resolutions, sources, release groups, rate limits, etc.)
6. Run simulation → verify results display correctly
