import {
  parseSizeStr,
  matchCategoryPattern,
  matchExceptReleases,
  torrentMatchesFilter,
  runSimulation,
} from 'filter-engine';
import type { FilterDef, SimulationConfig } from 'filter-engine';
import type { NormalizedTorrent, FilterData, GeneratedFilter } from './types';
import { calibrateLowTier } from './simulation';

// ---------------------------------------------------------------------------
// parseSizeStr
// ---------------------------------------------------------------------------

describe('parseSizeStr', () => {
  it('parses GB values', () => {
    expect(parseSizeStr('30GB')).toBe(30);
    expect(parseSizeStr('1.5GB')).toBe(1.5);
  });

  it('parses TB values', () => {
    expect(parseSizeStr('1TB')).toBe(1024);
    expect(parseSizeStr('1.5TB')).toBe(1536);
  });

  it('parses MB values', () => {
    expect(parseSizeStr('512MB')).toBe(0.5);
    expect(parseSizeStr('1024MB')).toBe(1);
  });

  it('handles whitespace and case', () => {
    expect(parseSizeStr(' 30gb ')).toBe(30);
    expect(parseSizeStr('2Tb')).toBe(2048);
  });

  it('handles bare numbers (treated as bytes)', () => {
    expect(parseSizeStr('10')).toBe(10 / 1e9);
  });
});

// ---------------------------------------------------------------------------
// matchCategoryPattern
// ---------------------------------------------------------------------------

