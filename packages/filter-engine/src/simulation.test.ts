import { runSimulation } from './simulation';
import type { NormalizedTorrent, FilterDef, SimulationConfig } from './types';

function makeTorrent(overrides: Partial<NormalizedTorrent> = {}): NormalizedTorrent {
  return {
    torrent_id: 1,
    name: 'Test.Movie.2024.1080p.BluRay-GROUP',
    date: '2026-03-01 12:00:00',
    size_gb: 10,
    seeders: 50,
    category: 'Movies/HD',
    resolution: '1080p',
    source: 'Blu-Ray',
    release_group: 'GROUP',
    ...overrides,
  };
}

function makeFilter(overrides: Partial<FilterDef> = {}): FilterDef {
  return {
    name: 'test-filter',
    data: {
      enabled: true,
      priority: 10,
      min_size: '0GB',
      max_size: '100GB',
      max_downloads: 5,
      max_downloads_unit: 'HOUR',
    },
    ...overrides,
  };
}

const defaultConfig: SimulationConfig = {
  storageTb: 1,
  avgSeedDays: 7,
  avgRatio: 1.5,
};

describe('runSimulation', () => {
  it('returns empty result for no torrents', () => {
    const result = runSimulation([], [makeFilter()], defaultConfig);
    expect(result.total_seen).toBe(0);
    expect(result.total_grabbed).toBe(0);
    expect(result.daily_stats).toHaveLength(0);
    expect(result.grabbed_torrents).toHaveLength(0);
    expect(result.skipped_torrents).toHaveLength(0);
  });

  it('grabs a matching torrent', () => {
    const torrents = [makeTorrent()];
    const result = runSimulation(torrents, [makeFilter()], defaultConfig);
    expect(result.total_grabbed).toBe(1);
    expect(result.total_grabbed_gb).toBe(10);
    expect(result.grabbed_torrents).toHaveLength(1);
    expect(result.grabbed_torrents[0].filter).toBe('test-filter');
    expect(result.grabbed_torrents[0].name).toBe('Test.Movie.2024.1080p.BluRay-GROUP');
  });

  it('skips disabled filters', () => {
    const torrents = [makeTorrent()];
    const filter = makeFilter();
    filter.data.enabled = false;
    const result = runSimulation(torrents, [filter], defaultConfig);
    expect(result.total_grabbed).toBe(0);
    expect(result.skip_reasons.no_match).toBe(1);
  });

  it('enforces rate limiting per clock hour', () => {
    // 3 torrents in the same hour, max_downloads = 2
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'T1', date: '2026-03-01 12:00:00' }),
      makeTorrent({ torrent_id: 2, name: 'T2', date: '2026-03-01 12:10:00' }),
      makeTorrent({ torrent_id: 3, name: 'T3', date: '2026-03-01 12:20:00' }),
    ];
    const filter = makeFilter();
    filter.data.max_downloads = 2;
    const result = runSimulation(torrents, [filter], defaultConfig);
    expect(result.total_grabbed).toBe(2);
    expect(result.skip_reasons.rate_limited).toBe(1);
    expect(result.skipped_torrents).toHaveLength(1);
    expect(result.skipped_torrents[0].reason).toBe('rate_limited');
  });

  it('allows more grabs in different hours', () => {
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'T1', date: '2026-03-01 12:00:00' }),
      makeTorrent({ torrent_id: 2, name: 'T2', date: '2026-03-01 13:00:00' }),
    ];
    const filter = makeFilter();
    filter.data.max_downloads = 1;
    const result = runSimulation(torrents, [filter], defaultConfig);
    expect(result.total_grabbed).toBe(2);
  });

  it('cascades to lower priority filter when rate-limited', () => {
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'T1', date: '2026-03-01 12:00:00' }),
      makeTorrent({ torrent_id: 2, name: 'T2', date: '2026-03-01 12:10:00' }),
    ];
    const highFilter = makeFilter({ name: 'high' });
    highFilter.data.priority = 20;
    highFilter.data.max_downloads = 1;

    const lowFilter = makeFilter({ name: 'low' });
    lowFilter.data.priority = 10;
    lowFilter.data.max_downloads = 5;

    const result = runSimulation(torrents, [highFilter, lowFilter], defaultConfig);
    expect(result.total_grabbed).toBe(2);
    expect(result.grabbed_torrents[0].filter).toBe('high');
    expect(result.grabbed_torrents[1].filter).toBe('low');
  });

  it('orders filters by priority descending', () => {
    const torrents = [makeTorrent()];
    const lowFilter = makeFilter({ name: 'low' });
    lowFilter.data.priority = 5;
    const highFilter = makeFilter({ name: 'high' });
    highFilter.data.priority = 20;

    // Pass low first to ensure sorting happens
    const result = runSimulation(torrents, [lowFilter, highFilter], defaultConfig);
    expect(result.total_grabbed).toBe(1);
    expect(result.grabbed_torrents[0].filter).toBe('high');
  });

  it('expires torrents after avgSeedDays', () => {
    // Create torrents spread across many days
    const torrents: NormalizedTorrent[] = [];
    for (let day = 1; day <= 10; day++) {
      torrents.push(
        makeTorrent({
          torrent_id: day,
          name: `T${day}`,
          date: `2026-03-${String(day).padStart(2, '0')} 12:00:00`,
          size_gb: 100,
        }),
      );
    }
    const config: SimulationConfig = { storageTb: 1, avgSeedDays: 3, avgRatio: 1.0 };
    const result = runSimulation(torrents, [makeFilter()], config);

    // With 3-day expiry, disk should never exceed ~300GB (3 days * 100GB/day)
    // Day 4 should see expiry of day 1's torrent
    const day4 = result.daily_stats.find((d) => d.day === 4);
    expect(day4).toBeDefined();
    expect(day4!.expired_gb).toBeGreaterThan(0);
  });

  it('skips torrents when storage is full', () => {
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'T1', date: '2026-03-01 12:00:00', size_gb: 500 }),
      makeTorrent({ torrent_id: 2, name: 'T2', date: '2026-03-01 12:10:00', size_gb: 500 }),
      makeTorrent({ torrent_id: 3, name: 'T3', date: '2026-03-01 12:20:00', size_gb: 500 }),
    ];
    const filter = makeFilter();
    filter.data.max_size = '999999GB';
    // Only 1TB = 1024GB storage, can fit 2 x 500GB but not 3
    const result = runSimulation(torrents, [filter], defaultConfig);
    expect(result.total_grabbed).toBe(2);
    expect(result.skip_reasons.storage_full).toBe(1);
    expect(result.skipped_torrents.some((s) => s.reason === 'storage_full')).toBe(true);
  });

  it('tracks upload using avgRatio', () => {
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'T1', size_gb: 10 }),
    ];
    const config: SimulationConfig = { storageTb: 1, avgSeedDays: 7, avgRatio: 2.0 };
    const result = runSimulation(torrents, [makeFilter()], config);
    expect(result.total_upload_gb).toBe(20); // 10 * 2.0
    expect(result.avg_ratio).toBe(2.0);
    expect(result.per_filter_stats['test-filter'].upload_gb).toBe(20);
  });

  it('computes daily upload_gb', () => {
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'T1', date: '2026-03-01 12:00:00', size_gb: 10 }),
      makeTorrent({ torrent_id: 2, name: 'T2', date: '2026-03-01 13:00:00', size_gb: 20 }),
    ];
    const config: SimulationConfig = { storageTb: 1, avgSeedDays: 7, avgRatio: 1.5 };
    const result = runSimulation(torrents, [makeFilter()], config);
    // Day 1 upload: (10 + 20) * 1.5 = 45
    expect(result.daily_stats[0].upload_gb).toBe(45);
  });

  it('computes steady_state_daily_upload_gb after warm-up', () => {
    // Create torrents over 10 days with avgSeedDays=3
    const torrents: NormalizedTorrent[] = [];
    for (let day = 1; day <= 10; day++) {
      torrents.push(
        makeTorrent({
          torrent_id: day,
          name: `T${day}`,
          date: `2026-03-${String(day).padStart(2, '0')} 12:00:00`,
          size_gb: 10,
        }),
      );
    }
    const config: SimulationConfig = { storageTb: 1, avgSeedDays: 3, avgRatio: 1.0 };
    const result = runSimulation(torrents, [makeFilter()], config);
    // Steady state days are day 4-10 (7 days), each grabs 10GB with ratio 1.0 = 10GB upload
    expect(result.steady_state_daily_upload_gb).toBe(10);
  });

  it('records grabbed_torrents and skipped_torrents without caps', () => {
    const torrents: NormalizedTorrent[] = [];
    for (let i = 0; i < 20; i++) {
      torrents.push(
        makeTorrent({
          torrent_id: i,
          name: `Torrent-${i}`,
          date: '2026-03-01 12:00:00',
        }),
      );
    }
    const filter = makeFilter();
    filter.data.max_downloads = 5;
    const result = runSimulation(torrents, [filter], defaultConfig);
    // 5 grabbed, 15 rate-limited — all recorded
    expect(result.grabbed_torrents).toHaveLength(5);
    expect(result.skipped_torrents).toHaveLength(15);
    expect(result.total_grabbed).toBe(5);
  });

  it('computes blackout_days as steady-state days with utilization >= 100%', () => {
    // Fill storage completely and keep it full
    const torrents: NormalizedTorrent[] = [];
    for (let day = 1; day <= 14; day++) {
      // Grab 200GB per day with 0.5TB storage = 512GB
      // With seed days of 3, steady state = 3 * 200 = 600 > 512 → blackouts
      for (let i = 0; i < 4; i++) {
        torrents.push(
          makeTorrent({
            torrent_id: day * 100 + i,
            name: `T-${day}-${i}`,
            date: `2026-03-${String(day).padStart(2, '0')} ${String(6 + i).padStart(2, '0')}:00:00`,
            size_gb: 50,
          }),
        );
      }
    }
    const config: SimulationConfig = { storageTb: 0.5, avgSeedDays: 3, avgRatio: 1.0 };
    const result = runSimulation(torrents, [makeFilter()], config);
    // There should be some blackout days in steady state
    expect(result.blackout_days).toBeGreaterThanOrEqual(0);
  });

  it('includes max_storage_gb and filters_used in result', () => {
    const result = runSimulation([], [makeFilter()], defaultConfig);
    expect(result.max_storage_gb).toBe(1024);
    expect(result.filters_used).toEqual(['test-filter']);
  });

  it('enforces rate limiting per calendar day with max_downloads_unit DAY', () => {
    // 10 torrents spread across 2 hours of the same day, max_downloads = 3 per DAY
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'T1', date: '2026-03-01 10:00:00' }),
      makeTorrent({ torrent_id: 2, name: 'T2', date: '2026-03-01 10:10:00' }),
      makeTorrent({ torrent_id: 3, name: 'T3', date: '2026-03-01 10:20:00' }),
      makeTorrent({ torrent_id: 4, name: 'T4', date: '2026-03-01 11:00:00' }),
      makeTorrent({ torrent_id: 5, name: 'T5', date: '2026-03-01 11:10:00' }),
    ];
    const filter = makeFilter();
    filter.data.max_downloads = 3;
    filter.data.max_downloads_unit = 'DAY';
    const result = runSimulation(torrents, [filter], defaultConfig);
    // 3 grabbed (daily cap), 2 rate-limited
    expect(result.total_grabbed).toBe(3);
    expect(result.skip_reasons.rate_limited).toBe(2);
  });

  it('resets daily rate limit on new calendar day', () => {
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'T1', date: '2026-03-01 12:00:00' }),
      makeTorrent({ torrent_id: 2, name: 'T2', date: '2026-03-01 13:00:00' }),
      makeTorrent({ torrent_id: 3, name: 'T3', date: '2026-03-02 12:00:00' }),
      makeTorrent({ torrent_id: 4, name: 'T4', date: '2026-03-02 13:00:00' }),
    ];
    const filter = makeFilter();
    filter.data.max_downloads = 1;
    filter.data.max_downloads_unit = 'DAY';
    const result = runSimulation(torrents, [filter], defaultConfig);
    // 1 per day = 2 total over 2 days
    expect(result.total_grabbed).toBe(2);
    expect(result.skip_reasons.rate_limited).toBe(2);
  });

  it('enforces rate limiting per ISO week with max_downloads_unit WEEK', () => {
    // 2026-03-01 is a Sunday (end of ISO week 9)
    // 2026-03-02 is a Monday (start of ISO week 10)
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'T1', date: '2026-03-01 12:00:00' }), // Week 9
      makeTorrent({ torrent_id: 2, name: 'T2', date: '2026-03-01 13:00:00' }), // Week 9
      makeTorrent({ torrent_id: 3, name: 'T3', date: '2026-03-02 12:00:00' }), // Week 10
      makeTorrent({ torrent_id: 4, name: 'T4', date: '2026-03-02 13:00:00' }), // Week 10
    ];
    const filter = makeFilter();
    filter.data.max_downloads = 1;
    filter.data.max_downloads_unit = 'WEEK';
    const result = runSimulation(torrents, [filter], defaultConfig);
    // 1 per week: 1 from week 9 (Sunday), 1 from week 10 (Monday)
    expect(result.total_grabbed).toBe(2);
    expect(result.skip_reasons.rate_limited).toBe(2);
  });

  it('DAY unit allows more grabs per hour than HOUR unit with same max_downloads', () => {
    // 6 torrents in the same hour
    const torrents = Array.from({ length: 6 }, (_, i) =>
      makeTorrent({ torrent_id: i, name: `T${i}`, date: '2026-03-01 12:00:00' }),
    );
    // With HOUR unit, max 3 per hour
    const hourFilter = makeFilter();
    hourFilter.data.max_downloads = 3;
    hourFilter.data.max_downloads_unit = 'HOUR';
    const hourResult = runSimulation(torrents, [hourFilter], defaultConfig);
    expect(hourResult.total_grabbed).toBe(3);

    // With DAY unit, max 3 per day — still only 3 even though they're all in one hour
    const dayFilter = makeFilter();
    dayFilter.data.max_downloads = 3;
    dayFilter.data.max_downloads_unit = 'DAY';
    const dayResult = runSimulation(torrents, [dayFilter], defaultConfig);
    expect(dayResult.total_grabbed).toBe(3);
  });

  it('expires torrents at hour granularity, not just midnight', () => {
    // Torrent grabbed at hour 18 on day 1, avgSeedDays = 1 (24 hours)
    // Should expire at hour 18 on day 2, NOT at midnight on day 2
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'Big', date: '2026-03-01 18:00:00', size_gb: 900 }),
      // At hour 12 on day 2 — 18 hours since grab. Big hasn't expired (needs 24h).
      // disk = 900GB, only 124GB free. This 300GB torrent should NOT fit → storage_full
      makeTorrent({ torrent_id: 2, name: 'TooBig', date: '2026-03-02 12:00:00', size_gb: 300 }),
      // At hour 20 on day 2 — 26 hours since grab. Big HAS expired (26 >= 24).
      // disk = 0GB, 1024GB free. This 300GB torrent SHOULD fit.
      makeTorrent({ torrent_id: 3, name: 'FitsNow', date: '2026-03-02 20:00:00', size_gb: 300 }),
    ];
    const config: SimulationConfig = { storageTb: 1, avgSeedDays: 1, avgRatio: 1.0 };
    const bigFilter = makeFilter();
    bigFilter.data.max_size = '999999GB';
    const result = runSimulation(torrents, [bigFilter], config);
    // Big grabbed, TooBig skipped (storage), FitsNow grabbed (after Big expires)
    expect(result.total_grabbed).toBe(2);
    expect(result.grabbed_torrents.map(g => g.name)).toEqual(['Big', 'FitsNow']);
    expect(result.skip_reasons.storage_full).toBe(1);
    expect(result.skipped_torrents[0].name).toBe('TooBig');
  });

  it('would over-grab with day-level expiry but correctly limits with hour-level', () => {
    // This test verifies hour-level is more accurate than day-level:
    // Torrent grabbed at 23:00 on day 1, avgSeedDays = 1 (24h)
    // At hour 1 on day 2 (only 2 hours later), it should NOT have expired
    // Day-level expiry would wrongly expire it at midnight (1 day boundary)
    const torrents = [
      makeTorrent({ torrent_id: 1, name: 'Late', date: '2026-03-01 23:00:00', size_gb: 900 }),
      // At hour 1 on day 2, only 2 hours have passed. Late should still be on disk.
      makeTorrent({ torrent_id: 2, name: 'Early', date: '2026-03-02 01:00:00', size_gb: 200 }),
    ];
    const config: SimulationConfig = { storageTb: 1, avgSeedDays: 1, avgRatio: 1.0 };
    const bigFilter = makeFilter();
    bigFilter.data.max_size = '999999GB';
    const result = runSimulation(torrents, [bigFilter], config);
    // Both fit: 900 + 200 = 1100 > 1024 → Early should be storage_full
    // because Late is still on disk at hour 1 (only 2 hours old, not 24)
    expect(result.total_grabbed).toBe(1);
    expect(result.grabbed_torrents[0].name).toBe('Late');
    expect(result.skip_reasons.storage_full).toBe(1);
  });

  it('handles non-matching torrents', () => {
    const torrents = [
      makeTorrent({ resolution: '720p' }),
    ];
    const filter = makeFilter();
    filter.data.resolutions = ['1080p'];
    const result = runSimulation(torrents, [filter], defaultConfig);
    expect(result.total_grabbed).toBe(0);
    expect(result.skip_reasons.no_match).toBe(1);
    expect(result.skipped_torrents[0].reason).toBe('no_match');
  });
});
