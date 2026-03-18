import {
  generateFilter,
  collectTierValues,
  PRIORITY_MAP,
  DELAY_MAP,
  SIZE_MAP,
  EXCEPT_RELEASES,
} from './filters';
import type { AttributeStats, RateLimit } from './types';

function makeStats(overrides: Partial<AttributeStats> = {}): AttributeStats {
  return {
    median: 10,
    mean: 10,
    median_spg: 5,
    mean_spg: 5,
    count: 20,
    daily_count: 2,
    daily_gb: 10,
    ...overrides,
  };
}

const baseTiers: Record<string, Record<string, string>> = {
  resolution: {
    '2160p': 'high',
    '1080p': 'medium',
    '720p': 'low',
    '480p': 'low',
    unknown: 'low',
  },
  source: {
    Remux: 'high',
    BluRay: 'high',
    'WEB-DL': 'medium',
    WEBRip: 'medium',
    HDTV: 'low',
    DVDRip: 'low',
    Other: 'low',
  },
  category: {
    movies: 'high',
    tv: 'medium',
  },
  release_group: {
    SPARKS: 'high',
    FGT: 'high',
    RARBG: 'medium',
    EVO: 'medium',
    YIFY: 'low',
    TGx: 'low',
  },
};

const baseRateLimits: Record<string, RateLimit> = {
  high: { enabled: true, daily_gb: 50, torrents_per_day: 10, max_downloads_per_hour: 4 },
  medium: { enabled: true, daily_gb: 100, torrents_per_day: 20, max_downloads_per_hour: 7 },
  low: { enabled: true, daily_gb: 200, torrents_per_day: 40, max_downloads_per_hour: 7 },
  opportunistic: { enabled: false, daily_gb: 0, torrents_per_day: 0, max_downloads_per_hour: 0 },
};

const baseAnalyses: Record<string, Record<string, AttributeStats>> = {
  resolution: {
    '2160p': makeStats(),
    '1080p': makeStats(),
    '720p': makeStats(),
  },
  source: {
    BluRay: makeStats(),
    'WEB-DL': makeStats(),
  },
};

describe('collectTierValues', () => {
  it('returns values matching target tiers', () => {
    const tierMap = { a: 'high', b: 'medium', c: 'low', d: 'high' };
    expect(collectTierValues(tierMap, ['high']).sort()).toEqual(['a', 'd']);
  });

  it('returns values matching multiple target tiers', () => {
    const tierMap = { a: 'high', b: 'medium', c: 'low' };
    expect(collectTierValues(tierMap, ['high', 'medium']).sort()).toEqual(['a', 'b']);
  });

  it('returns empty for no matches', () => {
    const tierMap = { a: 'low', b: 'low' };
    expect(collectTierValues(tierMap, ['high'])).toEqual([]);
  });
});

