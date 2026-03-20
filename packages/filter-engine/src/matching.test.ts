import { torrentMatchesFilter, matchCategoryPattern, matchExceptReleases } from './matching';
import type { NormalizedTorrent, FilterData } from './types';

function makeTorrent(overrides: Partial<NormalizedTorrent> = {}): NormalizedTorrent {
  return {
    torrent_id: 1,
    name: 'Test.Movie.2024.1080p.BluRay-GROUP',
    date: '2026-03-19 12:00:00',
    size_gb: 10,
    seeders: 50,
    category: 'Movies/HD',
    resolution: '1080p',
    source: 'Blu-Ray',
    release_group: 'GROUP',
    ...overrides,
  };
}

function makeFilter(overrides: Partial<FilterData> = {}): FilterData {
  return {
    enabled: true,
    priority: 10,
    min_size: '0GB',
    max_size: '100GB',
    max_downloads: 5,
    max_downloads_unit: 'HOUR',
    ...overrides,
  };
}

describe('matchCategoryPattern', () => {
  it('matches exact category (case-insensitive)', () => {
    expect(matchCategoryPattern('Movies/HD', 'Movies/HD')).toBe(true);
    expect(matchCategoryPattern('Movies/HD', 'movies/hd')).toBe(true);
    expect(matchCategoryPattern('Movies/HD', 'TV')).toBe(false);
  });

  it('matches wildcard patterns', () => {
    expect(matchCategoryPattern('Movies/HD', 'Movies*')).toBe(true);
    expect(matchCategoryPattern('Movies/4K', 'Movies*')).toBe(true);
    expect(matchCategoryPattern('TV/HD', 'Movies*')).toBe(false);
  });
});

describe('matchExceptReleases', () => {
  it('matches glob patterns', () => {
    expect(matchExceptReleases('Olympics.2024.Opening', '*Olympics*')).toBe(true);
    expect(matchExceptReleases('Regular.Movie', '*Olympics*')).toBe(false);
  });

  it('handles comma-separated patterns', () => {
    expect(matchExceptReleases('Olympics.2024', '*Olympics*,*Collection*')).toBe(true);
    expect(matchExceptReleases('Best.Collection', '*Olympics*,*Collection*')).toBe(true);
    expect(matchExceptReleases('Regular.Movie', '*Olympics*,*Collection*')).toBe(false);
  });

  it('handles empty patterns', () => {
    expect(matchExceptReleases('anything', '')).toBe(false);
    expect(matchExceptReleases('anything', ',,')).toBe(false);
  });
});

describe('torrentMatchesFilter', () => {
  it('matches when torrent meets all criteria', () => {
    expect(torrentMatchesFilter(makeTorrent(), makeFilter())).toBe(true);
  });

  // Size filtering
  it('rejects torrent below min_size', () => {
    expect(torrentMatchesFilter(makeTorrent({ size_gb: 1 }), makeFilter({ min_size: '5GB' }))).toBe(false);
  });

  it('rejects torrent above max_size', () => {
    expect(torrentMatchesFilter(makeTorrent({ size_gb: 50 }), makeFilter({ max_size: '30GB' }))).toBe(false);
  });

  it('accepts torrent within size range', () => {
    expect(torrentMatchesFilter(makeTorrent({ size_gb: 15 }), makeFilter({ min_size: '10GB', max_size: '20GB' }))).toBe(true);
  });

  // Resolution
  it('filters by resolution', () => {
    expect(torrentMatchesFilter(makeTorrent({ resolution: '1080p' }), makeFilter({ resolutions: ['1080p', '2160p'] }))).toBe(true);
    expect(torrentMatchesFilter(makeTorrent({ resolution: '720p' }), makeFilter({ resolutions: ['1080p', '2160p'] }))).toBe(false);
  });

  it('allows any resolution when not specified', () => {
    expect(torrentMatchesFilter(makeTorrent({ resolution: '720p' }), makeFilter())).toBe(true);
  });

  // Source
  it('filters by source', () => {
    expect(torrentMatchesFilter(makeTorrent({ source: 'Blu-Ray' }), makeFilter({ sources: ['Blu-Ray'] }))).toBe(true);
    expect(torrentMatchesFilter(makeTorrent({ source: 'WEB' }), makeFilter({ sources: ['Blu-Ray'] }))).toBe(false);
  });

  // Category
  it('filters by category with wildcards', () => {
    expect(torrentMatchesFilter(makeTorrent({ category: 'Movies/HD' }), makeFilter({ match_categories: 'Movies*' }))).toBe(true);
    expect(torrentMatchesFilter(makeTorrent({ category: 'TV/HD' }), makeFilter({ match_categories: 'Movies*' }))).toBe(false);
  });

  // Min seeders
  it('filters by min_seeders', () => {
    expect(torrentMatchesFilter(makeTorrent({ seeders: 10 }), makeFilter({ min_seeders: 5 }))).toBe(true);
    expect(torrentMatchesFilter(makeTorrent({ seeders: 2 }), makeFilter({ min_seeders: 5 }))).toBe(false);
  });

  it('ignores min_seeders when not set', () => {
    expect(torrentMatchesFilter(makeTorrent({ seeders: 0 }), makeFilter())).toBe(true);
  });

  // Release groups allow
  it('filters by allowed release groups', () => {
    expect(torrentMatchesFilter(makeTorrent({ release_group: 'SPARKS' }), makeFilter({ match_release_groups: 'SPARKS,FGT' }))).toBe(true);
    expect(torrentMatchesFilter(makeTorrent({ release_group: 'OTHER' }), makeFilter({ match_release_groups: 'SPARKS,FGT' }))).toBe(false);
  });

  // Release groups block
  it('blocks by except release groups', () => {
    expect(torrentMatchesFilter(makeTorrent({ release_group: 'BAD' }), makeFilter({ except_release_groups: 'BAD,WORSE' }))).toBe(false);
    expect(torrentMatchesFilter(makeTorrent({ release_group: 'GOOD' }), makeFilter({ except_release_groups: 'BAD,WORSE' }))).toBe(true);
  });

  // Except releases
  it('excludes by except_releases glob', () => {
    expect(torrentMatchesFilter(makeTorrent({ name: 'Olympics.2024.1080p' }), makeFilter({ except_releases: '*Olympics*' }))).toBe(false);
    expect(torrentMatchesFilter(makeTorrent({ name: 'Regular.Movie.1080p' }), makeFilter({ except_releases: '*Olympics*' }))).toBe(true);
  });

  // Combinations
  it('requires all criteria to pass', () => {
    const filter = makeFilter({
      resolutions: ['1080p'],
      sources: ['Blu-Ray'],
      match_categories: 'Movies*',
      min_seeders: 10,
    });
    // All match
    expect(torrentMatchesFilter(makeTorrent(), filter)).toBe(true);
    // One fails
    expect(torrentMatchesFilter(makeTorrent({ resolution: '720p' }), filter)).toBe(false);
    expect(torrentMatchesFilter(makeTorrent({ seeders: 5 }), filter)).toBe(false);
  });
});
