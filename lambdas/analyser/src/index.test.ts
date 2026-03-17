import { analyseTiers, TorrentRow } from './index';

const makeRows = (count: number): TorrentRow[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `Torrent ${i}`,
    size: '1GB',
    date: '2026-03-17',
    seeders: i,
    leechers: 0,
    completed: i * 2,
  }));

describe('analyseTiers', () => {
  it('returns exactly 4 tiers', () => {
    const tiers = analyseTiers(makeRows(100), 4);
    expect(tiers).toHaveLength(4);
  });

  it('tier numbers are 1-4', () => {
    const tiers = analyseTiers(makeRows(100), 4);
    expect(tiers.map(t => t.tier)).toEqual([1, 2, 3, 4]);
  });

  it('tier 1 has lower minSeeders than tier 4', () => {
    const tiers = analyseTiers(makeRows(100), 4);
    expect(tiers[0].minSeeders).toBeLessThan(tiers[3].minSeeders);
  });

  it('handles empty dataset', () => {
    const tiers = analyseTiers([], 4);
    expect(tiers).toHaveLength(4);
    tiers.forEach(t => expect(t.minSeeders).toBe(0));
  });

  it('maxSizeGb scales with storageTb', () => {
    const tiers = analyseTiers(makeRows(10), 8);
    expect(tiers[0].maxSizeGb).toBe(800); // 8 * 100
  });
});