describe('generateFilter', () => {
  describe('high tier (index 0)', () => {
    it('has correct priority and delay', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.priority).toBe(PRIORITY_MAP[0]);
      expect(filter.data.delay).toBe(DELAY_MAP[0]);
    });

    it('uses high+medium resolutions minus excluded', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      // high+medium resolutions: 2160p, 1080p; excluded: unknown, 480p, 576p
      expect(filter.data.resolutions).toContain('2160p');
      expect(filter.data.resolutions).toContain('1080p');
      expect(filter.data.resolutions).not.toContain('unknown');
      expect(filter.data.resolutions).not.toContain('480p');
    });

    it('uses high+medium sources minus excluded', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.sources).toContain('BluRay');
      expect(filter.data.sources).toContain('Remux');
      expect(filter.data.sources).toContain('WEB-DL');
      expect(filter.data.sources).toContain('WEBRip');
      expect(filter.data.sources).not.toContain('HDTV');
      expect(filter.data.sources).not.toContain('DVDRip');
      expect(filter.data.sources).not.toContain('Other');
    });

    it('uses allowlist (match_release_groups) for high tier', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.match_release_groups).toContain('SPARKS');
      expect(filter.data.match_release_groups).toContain('FGT');
      expect(filter.data.except_release_groups).toBe('');
    });

    it('generates correct filter name', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.name).toBe('fl-freeleech-high-priority');
    });

    it('sets freeleech true for freeleech source', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.freeleech).toBe(true);
    });

    it('sets freeleech false for non-freeleech source', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'movies', baseAnalyses);
      expect(filter.data.freeleech).toBe(false);
    });
  });

  describe('medium tier (index 1)', () => {
    it('uses only medium resolutions minus excluded', () => {
      const filter = generateFilter('Medium', 1, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.resolutions).toContain('1080p');
      expect(filter.data.resolutions).not.toContain('2160p'); // 2160p is high, not medium
    });

    it('uses blocklist (except_release_groups) for medium tier', () => {
      const filter = generateFilter('Medium', 1, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.except_release_groups).toContain('YIFY');
      expect(filter.data.except_release_groups).toContain('TGx');
      expect(filter.data.match_release_groups).toBe('');
    });

    it('has correct priority', () => {
      const filter = generateFilter('Medium', 1, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.priority).toBe(3);
    });
  });

  describe('low tier (index 2)', () => {
    it('uses all resolutions except unknown', () => {
      const filter = generateFilter('Low', 2, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.resolutions).toContain('1080p');
      expect(filter.data.resolutions).toContain('720p');
      expect(filter.data.resolutions).toContain('2160p');
      expect(filter.data.resolutions).toContain('480p');
      expect(filter.data.resolutions).not.toContain('unknown');
    });

    it('uses all sources except Other', () => {
      const filter = generateFilter('Low', 2, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.sources).toContain('BluRay');
      expect(filter.data.sources).toContain('HDTV');
      expect(filter.data.sources).toContain('DVDRip');
      expect(filter.data.sources).not.toContain('Other');
    });

    it('uses blocklist for low tier', () => {
      const filter = generateFilter('Low', 2, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.except_release_groups).toContain('YIFY');
      expect(filter.data.match_release_groups).toBe('');
    });
  });

  describe('opportunistic tier (index 3)', () => {
    it('uses only 720p and 1080p resolutions', () => {
      const filter = generateFilter('Opportunistic', 3, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.resolutions).toEqual(['1080p', '720p']);
    });

    it('uses smaller max_size', () => {
      const filter = generateFilter('Opportunistic', 3, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.max_size).toBe('15GB');
    });

    it('is disabled', () => {
      const filter = generateFilter('Opportunistic', 3, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.enabled).toBe(false);
    });

    it('uses non-excluded sources from high+medium', () => {
      const filter = generateFilter('Opportunistic', 3, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.sources).toContain('BluRay');
      expect(filter.data.sources).toContain('Remux');
      expect(filter.data.sources).not.toContain('HDTV');
    });
  });

  describe('common properties', () => {
    it('sets version to 1.0', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.version).toBe('1.0');
    });

    it('includes except_releases', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.except_releases).toBe(EXCEPT_RELEASES);
    });

    it('sets announce_types to NEW', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.announce_types).toEqual(['NEW']);
    });

    it('sets match_categories from category tiers', () => {
      const filter = generateFilter('High', 0, baseTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.match_categories).toBe('Movies*,TV*');
    });

    it('falls back to Movies*,TV* when no categories match', () => {
      const emptyTiers = { ...baseTiers, category: {} };
      const filter = generateFilter('High', 0, emptyTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.match_categories).toBe('Movies*,TV*');
    });

    it('falls back to default resolutions when none match', () => {
      const emptyTiers = { ...baseTiers, resolution: {} };
      const filter = generateFilter('High', 0, emptyTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.resolutions).toEqual(['1080p', '2160p']);
    });

    it('falls back to default sources when none match', () => {
      const emptyTiers = { ...baseTiers, source: {} };
      const filter = generateFilter('High', 0, emptyTiers, baseRateLimits, 'freeleech', baseAnalyses);
      expect(filter.data.sources).toEqual(['BluRay', 'Remux', 'WEB-DL', 'WEBRip']);
    });
  });
});
