import type {
  NormalizedTorrent,
  FilterData,
  GeneratedFilter,
  SimulationResult,
  DailyStats,
} from './types';
import { MAX_SEED_DAYS, TARGET_UTILIZATION_PCT } from './tiers';
import { median } from './scoring';

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Parse a size string like "30GB" → 30, "1.5TB" → 1536, "512MB" → 0.5 */
export function parseSizeStr(s: string): number {
  const trimmed = s.trim().toUpperCase();
  if (trimmed.endsWith('GB')) return parseFloat(trimmed.slice(0, -2));
  if (trimmed.endsWith('TB')) return parseFloat(trimmed.slice(0, -2)) * 1024;
  if (trimmed.endsWith('MB')) return parseFloat(trimmed.slice(0, -2)) / 1024;
  return parseFloat(trimmed);
}

/**
 * Check if a category matches a pattern like "Movies*" or "TV".
 * Pattern ending with * does startsWith (case-insensitive).
 */
export function matchCategoryPattern(category: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return category.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase());
  }
  return category.toLowerCase() === pattern.toLowerCase();
}

/**
 * Glob-style matching for except_releases patterns.
 * Patterns is comma-separated like "*Olympics*,*Collection*".
 * Uses fnmatch-style: * matches any chars.
 * Returns true if name matches ANY pattern (should be excluded).
 */
export function matchExceptReleases(name: string, patterns: string): boolean {
  for (const raw of patterns.split(',')) {
    const pat = raw.trim();
    if (!pat) continue;
    if (fnmatch(name, pat)) return true;
  }
  return false;
}

/** Simple fnmatch: convert glob pattern to regex. * matches anything, ? matches one char. */
function fnmatch(name: string, pattern: string): boolean {
  // Escape regex special chars except * and ?
  let re = '';
  for (const ch of pattern) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else if ('.+^${}()|[]\\'.includes(ch)) re += '\\' + ch;
    else re += ch;
  }
  return new RegExp(`^${re}$`, 'i').test(name);
}

/**
 * Check if a torrent matches a filter's criteria. Returns true if it should be grabbed.
 */
