import {
  assignReleaseGroupTiers,
  assignTiers,
  classifyTorrentTier,
  calculateDailyVolume,
  calculateRateLimits,
} from './tiers';
import type { ScoredTorrent, AttributeStats } from './types';

// Helper to build minimal AttributeStats
function makeStats(overrides: Partial<AttributeStats> & { count: number; median_spg: number }): AttributeStats {
  const { count, median_spg, ...rest } = overrides;
  return {
    median: 10,
    mean: 10,
    median_spg,
    mean_spg: median_spg,
    count,
    daily_count: 1,
    daily_gb: 5,
    ...rest,
  };
}

// Helper to build a minimal ScoredTorrent
function makeTorrent(overrides: Partial<ScoredTorrent>): ScoredTorrent {
  return {
    torrent_id: 1,
    name: 'Test',
    filename: '',
    category: 'movies',
    category_id: 13,
    subcategory: 'Movies/BluRay',
    resolution: '1080p',
    source: 'BluRay',
    codec: 'H.264',
    hdr: 'None',
    release_group: 'GROUP',
    size_bytes: 2147483648,
    size_gb: 2,
    size_str: '2.0 GiB',
    snatched: 50,
    seeders: 10,
    leechers: 2,
    comments: 0,
    date: '2026-03-10 12:00:00',
    tags: [],
    genres: '',
    rating: 0,
    imdb_id: '',
    score: 4.55,
    score_per_gb: 2.27,
    age_days: 5,
    ...overrides,
  };
}

describe('assignReleaseGroupTiers', () => {
  it('returns empty for no qualified groups', () => {
    const results = {
      GRP1: makeStats({ count: 5, median_spg: 10 }),
      GRP2: makeStats({ count: 3, median_spg: 8 }),
    };
    const tiers = assignReleaseGroupTiers(results, []);
    expect(tiers).toEqual({});
  });

  it('returns all medium when fewer than 4 qualified groups', () => {
    const results = {
      GRP1: makeStats({ count: 10, median_spg: 10 }),
      GRP2: makeStats({ count: 15, median_spg: 8 }),
      GRP3: makeStats({ count: 12, median_spg: 6 }),
    };
    const tiers = assignReleaseGroupTiers(results, []);
    expect(Object.values(tiers).every(t => t === 'medium')).toBe(true);
  });

  it('assigns high/medium/low tiers based on composite ranking', () => {
    // Create 8 groups with enough torrents
    const results: Record<string, AttributeStats> = {};
    const torrents: ScoredTorrent[] = [];
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    groups.forEach((g, idx) => {
      results[g] = makeStats({
        count: 15,
        median: 100 - idx * 10,
        median_spg: 50 - idx * 5,
      });
      // Create torrents for composite ranking
      for (let i = 0; i < 15; i++) {
        torrents.push(
          makeTorrent({
            torrent_id: idx * 100 + i,
            release_group: g,
            snatched: 200 - idx * 20,
            score_per_gb: 50 - idx * 5,
          }),
        );
      }
    });

    const tiers = assignReleaseGroupTiers(results, torrents);

    // 8 groups: top 25% (2) = high, middle 50% (4) = medium, bottom 25% (2) = low
    const tierCounts = { high: 0, medium: 0, low: 0 };
    for (const t of Object.values(tiers)) {
      tierCounts[t as keyof typeof tierCounts]++;
    }
    expect(tierCounts.high).toBe(2);
    expect(tierCounts.medium).toBe(4);
    expect(tierCounts.low).toBe(2);

    // Best group (A) should be high, worst (H) should be low
    expect(tiers['A']).toBe('high');
    expect(tiers['H']).toBe('low');
  });

  it('ignores groups with count < 10', () => {
    const results: Record<string, AttributeStats> = {
      GOOD: makeStats({ count: 20, median_spg: 50 }),
      SMALL: makeStats({ count: 5, median_spg: 100 }),
      OK1: makeStats({ count: 10, median_spg: 30 }),
      OK2: makeStats({ count: 10, median_spg: 20 }),
      OK3: makeStats({ count: 10, median_spg: 10 }),
    };
    const torrents: ScoredTorrent[] = [];
    for (const g of ['GOOD', 'OK1', 'OK2', 'OK3']) {
      for (let i = 0; i < 20; i++) {
        torrents.push(makeTorrent({ torrent_id: Math.random() * 10000, release_group: g, snatched: 50, score_per_gb: 10 }));
      }
    }
    const tiers = assignReleaseGroupTiers(results, torrents);
    expect(tiers['SMALL']).toBeUndefined();
    expect(tiers['GOOD']).toBeDefined();
  });
});