describe('matchCategoryPattern', () => {
  it('matches exact category (case-insensitive)', () => {
    expect(matchCategoryPattern('Movies', 'movies')).toBe(true);
    expect(matchCategoryPattern('movies', 'Movies')).toBe(true);
    expect(matchCategoryPattern('TV', 'Movies')).toBe(false);
  });

  it('matches wildcard patterns', () => {
    expect(matchCategoryPattern('Movies', 'Movies*')).toBe(true);
    expect(matchCategoryPattern('Movies/Cam', 'Movies*')).toBe(true);
    expect(matchCategoryPattern('movies/hd', 'Movies*')).toBe(true);
    expect(matchCategoryPattern('TV', 'Movies*')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchExceptReleases
// ---------------------------------------------------------------------------

describe('matchExceptReleases', () => {
  it('matches glob patterns', () => {
    expect(matchExceptReleases('Olympics 2024', '*Olympics*')).toBe(true);
    expect(matchExceptReleases('The Collection', '*Collection*')).toBe(true);
    expect(matchExceptReleases('Normal Movie', '*Olympics*')).toBe(false);
  });

  it('handles comma-separated patterns', () => {
    const patterns = '*Olympics*,*Collection*,*Mega*';
    expect(matchExceptReleases('Olympics 2024', patterns)).toBe(true);
    expect(matchExceptReleases('Mega Pack', patterns)).toBe(true);
    expect(matchExceptReleases('Normal Movie', patterns)).toBe(false);
  });

  it('returns false for empty patterns', () => {
    expect(matchExceptReleases('anything', '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// torrentMatchesFilter
// ---------------------------------------------------------------------------

function makeTorrent(overrides: Partial<NormalizedTorrent> = {}): NormalizedTorrent {
  return {
    torrent_id: 1,
    name: 'Test.Movie.2024.1080p.BluRay.x264-GROUP',
    filename: 'test.mkv',
    category: 'Movies',
    category_id: 1,
    subcategory: 'HD',
    resolution: '1080p',
    source: 'Blu-ray',
    codec: 'x264',
    hdr: '',
    release_group: 'GROUP',
    size_bytes: 10_737_418_240,
    size_gb: 10,
    size_str: '10GB',
    snatched: 100,
    seeders: 10,
    leechers: 5,
    comments: 0,
    date: '2026-03-15 12:00:00',
    tags: [],
    genres: '',
    rating: 0,
    imdb_id: '',
    ...overrides,
  };
}

function makeFilterData(overrides: Partial<FilterData> = {}): FilterData {
  return {
    enabled: true,
    min_size: '1GB',
    max_size: '30GB',
    delay: 0,
    priority: 3,
    max_downloads: 5,
    max_downloads_unit: 'HOUR',
    except_releases: '',
    announce_types: [],
    freeleech: false,
    resolutions: [],
    sources: [],
    match_categories: 'Movies*',
    is_auto_updated: false,
    release_profile_duplicate: null,
    match_release_groups: '',
    except_release_groups: '',
    ...overrides,
  };
}

describe('torrentMatchesFilter', () => {
  it('matches a basic torrent', () => {
    expect(torrentMatchesFilter(makeTorrent() as any, makeFilterData() as any)).toBe(true);
  });

  it('rejects torrent below min size', () => {
    expect(
      torrentMatchesFilter(makeTorrent({ size_gb: 0.5 }) as any, makeFilterData({ min_size: '1GB' }) as any),
    ).toBe(false);
  });

  it('rejects torrent above max size', () => {
    expect(
      torrentMatchesFilter(makeTorrent({ size_gb: 50 }) as any, makeFilterData({ max_size: '30GB' }) as any),
    ).toBe(false);
  });

  it('checks resolution filter', () => {
    expect(
      torrentMatchesFilter(
        makeTorrent({ resolution: '720p' }) as any,
        makeFilterData({ resolutions: ['1080p', '2160p'] }) as any,
      ),
    ).toBe(false);
    expect(
      torrentMatchesFilter(
        makeTorrent({ resolution: '1080p' }) as any,
        makeFilterData({ resolutions: ['1080p', '2160p'] }) as any,
      ),
    ).toBe(true);
  });

  it('checks source filter', () => {
    expect(
      torrentMatchesFilter(
        makeTorrent({ source: 'WEB-DL' }) as any,
        makeFilterData({ sources: ['Blu-ray'] }) as any,
      ),
    ).toBe(false);
  });

  it('checks category pattern', () => {
    expect(
      torrentMatchesFilter(makeTorrent({ category: 'TV' }) as any, makeFilterData({ match_categories: 'Movies*' }) as any),
    ).toBe(false);
    expect(
      torrentMatchesFilter(
        makeTorrent({ category: 'Movies/HD' }) as any,
        makeFilterData({ match_categories: 'Movies*' }) as any,
      ),
    ).toBe(true);
  });

  it('excludes by except_releases', () => {
    expect(
      torrentMatchesFilter(
        makeTorrent({ name: 'Olympics 2024 1080p' }) as any,
        makeFilterData({ except_releases: '*Olympics*' }) as any,
      ),
    ).toBe(false);
  });

  it('checks release group allowlist', () => {
    expect(
      torrentMatchesFilter(
        makeTorrent({ release_group: 'OTHER' }) as any,
        makeFilterData({ match_release_groups: 'GROUP,ELITE' }) as any,
      ),
    ).toBe(false);
    expect(
      torrentMatchesFilter(
        makeTorrent({ release_group: 'GROUP' }) as any,
        makeFilterData({ match_release_groups: 'GROUP,ELITE' }) as any,
      ),
    ).toBe(true);
  });

  it('checks release group blocklist', () => {
    expect(
      torrentMatchesFilter(
        makeTorrent({ release_group: 'BAD' }) as any,
        makeFilterData({ except_release_groups: 'BAD,AWFUL' }) as any,
      ),
    ).toBe(false);
    expect(
      torrentMatchesFilter(
        makeTorrent({ release_group: 'GROUP' }) as any,
        makeFilterData({ except_release_groups: 'BAD,AWFUL' }) as any,
      ),
    ).toBe(true);
  });

  it('passes with empty resolution/source arrays', () => {
    expect(
      torrentMatchesFilter(makeTorrent() as any, makeFilterData({ resolutions: [], sources: [] }) as any),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runSimulation (via filter-engine)
// ---------------------------------------------------------------------------

function makeFilter(name: string, overrides: Partial<FilterData> = {}): GeneratedFilter {
  return {
    name,
    version: '1.0',
    data: makeFilterData(overrides),
  };
}

const toFilterDefs = (filters: GeneratedFilter[]): FilterDef[] =>
  filters.map(f => ({ name: f.name, data: f.data as any }));

const defaultConfig: SimulationConfig = { storageTb: 1, avgSeedDays: 7, avgRatio: 1 };

describe('runSimulation', () => {
  it('grabs torrents that match and fit in storage', () => {
    const torrents: NormalizedTorrent[] = [
      makeTorrent({ torrent_id: 1, date: '2026-03-01 10:00:00', size_gb: 5 }),
      makeTorrent({ torrent_id: 2, date: '2026-03-01 11:00:00', size_gb: 5 }),
      makeTorrent({ torrent_id: 3, date: '2026-03-02 10:00:00', size_gb: 5 }),
    ];
    const filters = [makeFilter('tier-high', { priority: 4, max_downloads: 10 })];

    const result = runSimulation(torrents as any[], toFilterDefs(filters), defaultConfig);

    expect(result.total_seen).toBe(3);
    expect(result.total_grabbed).toBe(3);
    expect(result.total_grabbed_gb).toBe(15);
    expect(result.filters_used).toEqual(['tier-high']);
  });

  it('respects rate limits', () => {
    // 3 torrents in the same hour, but max_downloads=1
    const torrents: NormalizedTorrent[] = [
      makeTorrent({ torrent_id: 1, date: '2026-03-01 10:00:00', size_gb: 5 }),
      makeTorrent({ torrent_id: 2, date: '2026-03-01 10:15:00', size_gb: 5 }),
      makeTorrent({ torrent_id: 3, date: '2026-03-01 10:30:00', size_gb: 5 }),
    ];
    const filters = [makeFilter('tier-low', { priority: 2, max_downloads: 1 })];

    const result = runSimulation(torrents as any[], toFilterDefs(filters), defaultConfig);

    expect(result.total_grabbed).toBe(1);
    expect(result.skip_reasons.rate_limited).toBe(2);
  });

  it('respects storage limits', () => {
    // Each torrent is 600GB, storage is 1TB = 1024GB, so only 1 fits
    const torrents: NormalizedTorrent[] = [
      makeTorrent({ torrent_id: 1, date: '2026-03-01 10:00:00', size_gb: 600 }),
      makeTorrent({ torrent_id: 2, date: '2026-03-01 11:00:00', size_gb: 600 }),
    ];
    const filters = [
      makeFilter('tier-high', { priority: 4, max_downloads: 10, max_size: '999GB' }),
    ];

    const result = runSimulation(torrents as any[], toFilterDefs(filters), defaultConfig);

    expect(result.total_grabbed).toBe(1);
    expect(result.skip_reasons.storage_full).toBe(1);
  });

  it('skips disabled filters', () => {
    const torrents = [makeTorrent({ torrent_id: 1, date: '2026-03-01 10:00:00' })];
    const filters = [makeFilter('tier-high', { enabled: false })];

    const result = runSimulation(torrents as any[], toFilterDefs(filters), defaultConfig);

    expect(result.total_grabbed).toBe(0);
    expect(result.skip_reasons.no_match).toBe(1);
  });

  it('expires torrents after seed days', () => {
    // Create torrents spread over more than avgSeedDays
    const torrents: NormalizedTorrent[] = [];
    for (let d = 1; d <= 15; d++) {
      const day = d.toString().padStart(2, '0');
      torrents.push(
        makeTorrent({
          torrent_id: d,
          date: `2026-03-${day} 12:00:00`,
          size_gb: 100,
        }),
      );
    }
    const filters = [
      makeFilter('tier-high', { priority: 4, max_downloads: 10, max_size: '999GB' }),
    ];

    const config: SimulationConfig = { storageTb: 2, avgSeedDays: 7, avgRatio: 1 };
    const result = runSimulation(torrents as any[], toFilterDefs(filters), config);

    // All 15 should be grabbed (100GB each, 2048GB limit, max ~7 on disk at once = 700GB)
    expect(result.total_grabbed).toBe(15);
    // Disk should never exceed seed_days * 100GB + some margin
    const maxDisk = Math.max(...result.daily_stats.map((d) => d.disk_usage_gb));
    expect(maxDisk).toBeLessThanOrEqual(1100); // at most ~10 days worth + 1
  });

  it('handles empty torrent list', () => {
    const result = runSimulation([], toFilterDefs([makeFilter('tier-high')]), defaultConfig);
    expect(result.total_seen).toBe(0);
    expect(result.total_grabbed).toBe(0);
    expect(result.total_days).toBe(0);
  });

  it('respects filter priority order', () => {
    const torrents = [
      makeTorrent({
        torrent_id: 1,
        date: '2026-03-01 10:00:00',
        size_gb: 5,
        resolution: '1080p',
      }),
    ];
    // High priority filter only allows 2160p, low priority allows 1080p
    const filters = [
      makeFilter('tier-high', { priority: 4, max_downloads: 10, resolutions: ['2160p'] }),
      makeFilter('tier-low', { priority: 2, max_downloads: 10, resolutions: ['1080p'] }),
    ];

    const result = runSimulation(torrents as any[], toFilterDefs(filters), defaultConfig);

    expect(result.total_grabbed).toBe(1);
    expect(result.per_filter_stats['tier-low'].count).toBe(1);
    expect(result.per_filter_stats['tier-high'].count).toBe(0);
  });

  it('records daily stats correctly', () => {
    const torrents = [
      makeTorrent({ torrent_id: 1, date: '2026-03-01 10:00:00', size_gb: 10 }),
      makeTorrent({ torrent_id: 2, date: '2026-03-02 10:00:00', size_gb: 20 }),
    ];
    const filters = [makeFilter('tier-high', { priority: 4, max_downloads: 10 })];

    const result = runSimulation(torrents as any[], toFilterDefs(filters), defaultConfig);

    expect(result.daily_stats.length).toBe(2);
    expect(result.daily_stats[0].grabbed).toBe(1);
    expect(result.daily_stats[0].grabbed_gb).toBe(10);
    expect(result.daily_stats[1].grabbed).toBe(1);
    expect(result.daily_stats[1].grabbed_gb).toBe(20);
  });
});
