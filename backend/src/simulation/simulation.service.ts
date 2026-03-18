import { Injectable } from '@nestjs/common';
import { S3Service } from '../s3/s3.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export interface FilterData {
  enabled: boolean;
  min_size: string;
  max_size: string;
  min_seeders?: number;
  max_downloads: number;
  max_downloads_unit: string;
  match_release_groups?: string;
  except_release_groups?: string;
  [key: string]: unknown;
}

export interface FilterDef {
  _id: string;
  name: string;
  data: FilterData;
}

export interface SimulationRequest {
  datasetKey: string;
  storageTb: number;
  seedDays: number;
  filterIds: string[];
  avgRatio: number;
  filtersInline?: FilterDef[];
}

export interface DailyStat {
  day: number;
  date: string;
  grabbed: number;
  grabbed_gb: number;
  expired_gb: number;
  disk_usage_gb: number;
  utilization_pct: number;
  upload_gb: number;
  available_torrents: number;
  skipped_no_match: number;
  skipped_rate_limit: number;
  skipped_storage: number;
}

export interface FilterStats {
  count: number;
  gb: number;
  upload_gb: number;
  median_size: number;
}

export interface GrabbedTorrent {
  name: string;
  size_gb: number;
  filter: string;
  date: string;
}

export interface SkippedTorrent {
  name: string;
  size_gb: number;
  date: string;
  reason: string;
  suggestion: string;
}

export interface SimulationResult {
  total_seen: number;
  total_grabbed: number;
  total_grabbed_gb: number;
  grab_rate_pct: number;
  total_days: number;
  skip_reasons: Record<string, number>;
  daily_stats: DailyStat[];
  per_filter_stats: Record<string, FilterStats>;
  steady_state_avg_utilization: number;
  steady_state_avg_disk_gb: number;
  max_storage_gb: number;
  filters_used: string[];
  blackout_days: number;
  total_upload_gb: number;
  steady_state_daily_upload_gb: number;
  avg_ratio: number;
  grabbed_torrents: GrabbedTorrent[];
  skipped_torrents: SkippedTorrent[];
}

interface TorrentRow {
  name: string;
  date: string;
  size: string;
  seeders: number;
  [key: string]: unknown;
}

@Injectable()
export class SimulationService {
  constructor(private readonly s3: S3Service) {}

  async run(userId: string, req: SimulationRequest): Promise<SimulationResult> {
    const obj = await this.s3.client.send(
      new GetObjectCommand({ Bucket: this.s3.bucket, Key: req.datasetKey })
    );
    const text = await (obj.Body as { transformToString: () => Promise<string> }).transformToString();

    const torrents = JSON.parse(text) as Array<Record<string, unknown>>;
    const rows: TorrentRow[] = torrents.map(t => ({
      name: String(t.name ?? ''),
      date: String(t.date ?? ''),
      size: String(t.size_bytes ?? t.size ?? '0'),
      seeders: Number(t.seeders ?? 0),
      ...t,
    }));

    return this.simulate(rows, req);
  }

