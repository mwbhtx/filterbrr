import { median, mean, quantiles, scoreTorrents, sizeBucket, analyzeAttribute } from './scoring';
import type { ScoredTorrent } from './types';

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });
  it('returns the single value for length-1 array', () => {
    expect(median([42])).toBe(42);
  });
  it('returns middle value for odd-length array', () => {
    expect(median([1, 3, 5])).toBe(3);
  });
  it('returns average of middle values for even-length array', () => {
    expect(median([1, 3, 5, 7])).toBe(4);
  });
  it('handles unsorted input', () => {
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });
  it('computes arithmetic mean', () => {
    expect(mean([2, 4, 6])).toBe(4);
  });
  it('handles single value', () => {
    expect(mean([10])).toBe(10);
  });
});

describe('quantiles', () => {
  it('returns empty for single value', () => {
    expect(quantiles([5], 4)).toEqual([]);
  });
  it('splits into 4 quartiles (3 cut points)', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const q = quantiles(vals, 4);
    expect(q).toHaveLength(3);
    // Python: quantiles([1..10], n=4, method='exclusive') => [2.75, 5.5, 8.25]
    expect(q[0]).toBeCloseTo(2.75, 1);
    expect(q[1]).toBeCloseTo(5.5, 1);
    expect(q[2]).toBeCloseTo(8.25, 1);
  });
  it('handles small arrays', () => {
    const q = quantiles([1, 2, 3, 4], 4);
    expect(q).toHaveLength(3);
  });
});

describe('scoreTorrents', () => {
  it('computes score = snatched / (seeders + 1)', () => {
    const t = [{ snatched: 100, seeders: 9, size_gb: 2 }] as unknown as ScoredTorrent[];
    scoreTorrents(t);
    expect(t[0].score).toBe(10);
  });
  it('computes score_per_gb = score / size_gb', () => {
    const t = [{ snatched: 100, seeders: 9, size_gb: 2 }] as unknown as ScoredTorrent[];
    scoreTorrents(t);
    expect(t[0].score_per_gb).toBe(5);
  });
  it('handles zero size_gb', () => {
    const t = [{ snatched: 50, seeders: 4, size_gb: 0 }] as unknown as ScoredTorrent[];
    scoreTorrents(t);
    expect(t[0].score_per_gb).toBe(0);
  });
  it('handles zero seeders', () => {
    const t = [{ snatched: 20, seeders: 0, size_gb: 4 }] as unknown as ScoredTorrent[];
    scoreTorrents(t);
    expect(t[0].score).toBe(20);
    expect(t[0].score_per_gb).toBe(5);
  });
});

describe('sizeBucket', () => {
  it('returns 0-5GB for small files', () => {
    expect(sizeBucket(0)).toBe('0-5GB');
    expect(sizeBucket(3)).toBe('0-5GB');
    expect(sizeBucket(4.99)).toBe('0-5GB');
  });
  it('returns 5-15GB', () => {
    expect(sizeBucket(5)).toBe('5-15GB');
    expect(sizeBucket(10)).toBe('5-15GB');
  });
  it('returns 15-30GB', () => {
    expect(sizeBucket(15)).toBe('15-30GB');
    expect(sizeBucket(20)).toBe('15-30GB');
  });
  it('returns 30-60GB', () => {
    expect(sizeBucket(30)).toBe('30-60GB');
    expect(sizeBucket(45)).toBe('30-60GB');
  });
  it('returns 60GB+ for large files', () => {
    expect(sizeBucket(60)).toBe('60GB+');
    expect(sizeBucket(100)).toBe('60GB+');
  });
});

describe('analyzeAttribute', () => {
  const makeTorrent = (resolution: string, score: number, spg: number, sizeGb: number, dateStr: string) =>
    ({
      resolution,
      score,
      score_per_gb: spg,
      size_gb: sizeGb,
      date: dateStr,
    }) as unknown as ScoredTorrent;

  it('groups torrents and computes stats', () => {
    const torrents = [
      makeTorrent('1080p', 10, 5, 2, '2026-03-01 00:00:00'),
      makeTorrent('1080p', 20, 10, 2, '2026-03-10 00:00:00'),
      makeTorrent('1080p', 15, 7.5, 2, '2026-03-15 00:00:00'),
      makeTorrent('720p', 5, 2.5, 2, '2026-03-05 00:00:00'),
      makeTorrent('720p', 8, 4, 2, '2026-03-12 00:00:00'),
      makeTorrent('720p', 6, 3, 2, '2026-03-14 00:00:00'),
    ];
    const result = analyzeAttribute(torrents, (t: ScoredTorrent) => t.resolution, 'resolution');
    expect(result['1080p']).toBeDefined();
    expect(result['1080p'].count).toBe(3);
    expect(result['1080p'].median).toBe(15);
    expect(result['1080p'].median_spg).toBe(7.5);
    expect(result['720p']).toBeDefined();
    expect(result['720p'].count).toBe(3);
  });

  it('sorts by median_spg descending', () => {
    const torrents = [
      makeTorrent('1080p', 10, 5, 2, '2026-03-01 00:00:00'),
      makeTorrent('1080p', 20, 10, 2, '2026-03-10 00:00:00'),
      makeTorrent('1080p', 15, 7.5, 2, '2026-03-15 00:00:00'),
      makeTorrent('720p', 5, 2.5, 2, '2026-03-05 00:00:00'),
      makeTorrent('720p', 8, 4, 2, '2026-03-12 00:00:00'),
      makeTorrent('720p', 6, 3, 2, '2026-03-14 00:00:00'),
    ];
    const result = analyzeAttribute(torrents, (t: ScoredTorrent) => t.resolution, 'resolution');
    const keys = Object.keys(result);
    // 1080p has higher median_spg (7.5) than 720p (3)
    expect(keys[0]).toBe('1080p');
    expect(keys[1]).toBe('720p');
  });

  it('filters groups with fewer than minSamples', () => {
    const torrents = [
      makeTorrent('1080p', 10, 5, 2, '2026-03-01 00:00:00'),
      makeTorrent('720p', 5, 2.5, 2, '2026-03-01 00:00:00'),
    ];
    const result = analyzeAttribute(torrents, (t: ScoredTorrent) => t.resolution, 'resolution', 3);
    expect(Object.keys(result).length).toBe(0);
  });

  it('skips empty attribute values', () => {
    const torrents = [
      makeTorrent('', 10, 5, 2, '2026-03-01 00:00:00'),
      makeTorrent('', 20, 10, 2, '2026-03-10 00:00:00'),
      makeTorrent('', 15, 7.5, 2, '2026-03-15 00:00:00'),
    ];
    const result = analyzeAttribute(torrents, (t: ScoredTorrent) => t.resolution, 'resolution');
    expect(Object.keys(result).length).toBe(0);
  });
});