describe('assignTiers', () => {
  it('assigns high/medium/low based on spg percentiles', () => {
    // Need >= 4 values for quantiles to work
    const analyses = {
      resolution: {
        '2160p': makeStats({ count: 10, median_spg: 100 }),
        '1080p': makeStats({ count: 10, median_spg: 50 }),
        '720p': makeStats({ count: 10, median_spg: 20 }),
        '480p': makeStats({ count: 10, median_spg: 5 }),
        'unknown': makeStats({ count: 10, median_spg: 1 }),
      },
    };
    const tiers = assignTiers(analyses, []);
    expect(tiers.resolution['2160p']).toBe('high');
    // With quantiles([100,50,20,5,1], n=4) => p25=3.0, p75=75.0
    // 480p (spg=5) >= p25 (3.0) => medium; only unknown (spg=1) < p25 => low
    expect(tiers.resolution['480p']).toBe('medium');
    expect(tiers.resolution['unknown']).toBe('low');
  });

  it('assigns all medium when fewer than 4 values', () => {
    const analyses = {
      resolution: {
        '1080p': makeStats({ count: 10, median_spg: 50 }),
        '720p': makeStats({ count: 10, median_spg: 20 }),
      },
    };
    const tiers = assignTiers(analyses, []);
    expect(tiers.resolution['1080p']).toBe('medium');
    expect(tiers.resolution['720p']).toBe('medium');
  });

  it('handles empty results', () => {
    const tiers = assignTiers({ resolution: {} }, []);
    expect(tiers.resolution).toEqual({});
  });
});

describe('classifyTorrentTier', () => {
  const tiers = {
    category: { movies: 'high', tv: 'medium', games: 'low' },
    resolution: { '2160p': 'high', '1080p': 'medium', '720p': 'low' },
    source: { BluRay: 'high', 'WEB-DL': 'medium', HDTV: 'low' },
    size_bucket: { '0-5GB': 'high', '5-15GB': 'medium', '15-30GB': 'low' },
    release_group: { SPARKS: 'high', RARBG: 'medium', YIFY: 'low' },
  };

  it('returns high when most attributes are high', () => {
    const t = makeTorrent({
      category: 'movies',
      resolution: '2160p',
      source: 'BluRay',
      size_gb: 2,
      release_group: 'SPARKS',
    });
    expect(classifyTorrentTier(t, tiers)).toBe('high');
  });

  it('returns low when most attributes are low', () => {
    const t = makeTorrent({
      category: 'games',
      resolution: '720p',
      source: 'HDTV',
      size_gb: 20,
      release_group: 'YIFY',
    });
    expect(classifyTorrentTier(t, tiers)).toBe('low');
  });

  it('release group has double weight', () => {
    // 2 low attributes (category, resolution) vs 1 high RG (weight 2)
    const t = makeTorrent({
      category: 'games',     // low (1)
      resolution: '720p',    // low (1)
      source: 'WEB-DL',     // medium (1)
      size_gb: 8,            // medium - 5-15GB
      release_group: 'SPARKS', // high (2)
    });
    // scores: high=2, medium=2, low=2 => tie => high wins
    expect(classifyTorrentTier(t, tiers)).toBe('high');
  });

  it('defaults to medium when no attributes match', () => {
    const t = makeTorrent({
      category: 'unknown',
      resolution: 'unknown',
      source: 'Other',
      size_gb: 100,
      release_group: 'NOGROUP',
    });
    expect(classifyTorrentTier(t, tiers)).toBe('medium');
  });
});