  simulate(rows: TorrentRow[], req: SimulationRequest): SimulationResult {
    const storageLimitBytes = req.storageTb * 1e12;
    const storageLimitGb = req.storageTb * 1000;
    const filters = req.filtersInline ?? [];

    // Group by date
    const byDate = new Map<string, TorrentRow[]>();
    for (const row of rows) {
      const date = (row.date as string)?.slice(0, 10) ?? 'unknown';
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(row);
    }
    const sortedDates = [...byDate.keys()].sort();

    let storageUsedBytes = 0;
    let totalGrabbed = 0;
    let totalGrabbedGb = 0;
    let totalUploadGb = 0;
    const skipReasons: Record<string, number> = { no_match: 0, storage_full: 0, rate_limited: 0 };
    const perFilterStats: Record<string, { sizes: number[]; count: number; gb: number; upload_gb: number }> = {};
    const dailyStats: DailyStat[] = [];
    const grabbedTorrents: GrabbedTorrent[] = [];
    const skippedTorrents: SkippedTorrent[] = [];

    // Track daily download counts per filter for rate limiting
    const dailyDownloads: Record<string, number> = {};

    for (let dayIdx = 0; dayIdx < sortedDates.length; dayIdx++) {
      const date = sortedDates[dayIdx];
      const dayRows = byDate.get(date)!;

      // Reset daily download counts
      Object.keys(dailyDownloads).forEach((k) => (dailyDownloads[k] = 0));

      let dayGrabbed = 0;
      let dayGrabbedGb = 0;
      let dayUploadGb = 0;
      let daySkipNoMatch = 0;
      let daySkipRateLimit = 0;
      let daySkipStorage = 0;

      // Daily expiry: each torrent seeded for seedDays, so 1/seedDays of storage frees up each day
      const expiredBytes = storageUsedBytes / req.seedDays;
      const expiredGb = expiredBytes / 1e9;
      storageUsedBytes = Math.max(0, storageUsedBytes - expiredBytes);

      for (const row of dayRows) {
        const sizeBytes = parseSize(row.size as string);
        const sizeGb = sizeBytes / 1e9;

        // Match against filters (if none configured, treat all as matched with a default filter)
        const matchedFilter = filters.length > 0
          ? filters.find((f) => f.data.enabled !== false && matchesFilter(row, f.data))
          : null;
        const filterName = matchedFilter?.name ?? (filters.length === 0 ? 'All' : null);

        if (filterName === null) {
          daySkipNoMatch++;
          skipReasons['no_match']++;
          if (skippedTorrents.length < 200) {
            skippedTorrents.push({
              name: row.name,
              size_gb: Math.round(sizeGb * 100) / 100,
              date,
              reason: 'no_match',
              suggestion: 'Widen filter rules to match this torrent.',
            });
          }
          continue;
        }

        // Rate limit check
        const filterKey = filterName;
        if (!dailyDownloads[filterKey]) dailyDownloads[filterKey] = 0;
        const filterDef = matchedFilter;
        if (filterDef) {
          const maxDl = filterDef.data.max_downloads ?? 0;
          const unit = (filterDef.data.max_downloads_unit ?? 'DAY').toUpperCase();
          if (maxDl > 0 && unit === 'DAY' && dailyDownloads[filterKey] >= maxDl) {
            daySkipRateLimit++;
            skipReasons['rate_limited']++;
            if (skippedTorrents.length < 200) {
              skippedTorrents.push({
                name: row.name,
                size_gb: Math.round(sizeGb * 100) / 100,
                date,
                reason: 'rate_limited',
                suggestion: 'Increase max downloads or change unit to HOUR.',
              });
            }
            continue;
          }
        }

        // Storage check
        if (storageUsedBytes + sizeBytes > storageLimitBytes) {
          daySkipStorage++;
          skipReasons['storage_full']++;
          if (skippedTorrents.length < 200) {
            skippedTorrents.push({
              name: row.name,
              size_gb: Math.round(sizeGb * 100) / 100,
              date,
              reason: 'storage_full',
              suggestion: 'Increase storage or shorten seed days.',
            });
          }
          continue;
        }

        // Grab it
        storageUsedBytes += sizeBytes;
        dailyDownloads[filterKey]++;
        dayGrabbed++;
        dayGrabbedGb += sizeGb;
        const uploadGb = sizeGb * req.avgRatio;
        dayUploadGb += uploadGb;
        totalGrabbed++;
        totalGrabbedGb += sizeGb;
        totalUploadGb += uploadGb;

        if (!perFilterStats[filterName]) {
          perFilterStats[filterName] = { sizes: [], count: 0, gb: 0, upload_gb: 0 };
        }
        perFilterStats[filterName].count++;
        perFilterStats[filterName].gb += sizeGb;
        perFilterStats[filterName].upload_gb += uploadGb;
        perFilterStats[filterName].sizes.push(sizeGb);

        if (grabbedTorrents.length < 500) {
          grabbedTorrents.push({
            name: row.name,
            size_gb: Math.round(sizeGb * 100) / 100,
            filter: filterName,
            date,
          });
        }
      }

      const diskUsageGb = storageUsedBytes / 1e9;
      const utilizationPct = storageLimitGb > 0 ? (diskUsageGb / storageLimitGb) * 100 : 0;

      dailyStats.push({
        day: dayIdx + 1,
        date,
        grabbed: dayGrabbed,
        grabbed_gb: Math.round(dayGrabbedGb * 10) / 10,
        expired_gb: Math.round(expiredGb * 10) / 10,
        disk_usage_gb: Math.round(diskUsageGb * 10) / 10,
        utilization_pct: Math.round(utilizationPct * 10) / 10,
        upload_gb: Math.round(dayUploadGb * 10) / 10,
        available_torrents: dayRows.length,
        skipped_no_match: daySkipNoMatch,
        skipped_rate_limit: daySkipRateLimit,
        skipped_storage: daySkipStorage,
      });
    }

    // Steady state: skip first 20% of days (warm-up)
    const warmupDays = Math.max(1, Math.floor(dailyStats.length * 0.2));
    const steadyDays = dailyStats.slice(warmupDays);
    const steadyAvgUtil = steadyDays.length > 0
      ? steadyDays.reduce((s, d) => s + d.utilization_pct, 0) / steadyDays.length
      : 0;
    const steadyAvgDiskGb = steadyDays.length > 0
      ? steadyDays.reduce((s, d) => s + d.disk_usage_gb, 0) / steadyDays.length
      : 0;
    const steadyDailyUploadGb = steadyDays.length > 0
      ? steadyDays.reduce((s, d) => s + d.upload_gb, 0) / steadyDays.length
      : 0;

    const maxDiskGb = dailyStats.length > 0
      ? Math.max(...dailyStats.map((d) => d.disk_usage_gb))
      : 0;

    const blackoutDays = dailyStats.filter((d) => d.utilization_pct >= 100).length;

    // Build per-filter stats with median
    const perFilterOut: Record<string, FilterStats> = {};
    for (const [name, s] of Object.entries(perFilterStats)) {
      const sorted = [...s.sizes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length > 0
        ? sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid]
        : 0;
      perFilterOut[name] = {
        count: s.count,
        gb: Math.round(s.gb * 10) / 10,
        upload_gb: Math.round(s.upload_gb * 10) / 10,
        median_size: Math.round(median * 100) / 100,
      };
    }

    const filtersUsed = Object.keys(perFilterOut);

    return {
      total_seen: rows.length,
      total_grabbed: totalGrabbed,
      total_grabbed_gb: Math.round(totalGrabbedGb * 10) / 10,
      grab_rate_pct: rows.length > 0 ? Math.round((totalGrabbed / rows.length) * 1000) / 10 : 0,
      total_days: dailyStats.length,
      skip_reasons: skipReasons,
      daily_stats: dailyStats,
      per_filter_stats: perFilterOut,
      steady_state_avg_utilization: Math.round(steadyAvgUtil * 10) / 10,
      steady_state_avg_disk_gb: Math.round(steadyAvgDiskGb * 10) / 10,
      max_storage_gb: storageLimitGb,
      filters_used: filtersUsed,
      blackout_days: blackoutDays,
      total_upload_gb: Math.round(totalUploadGb * 10) / 10,
      steady_state_daily_upload_gb: Math.round(steadyDailyUploadGb * 10) / 10,
      avg_ratio: req.avgRatio,
      grabbed_torrents: grabbedTorrents,
      skipped_torrents: skippedTorrents,
    };
  }
}

