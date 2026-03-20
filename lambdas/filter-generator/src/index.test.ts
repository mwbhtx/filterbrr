import { scoreTorrents, analyzeAllAttributes } from './scoring';
import { assignTiers, calculateDailyVolume, calculateRateLimits } from './tiers';
import { generateFilter } from './filters';
import type { ScoredTorrent } from './types';

function makeTorrents(count: number): ScoredTorrent[] {
  return Array.from({ length: count }, (_, i) => ({
    torrent_id: i,
    name: `Torrent.${i}.1080p.WEB-DL.x264-GROUP${i % 5}`,
    filename: `torrent_${i}.mkv`,
    category: i % 2 === 0 ? 'movies' : 'tv',
    category_id: i % 2 === 0 ? 1 : 2,
    subcategory: 'hd',
    resolution: '1080p',
    source: 'WEB-DL',
    codec: 'x264',
    hdr: '',
    release_group: `GROUP${i % 5}`,
    size_bytes: (5 + (i % 20)) * 1024 * 1024 * 1024,
    size_gb: 5 + (i % 20),
    size_str: `${5 + (i % 20)} GB`,
    snatched: 100 + i * 10,
    seeders: 5 + i,
    leechers: 1,
    comments: 0,
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')} 12:00:00`,
    tags: [],
    genres: '',
    rating: 0,
    imdb_id: '',
    score: 0,
    score_per_gb: 0,
    age_days: 30 + i,
  }));
}

describe('pipeline integration', () => {
  it('scoreTorrents sets score and score_per_gb', () => {
    const torrents = makeTorrents(10);
    scoreTorrents(torrents);
    for (const t of torrents) {
      expect(t.score).toBeGreaterThan(0);
      expect(t.score_per_gb).toBeGreaterThan(0);
    }
  });

  it('analyzeAllAttributes returns expected dimensions', () => {
    const torrents = makeTorrents(50);
    scoreTorrents(torrents);
    const analyses = analyzeAllAttributes(torrents);
    expect(Object.keys(analyses)).toContain('category');
    expect(Object.keys(analyses)).toContain('resolution');
    expect(Object.keys(analyses)).toContain('release_group');
  });

  it('assignTiers returns tier maps for each dimension', () => {
    const torrents = makeTorrents(50);
    scoreTorrents(torrents);
    const analyses = analyzeAllAttributes(torrents);
    const tiers = assignTiers(analyses, torrents);
    expect(Object.keys(tiers)).toContain('category');
    expect(Object.keys(tiers)).toContain('resolution');
  });

  it('generateFilter produces valid filter structure', () => {
    const torrents = makeTorrents(50);
    scoreTorrents(torrents);
    const analyses = analyzeAllAttributes(torrents);
    const tiers = assignTiers(analyses, torrents);
    const { dailyVolume, medianSizes } = calculateDailyVolume(torrents, tiers);
    const rateLimits = calculateRateLimits(dailyVolume, medianSizes, 4);

    const filter = generateFilter('high', 0, tiers, rateLimits, 'freeleech', analyses);
    expect(filter.name).toContain('high');
    expect(filter.data.priority).toBe(4);
    expect(filter.data.resolutions.length).toBeGreaterThan(0);
    expect(filter.data.sources.length).toBeGreaterThan(0);
  });
});