export function torrentMatchesFilter(
  torrent: NormalizedTorrent,
  filtData: FilterData,
): boolean {
  // 1. Size check
  const sizeGb = torrent.size_gb;
  const minGb = parseSizeStr(filtData.min_size || '0GB');
  const maxGb = parseSizeStr(filtData.max_size || '999999GB');
  if (sizeGb < minGb || sizeGb > maxGb) return false;

  // 2. Resolution check
  if (filtData.resolutions && filtData.resolutions.length > 0) {
    if (!filtData.resolutions.includes(torrent.resolution)) return false;
  }

  // 3. Source check
  if (filtData.sources && filtData.sources.length > 0) {
    if (!filtData.sources.includes(torrent.source)) return false;
  }

  // 4. Category check
  const matchCats = filtData.match_categories || '';
  if (matchCats) {
    const catPatterns = matchCats.split(',').map((p) => p.trim());
    if (!catPatterns.some((p) => matchCategoryPattern(torrent.category, p))) return false;
  }

  // 5. Except releases (name patterns to exclude)
  const exceptReleases = filtData.except_releases || '';
  if (exceptReleases && matchExceptReleases(torrent.name, exceptReleases)) return false;

  // 6. Release group allowlist
  const matchGroups = filtData.match_release_groups || '';
  if (matchGroups) {
    const allowed = new Set(
      matchGroups
        .split(',')
        .map((g) => g.trim())
        .filter((g) => g),
    );
    if (!allowed.has(torrent.release_group)) return false;
  }

  // 7. Release group blocklist
  const exceptGroups = filtData.except_release_groups || '';
  if (exceptGroups) {
    const blocked = new Set(
      exceptGroups
        .split(',')
        .map((g) => g.trim())
        .filter((g) => g),
    );
    if (blocked.has(torrent.release_group)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Date helpers — all UTC-based
// ---------------------------------------------------------------------------

/** Parse a date string like "2026-03-17 12:30:45" to a Date (UTC). */
function parseDate(dateStr: string): Date {
  // Handle both "2026-03-17 12:30:45" and ISO formats
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

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------

interface InternalFilter {
  name: string;
  priority: number;
  delay: number;
  max_downloads: number;
  data: FilterData;
}

interface DiskItem {
  grab_date: Date;
  size_gb: number;
  filter: string;
}

/**
 * Simulate autobrr filter behavior over the torrent dataset chronologically.
 *
 * Replays torrents hour-by-hour, applying filters with rate limits, priority
 * ordering, and storage constraints. Torrents are deleted after MAX_SEED_DAYS.
 */
export function runSimulation(
  torrents: NormalizedTorrent[],
  filterJsons: GeneratedFilter[],
  storageTb: number,
): SimulationResult {
  const maxStorageGb = storageTb * 1024;

  // Build filter list sorted by priority descending
  const filters: InternalFilter[] = [];
  for (const fj of filterJsons) {
    const data = fj.data;
    if (!data.enabled) continue;
    filters.push({
      name: fj.name,
      priority: data.priority,
      delay: data.delay ?? 0,
      max_downloads: data.max_downloads ?? 999,
      data,
    });
  }
  filters.sort((a, b) => b.priority - a.priority);

  // Sort torrents chronologically
  const sortedTorrents = [...torrents].sort(
    (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime(),
  );

  if (sortedTorrents.length === 0) {
    return emptyResult(maxStorageGb, filters);
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

  // Per-hour rate limit counters: key = "dayOffset:hour:filterName"
  const hourlyGrabs = new Map<string, number>();

  // Results tracking
  const dailyStats: DailyStats[] = [];
  let totalGrabbed = 0;
  let totalGrabbedGb = 0;
  const skipReasons: Record<string, number> = {
    no_match: 0,
    rate_limited: 0,
    storage_full: 0,
  };
  const perFilterStats: Record<string, { count: number; gb: number; sizes: number[] }> = {};
  for (const f of filters) {
    perFilterStats[f.name] = { count: 0, gb: 0, sizes: [] };
  }

  const baseDate = firstDay;

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const currentDay = new Date(baseDate.getTime() + dayOffset * 86_400_000);
    const nextDay = new Date(currentDay.getTime() + 86_400_000);

    // Expire torrents seeded >= MAX_SEED_DAYS
    let expiredGb = 0;
    const newDisk: DiskItem[] = [];
    for (const item of disk) {
      const grabDay = truncateToMidnightUTC(item.grab_date);
      const ageDays = daysDiffUTC(currentDay, grabDay);
      if (ageDays >= MAX_SEED_DAYS) {
        expiredGb += item.size_gb;
        currentDiskGb -= item.size_gb;
      } else {
        newDisk.push(item);
      }
    }
    disk = newDisk;

    // Get torrents for this day
    const dayTorrents = sortedTorrents.filter((t) => {
      const d = parseDate(t.date);
      return d.getTime() >= currentDay.getTime() && d.getTime() < nextDay.getTime();
    });

    // Process hour by hour
    let dayGrabbed = 0;
    let dayGrabbedGb = 0;
    let daySkippedNoMatch = 0;
    let daySkippedRate = 0;
    let daySkippedStorage = 0;

    for (let hour = 0; hour < 24; hour++) {
      const hourStart = new Date(currentDay.getTime() + hour * 3_600_000);
      const hourEnd = new Date(hourStart.getTime() + 3_600_000);

      const hourTorrents = dayTorrents
        .filter((t) => {
          const d = parseDate(t.date);
          return d.getTime() >= hourStart.getTime() && d.getTime() < hourEnd.getTime();
        })
        .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

      for (const torrent of hourTorrents) {
        let matchedFilter: InternalFilter | null = null;

        // Try filters in priority order
        for (const filt of filters) {
          if (!torrentMatchesFilter(torrent, filt.data)) continue;

          // Check rate limit
          const hourKey = `${dayOffset}:${hour}:${filt.name}`;
          const currentCount = hourlyGrabs.get(hourKey) ?? 0;
          if (currentCount >= filt.max_downloads) continue;

          matchedFilter = filt;
          break;
        }

        if (matchedFilter === null) {
          // Determine skip reason
          const anyMatch = filters.some((f) => torrentMatchesFilter(torrent, f.data));
          if (anyMatch) {
            skipReasons.rate_limited++;
            daySkippedRate++;
          } else {
            skipReasons.no_match++;
            daySkippedNoMatch++;
          }
          continue;
        }

        // Check storage
        if (currentDiskGb + torrent.size_gb > maxStorageGb) {
          skipReasons.storage_full++;
          daySkippedStorage++;
          continue;
        }

        // Grab the torrent
        const hourKey = `${dayOffset}:${hour}:${matchedFilter.name}`;
        hourlyGrabs.set(hourKey, (hourlyGrabs.get(hourKey) ?? 0) + 1);
        currentDiskGb += torrent.size_gb;
        disk.push({
          grab_date: parseDate(torrent.date),
          size_gb: torrent.size_gb,
          filter: matchedFilter.name,
        });
        perFilterStats[matchedFilter.name].count++;
        perFilterStats[matchedFilter.name].gb += torrent.size_gb;
        perFilterStats[matchedFilter.name].sizes.push(torrent.size_gb);
        dayGrabbed++;
        dayGrabbedGb += torrent.size_gb;
        totalGrabbed++;
        totalGrabbedGb += torrent.size_gb;
      }
    }

    dailyStats.push({
      day: dayOffset + 1,
      date: currentDay.toISOString().slice(0, 10),
      grabbed: dayGrabbed,
      grabbed_gb: Math.round(dayGrabbedGb * 10) / 10,
      expired_gb: Math.round(expiredGb * 10) / 10,
      disk_usage_gb: Math.round(currentDiskGb * 10) / 10,
      utilization_pct:
        Math.round((currentDiskGb / maxStorageGb) * 1000) / 10,
      available_torrents: dayTorrents.length,
      skipped_no_match: daySkippedNoMatch,
      skipped_rate_limit: daySkippedRate,
      skipped_storage: daySkippedStorage,
    });
  }

  // Compute steady-state stats (after day MAX_SEED_DAYS)
  const steadyStateDays = dailyStats.filter((d) => d.day > MAX_SEED_DAYS);
  const avgUtilization =
    steadyStateDays.length > 0
      ? steadyStateDays.reduce((s, d) => s + d.utilization_pct, 0) / steadyStateDays.length
      : 0;
  const avgDiskGb =
    steadyStateDays.length > 0
      ? steadyStateDays.reduce((s, d) => s + d.disk_usage_gb, 0) / steadyStateDays.length
      : 0;

  // Compute per-filter median sizes and clean up
  const finalPerFilter: Record<string, { count: number; gb: number; median_size: number }> = {};
  for (const [fname, stats] of Object.entries(perFilterStats)) {
    finalPerFilter[fname] = {
      count: stats.count,
      gb: Math.round(stats.gb * 10) / 10,
      median_size: stats.sizes.length > 0 ? Math.round(median(stats.sizes) * 10) / 10 : 0,
    };
  }

  // Count blackout days (post-ramp-up days with 0 grabs)
  const blackoutDays = steadyStateDays.filter((d) => d.grabbed === 0).length;

  return {
    total_seen: sortedTorrents.length,
    total_grabbed: totalGrabbed,
    total_grabbed_gb: Math.round(totalGrabbedGb * 10) / 10,
    grab_rate_pct:
      sortedTorrents.length > 0
        ? Math.round((totalGrabbed / sortedTorrents.length) * 1000) / 10
        : 0,
    total_days: totalDays,
    skip_reasons: skipReasons,
    daily_stats: dailyStats,
    per_filter_stats: finalPerFilter,
    steady_state_avg_utilization: Math.round(avgUtilization * 10) / 10,
    steady_state_avg_disk_gb: Math.round(avgDiskGb * 10) / 10,
    max_storage_gb: maxStorageGb,
    filters_used: filters.map((f) => f.name),
    blackout_days: blackoutDays,
  };
}

function emptyResult(maxStorageGb: number, filters: InternalFilter[]): SimulationResult {
  return {
    total_seen: 0,
    total_grabbed: 0,
    total_grabbed_gb: 0,
    grab_rate_pct: 0,
    total_days: 0,
    skip_reasons: { no_match: 0, rate_limited: 0, storage_full: 0 },
    daily_stats: [],
    per_filter_stats: {},
    steady_state_avg_utilization: 0,
    steady_state_avg_disk_gb: 0,
    max_storage_gb: maxStorageGb,
    filters_used: filters.map((f) => f.name),
    blackout_days: 0,
  };
}

// ---------------------------------------------------------------------------
// Calibration sweep
// ---------------------------------------------------------------------------

/**
 * Calibrate the low-tier filter to fill remaining budget after high+medium.
 *
 * Sweeps max_size (15GB-30GB) and max_downloads/hour (1-10).
 * Returns the best settings and the corresponding simulation result.
 */
export function calibrateLowTier(
  filterJsons: GeneratedFilter[],
  matureTorrents: NormalizedTorrent[],
  storageTb: number,
  targetUtilizationPct: number = TARGET_UTILIZATION_PCT,
): { bestSettings: { rate: number; maxSize: string }; bestSim: SimulationResult } {
  // Find the low-tier filter index
  let lowFilterIdx: number | null = null;
  for (let i = 0; i < filterJsons.length; i++) {
    if (filterJsons[i].name.includes('low')) {
      lowFilterIdx = i;
      break;
    }
  }

  if (lowFilterIdx === null) {
    return {
      bestSettings: { rate: 0, maxSize: '30GB' },
      bestSim: runSimulation(matureTorrents, filterJsons, storageTb),
    };
  }

  let bestSettings = { rate: 1, maxSize: '30GB' };
  let bestSim: SimulationResult | null = null;
  let bestDiff = Infinity;

  const sizeCaps = ['15GB', '20GB', '25GB', '30GB'];
  const rates = Array.from({ length: 10 }, (_, i) => i + 1);

  for (const maxSize of sizeCaps) {
    for (const rate of rates) {
      const testJsons: GeneratedFilter[] = filterJsons.map((fj, i) => {
        const dataCopy: FilterData = { ...fj.data };
        if (i === lowFilterIdx) {
          dataCopy.max_downloads = rate;
          dataCopy.max_size = maxSize;
          dataCopy.enabled = true;
        }
        return { name: fj.name, version: fj.version, data: dataCopy };
      });

      const sim = runSimulation(matureTorrents, testJsons, storageTb);
      const util = sim.steady_state_avg_utilization;
      const blackouts = sim.blackout_days;
      let diff = Math.abs(util - targetUtilizationPct);

      // Penalize blackout days heavily
      if (blackouts > 0) {
        diff += blackouts * 5;
      }

      if (diff < bestDiff) {
        bestDiff = diff;
        bestSettings = { rate, maxSize };
        bestSim = sim;
      }

      // If this rate already overshoots with blackouts, larger rates will be worse
      if (blackouts > 0) {
        break;
      }
    }
  }

  return {
    bestSettings,
    bestSim: bestSim ?? runSimulation(matureTorrents, filterJsons, storageTb),
  };
}