function matchesFilter(row: TorrentRow, data: FilterData): boolean {
  const sizeBytes = parseSize(row.size as string);

  if (data.min_size) {
    const min = parseSize(data.min_size);
    if (min > 0 && sizeBytes < min) return false;
  }
  if (data.max_size) {
    const max = parseSize(data.max_size);
    if (max > 0 && sizeBytes > max) return false;
  }
  if (data.min_seeders != null && data.min_seeders > 0) {
    if ((row.seeders ?? 0) < data.min_seeders) return false;
  }
  if (data.match_release_groups) {
    const groups = data.match_release_groups.split(',').map((g) => g.trim().toLowerCase()).filter(Boolean);
    if (groups.length > 0) {
      const name = (row.name as string ?? '').toLowerCase();
      if (!groups.some((g) => name.includes(g))) return false;
    }
  }
  if (data.except_release_groups) {
    const groups = data.except_release_groups.split(',').map((g) => g.trim().toLowerCase()).filter(Boolean);
    if (groups.length > 0) {
      const name = (row.name as string ?? '').toLowerCase();
      if (groups.some((g) => name.includes(g))) return false;
    }
  }
  return true;
}

function parseSize(size: string): number {
  if (!size) return 0;
  const parts = size.trim().split(/\s+/);
  const n = parseFloat(parts[0]);
  if (isNaN(n)) return 0;
  const unit = (parts[1] ?? '').toUpperCase();
  switch (unit) {
    case 'TB': return n * 1e12;
    case 'GB': return n * 1e9;
    case 'MB': return n * 1e6;
    case 'KB': return n * 1e3;
    default: return n;
  }
}