describe('calculateDailyVolume', () => {
  it('classifies torrents and computes per-tier stats', () => {
    const tiers = {
      category: { movies: 'high' },
      resolution: { '1080p': 'high' },
      source: { BluRay: 'high' },
      size_bucket: { '0-5GB': 'high' },
      release_group: {},
    };
    const torrents = [
      makeTorrent({ torrent_id: 1, date: '2026-03-01 00:00:00' }),
      makeTorrent({ torrent_id: 2, date: '2026-03-10 00:00:00' }),
      makeTorrent({ torrent_id: 3, date: '2026-03-15 00:00:00' }),
    ];
    const { dailyVolume, medianSizes } = calculateDailyVolume(torrents, tiers);
    expect(dailyVolume['high'].count).toBe(3);
    expect(dailyVolume['high'].torrents_per_day).toBeGreaterThan(0);
    expect(medianSizes['high']).toBe(2);
  });

  it('returns empty for no torrents', () => {
    const { dailyVolume } = calculateDailyVolume([], {});
    expect(dailyVolume).toEqual({});
  });
});

describe('calculateRateLimits', () => {
  it('allocates budget fill-from-top', () => {
    const dailyVolume = {
      high: { count: 100, torrents_per_day: 10, daily_gb: 50 },
      medium: { count: 200, torrents_per_day: 20, daily_gb: 100 },
      low: { count: 300, torrents_per_day: 30, daily_gb: 150 },
      opportunistic: { count: 50, torrents_per_day: 5, daily_gb: 25 },
    };
    const medianSizes = { high: 5, medium: 5, low: 5, opportunistic: 5 };

    // 4TB storage, MAX_SEED_DAYS=10 => max_daily_gb = 409.6
    const limits = calculateRateLimits(dailyVolume, medianSizes, 4);

    expect(limits.max_daily_gb).toBeCloseTo(409.6, 1);
    expect((limits['high'] as any).enabled).toBe(true);
    expect((limits['high'] as any).daily_gb).toBe(50);
    expect((limits['medium'] as any).enabled).toBe(true);
    expect((limits['medium'] as any).daily_gb).toBe(100);
    // Low gets the remainder: 409.6 - 50 - 100 = 259.6
    expect((limits['low'] as any).enabled).toBe(true);
    expect((limits['low'] as any).daily_gb).toBeCloseTo(259.6, 1);
    // Opportunistic is disabled
    expect((limits['opportunistic'] as any).enabled).toBe(false);
  });

  it('disables low when high+medium exhaust budget', () => {
    const dailyVolume = {
      high: { count: 100, torrents_per_day: 50, daily_gb: 300 },
      medium: { count: 200, torrents_per_day: 50, daily_gb: 200 },
      low: { count: 50, torrents_per_day: 10, daily_gb: 50 },
      opportunistic: { count: 10, torrents_per_day: 2, daily_gb: 10 },
    };
    const medianSizes = { high: 6, medium: 4, low: 5, opportunistic: 3 };

    // 4TB => 409.6 GB/day. High takes 300, medium takes min(200, 109.6)=109.6, low gets 0
    const limits = calculateRateLimits(dailyVolume, medianSizes, 4);
    expect((limits['low'] as any).enabled).toBe(false);
  });

  it('uses lower burst factor for low tier', () => {
    const dailyVolume = {
      high: { count: 10, torrents_per_day: 1, daily_gb: 5 },
      medium: { count: 10, torrents_per_day: 1, daily_gb: 5 },
      low: { count: 100, torrents_per_day: 10, daily_gb: 50 },
      opportunistic: { count: 0, torrents_per_day: 0, daily_gb: 0 },
    };
    const medianSizes = { high: 5, medium: 5, low: 5, opportunistic: 0 };

    const limits = calculateRateLimits(dailyVolume, medianSizes, 4);
    // Low tier should use BURST_FACTOR//2 = 4 (default BURST_FACTOR=8)
    const lowLimits = limits['low'] as any;
    expect(lowLimits.enabled).toBe(true);
    // max_dph = round(tpd/24 * 4)
    const expectedTpd = lowLimits.daily_gb / 5;
    const expectedDph = Math.max(1, Math.round((expectedTpd / 24) * 4));
    expect(lowLimits.max_downloads_per_hour).toBe(expectedDph);
  });
});
