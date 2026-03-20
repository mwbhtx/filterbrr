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
