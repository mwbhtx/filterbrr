import type {
  NormalizedTorrent,
  FilterData,
  FilterDef,
  SimulationConfig,
  SimulationResult,
  DailyStats,
  FilterStats,
  GrabbedTorrent,
  SkippedTorrent,
} from './types';
import { torrentMatchesFilter } from './matching';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Parse a date string like "2026-03-17 12:30:45" to a Date (UTC). */
function parseDate(dateStr: string): Date {
  if (dateStr.includes('T')) return new Date(dateStr);
  return new Date(dateStr + ' UTC');
}

/** Truncate a Date to midnight UTC. */
function truncateToMidnightUTC(dt: Date): Date {
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

/** Difference in days between two midnight-UTC dates. */
function daysDiffUTC(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Build a rate-limit bucket key matching autobrr's fixed-period semantics:
 * - HOUR: per clock hour (e.g. 12:00-13:00)
 * - DAY:  per calendar day (midnight to midnight)
 * - WEEK: per ISO week (Monday 00:00 to Sunday 23:59)
 */
function rateLimitKey(unit: string, dayOffset: number, hour: number, filterName: string, currentDay: Date): string {
  switch (unit) {
    case 'DAY':
      return `day:${dayOffset}:${filterName}`;
    case 'WEEK': {
      // ISO week number: group by week boundary
      const weekNum = getISOWeekNumber(currentDay);
      const year = currentDay.getUTCFullYear();
      return `week:${year}-W${weekNum}:${filterName}`;
    }
    default: // 'HOUR'
      return `hour:${dayOffset}:${hour}:${filterName}`;
  }
}

/** Get ISO week number for a date. */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Compute the total number of hours elapsed between two dates. */
function hoursDiff(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 3_600_000);
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface InternalFilter {
  name: string;
  priority: number;
  delay: number;
  max_downloads: number;
  max_downloads_unit: string; // 'HOUR' | 'DAY' | 'WEEK'
  data: FilterData;
}

interface DiskItem {
  grab_date: Date;
  size_gb: number;
  filter: string;
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------

/**
 * Simulate autobrr filter behavior over the torrent dataset chronologically.
 *
 * Replays torrents hour-by-hour, applying filters with rate limits, priority
 * ordering, and storage constraints. Torrents are deleted after avgSeedDays.
 */
export function runSimulation(
  torrents: NormalizedTorrent[],
  filters: FilterDef[],
  config: SimulationConfig,
): SimulationResult {
  const maxStorageGb = config.storageTb * 1024;
  const seedDays = config.avgSeedDays;
  const avgRatio = config.avgRatio;

  // Build filter list sorted by priority descending
  const internalFilters: InternalFilter[] = [];
  for (const fj of filters) {
    const data = fj.data;
    if (!data.enabled) continue;
    internalFilters.push({
      name: fj.name,
      priority: data.priority,
      delay: data.delay ?? 0,
      max_downloads: data.max_downloads ?? 999,
      max_downloads_unit: (data.max_downloads_unit ?? 'HOUR').toUpperCase(),
      data,
    });
  }
  internalFilters.sort((a, b) => b.priority - a.priority);

  // Sort torrents chronologically
  const sortedTorrents = [...torrents].sort(
    (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime(),
  );

  if (sortedTorrents.length === 0) {
    return emptyResult(maxStorageGb, internalFilters, avgRatio);
  }

  // Determine date range
  const firstDate = parseDate(sortedTorrents[0].date);
  const lastDate = parseDate(sortedTorrents[sortedTorrents.length - 1].date);
  const firstDay = truncateToMidnightUTC(firstDate);
  const lastDay = truncateToMidnightUTC(lastDate);
  const totalDays = Math.max(1, daysDiffUTC(lastDay, firstDay) + 1);

  // State tracking
  let disk: DiskItem[] = [];
  let currentDiskGb = 0.0;

  // Rate limit counters: key = rateLimitKey(unit, dayOffset, hour, filterName)
  const rateLimitCounts = new Map<string, number>();

  // Convert seedDays to seedHours for hour-level expiry
  const seedHours = seedDays * 24;

  // Results tracking
  const dailyStats: DailyStats[] = [];
  let totalGrabbed = 0;
  let totalGrabbedGb = 0;
  let totalUploadGb = 0;
  const skipReasons = {
    no_match: 0,
    rate_limited: 0,
    storage_full: 0,
  };
  const perFilterStats: Record<string, { count: number; gb: number; upload_gb: number; sizes: number[] }> = {};
  for (const f of internalFilters) {
    perFilterStats[f.name] = { count: 0, gb: 0, upload_gb: 0, sizes: [] };
  }

  const grabbedTorrents: GrabbedTorrent[] = [];
  const skippedTorrents: SkippedTorrent[] = [];

  const baseDate = firstDay;

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const currentDay = new Date(baseDate.getTime() + dayOffset * 86_400_000);
    const nextDay = new Date(currentDay.getTime() + 86_400_000);

    // Get torrents for this day
    const dayTorrents = sortedTorrents.filter((t) => {
      const d = parseDate(t.date);
      return d.getTime() >= currentDay.getTime() && d.getTime() < nextDay.getTime();
    });

    // Process hour by hour
    let dayGrabbed = 0;
    let dayGrabbedGb = 0;
    let dayUploadGb = 0;
    let daySkippedNoMatch = 0;
    let daySkippedRate = 0;
    let daySkippedStorage = 0;
    let dayExpiredGb = 0;

    for (let hour = 0; hour < 24; hour++) {
      const hourStart = new Date(currentDay.getTime() + hour * 3_600_000);
      const hourEnd = new Date(hourStart.getTime() + 3_600_000);

      // Expire torrents at hour granularity: remove items where age >= seedHours
      const newDisk: DiskItem[] = [];
      for (const item of disk) {
        const ageHours = hoursDiff(hourStart, item.grab_date);
        if (ageHours >= seedHours) {
          dayExpiredGb += item.size_gb;
          currentDiskGb -= item.size_gb;
        } else {
          newDisk.push(item);
        }
      }
      disk = newDisk;

      const hourTorrents = dayTorrents
        .filter((t) => {
          const d = parseDate(t.date);
          return d.getTime() >= hourStart.getTime() && d.getTime() < hourEnd.getTime();
        })
        .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

      for (const torrent of hourTorrents) {
        let matchedFilter: InternalFilter | null = null;

        // Try filters in priority order (cascade)
        for (const filt of internalFilters) {
          if (!torrentMatchesFilter(torrent, filt.data)) continue;

          // Check rate limit using the filter's unit (HOUR, DAY, WEEK)
          const rlKey = rateLimitKey(filt.max_downloads_unit, dayOffset, hour, filt.name, currentDay);
          const currentCount = rateLimitCounts.get(rlKey) ?? 0;
          if (currentCount >= filt.max_downloads) continue;

          matchedFilter = filt;
          break;
        }

        if (matchedFilter === null) {
          // Determine skip reason
          const anyMatch = internalFilters.some((f) => torrentMatchesFilter(torrent, f.data));
          if (anyMatch) {
            skipReasons.rate_limited++;
            daySkippedRate++;
            skippedTorrents.push({
              name: torrent.name,
              size_gb: torrent.size_gb,
              date: torrent.date,
              reason: 'rate_limited',
              suggestion: 'Increase max_downloads or add another filter',
            });
          } else {
            skipReasons.no_match++;
            daySkippedNoMatch++;
            skippedTorrents.push({
              name: torrent.name,
              size_gb: torrent.size_gb,
              date: torrent.date,
              reason: 'no_match',
              suggestion: 'Adjust filter criteria to match this torrent',
            });
          }
          continue;
        }

        // Check storage
        if (currentDiskGb + torrent.size_gb > maxStorageGb) {
          skipReasons.storage_full++;
          daySkippedStorage++;
          skippedTorrents.push({
            name: torrent.name,
            size_gb: torrent.size_gb,
            date: torrent.date,
            reason: 'storage_full',
            suggestion: 'Increase storage or reduce seed days',
          });
          continue;
        }

        // Grab the torrent
        const rlKey = rateLimitKey(matchedFilter.max_downloads_unit, dayOffset, hour, matchedFilter.name, currentDay);
        rateLimitCounts.set(rlKey, (rateLimitCounts.get(rlKey) ?? 0) + 1);
        currentDiskGb += torrent.size_gb;
        disk.push({
          grab_date: parseDate(torrent.date),
          size_gb: torrent.size_gb,
          filter: matchedFilter.name,
        });

        const uploadForGrab = torrent.size_gb * avgRatio;
        perFilterStats[matchedFilter.name].count++;
        perFilterStats[matchedFilter.name].gb += torrent.size_gb;
        perFilterStats[matchedFilter.name].upload_gb += uploadForGrab;
        perFilterStats[matchedFilter.name].sizes.push(torrent.size_gb);
        dayGrabbed++;
        dayGrabbedGb += torrent.size_gb;
        dayUploadGb += uploadForGrab;
        totalGrabbed++;
        totalGrabbedGb += torrent.size_gb;
        totalUploadGb += uploadForGrab;

        grabbedTorrents.push({
          name: torrent.name,
          size_gb: torrent.size_gb,
          filter: matchedFilter.name,
          date: torrent.date,
        });
      }
    }

    dailyStats.push({
      day: dayOffset + 1,
      date: currentDay.toISOString().slice(0, 10),
      grabbed: dayGrabbed,
      grabbed_gb: Math.round(dayGrabbedGb * 10) / 10,
      expired_gb: Math.round(dayExpiredGb * 10) / 10,
      disk_usage_gb: Math.round(currentDiskGb * 10) / 10,
      utilization_pct: Math.round((currentDiskGb / maxStorageGb) * 1000) / 10,
      upload_gb: Math.round(dayUploadGb * 10) / 10,
      available_torrents: dayTorrents.length,
      skipped_no_match: daySkippedNoMatch,
      skipped_rate_limit: daySkippedRate,
      skipped_storage: daySkippedStorage,
    });
  }

  // Compute steady-state stats (after warm-up = avgSeedDays)
  const steadyStateDays = dailyStats.filter((d) => d.day > seedDays);
  const avgUtilization =
    steadyStateDays.length > 0
      ? steadyStateDays.reduce((s, d) => s + d.utilization_pct, 0) / steadyStateDays.length
      : 0;
  const avgDiskGb =
    steadyStateDays.length > 0
      ? steadyStateDays.reduce((s, d) => s + d.disk_usage_gb, 0) / steadyStateDays.length
      : 0;
  const steadyStateDailyUploadGb =
    steadyStateDays.length > 0
      ? steadyStateDays.reduce((s, d) => s + d.upload_gb, 0) / steadyStateDays.length
      : 0;

  // Count blackout days (steady-state days where utilization >= 100%)
  const blackoutDays = steadyStateDays.filter((d) => d.utilization_pct >= 100).length;

  // Compute per-filter final stats with median
  const finalPerFilter: Record<string, FilterStats> = {};
  for (const [fname, stats] of Object.entries(perFilterStats)) {
    finalPerFilter[fname] = {
      count: stats.count,
      gb: Math.round(stats.gb * 10) / 10,
      upload_gb: Math.round(stats.upload_gb * 10) / 10,
      median_size: stats.sizes.length > 0 ? Math.round(median(stats.sizes) * 10) / 10 : 0,
    };
  }

  return {
    total_seen: sortedTorrents.length,
    total_grabbed: totalGrabbed,
    total_grabbed_gb: Math.round(totalGrabbedGb * 10) / 10,
    grab_rate_pct:
      sortedTorrents.length > 0
        ? Math.round((totalGrabbed / sortedTorrents.length) * 1000) / 10
        : 0,
    total_days: totalDays,
    max_storage_gb: maxStorageGb,
    avg_ratio: avgRatio,
    total_upload_gb: Math.round(totalUploadGb * 10) / 10,
    steady_state_daily_upload_gb: Math.round(steadyStateDailyUploadGb * 10) / 10,
    steady_state_avg_utilization: Math.round(avgUtilization * 10) / 10,
    steady_state_avg_disk_gb: Math.round(avgDiskGb * 10) / 10,
    blackout_days: blackoutDays,
    skip_reasons: skipReasons,
    per_filter_stats: finalPerFilter,
    filters_used: internalFilters.map((f) => f.name),
    daily_stats: dailyStats,
    grabbed_torrents: grabbedTorrents,
    skipped_torrents: skippedTorrents,
  };
}

function emptyResult(maxStorageGb: number, filters: InternalFilter[], avgRatio: number): SimulationResult {
  return {
    total_seen: 0,
    total_grabbed: 0,
    total_grabbed_gb: 0,
    grab_rate_pct: 0,
    total_days: 0,
    max_storage_gb: maxStorageGb,
    avg_ratio: avgRatio,
    total_upload_gb: 0,
    steady_state_daily_upload_gb: 0,
    steady_state_avg_utilization: 0,
    steady_state_avg_disk_gb: 0,
    blackout_days: 0,
    skip_reasons: { no_match: 0, rate_limited: 0, storage_full: 0 },
    per_filter_stats: {},
    filters_used: filters.map((f) => f.name),
    daily_stats: [],
    grabbed_torrents: [],
    skipped_torrents: [],
  };
}
