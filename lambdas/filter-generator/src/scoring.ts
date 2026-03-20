import type { ScoredTorrent, AttributeStats } from './types';

/**
 * Return the median of a numeric array.
 * For even-length arrays, returns the average of the two middle values.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Return the arithmetic mean of a numeric array.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Python-compatible quantiles: splits sorted values into n equal groups
 * and returns n-1 cut points using linear interpolation.
 *
 * This mirrors Python's statistics.quantiles(data, n=n, method='exclusive').
 */
export function quantiles(values: number[], n: number): number[] {
  if (values.length < 2) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const result: number[] = [];
  for (let i = 1; i < n; i++) {
    // Python statistics.quantiles uses method='exclusive' by default:
    // idx = (len+1) * i / n  (1-based), then interpolate
    const m = sorted.length + 1;
    const j = (m * i) / n; // 1-based position
    const lo = Math.floor(j) - 1; // convert to 0-based
    const hi = Math.ceil(j) - 1;
    if (lo < 0) {
      result.push(sorted[0]);
    } else if (hi >= sorted.length) {
      result.push(sorted[sorted.length - 1]);
    } else if (lo === hi) {
      result.push(sorted[lo]);
    } else {
      const frac = j - Math.floor(j);
      result.push(sorted[lo] * (1 - frac) + sorted[hi] * frac);
    }
  }
  return result;
}

/**
 * Add score and score_per_gb fields to each torrent (mutates in place).
 * score = snatched / (seeders + 1)
 * score_per_gb = score / size_gb  (0 if size_gb is 0)
 */
export function scoreTorrents(torrents: ScoredTorrent[]): void {
  for (const t of torrents) {
    t.score = t.snatched / (t.seeders + 1);
    t.score_per_gb = t.size_gb > 0 ? t.score / t.size_gb : 0;
  }
}

/**
 * Map a torrent size in GB to a human-readable bucket label.
 */
export function sizeBucket(sizeGb: number): string {
  if (sizeGb < 5) return '0-5GB';
  if (sizeGb < 15) return '5-15GB';
  if (sizeGb < 30) return '15-30GB';
  if (sizeGb < 60) return '30-60GB';
  return '60GB+';
}

/**
 * Group torrents by an attribute function, compute per-group statistics.
 * Groups with fewer than minSamples torrents are excluded.
 * Results are sorted by median_spg descending.
 */
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

  // Compute date range for daily estimates
  const dates = torrents
    .map(t => new Date(t.date + (t.date.includes('T') ? '' : ' UTC')).getTime())
    .filter(d => !isNaN(d));
  const dateRangeDays =
    dates.length > 0
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

/**
 * Analyze torrents across all 9 dimensions (1:1 with Python analyze_all_attributes).
 */
export function analyzeAllAttributes(
  torrents: ScoredTorrent[],
): Record<string, Record<string, AttributeStats>> {
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
      t => (t.resolution && t.source ? `${t.resolution}_${t.source}` : ''),
      'resolution_x_source',
    ),
  };
}
