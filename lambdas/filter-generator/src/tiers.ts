import type { ScoredTorrent, AttributeStats, DailyVolume, RateLimit } from './types';
import { median, quantiles, sizeBucket } from './scoring';

// ---------------------------------------------------------------------------
// Constants (configurable via env vars, matching Python defaults)
// ---------------------------------------------------------------------------

export const MAX_SEED_DAYS = parseInt(process.env.MAX_SEED_DAYS ?? '10', 10);
export const BURST_FACTOR = parseInt(process.env.BURST_FACTOR ?? '8', 10);
export const TARGET_UTILIZATION_PCT = parseFloat(process.env.TARGET_UTILIZATION_PCT ?? '85');

export const TIER_LABELS = ['high', 'medium', 'low'] as const;

// ---------------------------------------------------------------------------
// Release group tier assignment
// ---------------------------------------------------------------------------

/**
 * Assign tiers to release groups using composite ranking.
 * Only groups with >= 10 torrents qualify. Composite rank is the average of
 * score rank, snatches rank, and score/GB rank.
 * Top 25% -> high, middle 50% -> medium, bottom 25% -> low.
 */
export function assignReleaseGroupTiers(
  groupResults: Record<string, AttributeStats>,
  torrents: ScoredTorrent[],
): Record<string, string> {
  const qualified: Record<string, AttributeStats> = {};
  for (const [k, v] of Object.entries(groupResults)) {
    if (v.count >= 10) qualified[k] = v;
  }

  if (Object.keys(qualified).length === 0) return {};
  if (Object.keys(qualified).length < 4) {
    return Object.fromEntries(Object.keys(qualified).map(k => [k, 'medium']));
  }

  // Compute per-group medians from raw torrent data
  const groupSnatches: Record<string, number[]> = {};
  const groupSpg: Record<string, number[]> = {};
  for (const t of torrents) {
    const g = t.release_group;
    if (g in qualified) {
      (groupSnatches[g] ??= []).push(t.snatched);
      (groupSpg[g] ??= []).push(t.score_per_gb);
    }
  }

  const groups = Object.keys(qualified);

  // Rank by three signals (higher value = lower rank index = better)
  const byScore = [...groups].sort(
    (a, b) => qualified[b].median - qualified[a].median,
  );
  const bySnatches = [...groups].sort(
    (a, b) =>
      (groupSnatches[b] ? median(groupSnatches[b]) : 0) -
      (groupSnatches[a] ? median(groupSnatches[a]) : 0),
  );
  const bySpg = [...groups].sort(
    (a, b) =>
      (groupSpg[b] ? median(groupSpg[b]) : 0) -
      (groupSpg[a] ? median(groupSpg[a]) : 0),
  );

  const scoreRank: Record<string, number> = {};
  const snatchRank: Record<string, number> = {};
  const spgRank: Record<string, number> = {};
  byScore.forEach((g, i) => (scoreRank[g] = i));
  bySnatches.forEach((g, i) => (snatchRank[g] = i));
  bySpg.forEach((g, i) => (spgRank[g] = i));

  // Composite rank (lower = better): average of all three ranks
  const composite: Record<string, number> = {};
  for (const g of groups) {
    composite[g] = (scoreRank[g] + snatchRank[g] + spgRank[g]) / 3;
  }
  const ranked = [...groups].sort((a, b) => composite[a] - composite[b]);

  const n = ranked.length;
  const p25Idx = Math.floor(n / 4);
  const p75Idx = Math.floor((n * 3) / 4);

  const tiers: Record<string, string> = {};
  for (let i = 0; i < ranked.length; i++) {
    if (i < p25Idx) {
      tiers[ranked[i]] = 'high';
    } else if (i < p75Idx) {
      tiers[ranked[i]] = 'medium';
    } else {
      tiers[ranked[i]] = 'low';
    }
  }
  return tiers;
}

// ---------------------------------------------------------------------------
// Tier assignment for all dimensions
// ---------------------------------------------------------------------------

/**
 * Assign high/medium/low tiers per dimension based on score/GB percentiles.
 * Uses quantiles(spg_values, 4) to get p25/p75.
 * >= p75 -> high, >= p25 -> medium, else low.
 * Overrides release_group with assignReleaseGroupTiers.
 */
export function assignTiers(
  analyses: Record<string, Record<string, AttributeStats>>,
  torrents: ScoredTorrent[],
): Record<string, Record<string, string>> {
  const tierMap: Record<string, Record<string, string>> = {};

  for (const [dimension, results] of Object.entries(analyses)) {
    if (!results || Object.keys(results).length === 0) {
      tierMap[dimension] = {};
      continue;
    }

    const spgValues = Object.values(results).map(v => v.median_spg);
    if (spgValues.length < 4) {
      tierMap[dimension] = Object.fromEntries(
        Object.keys(results).map(k => [k, 'medium']),
      );
      continue;
    }

    const q = quantiles(spgValues, 4);
    const p25 = q[0];
    const p75 = q[2];

    const tiers: Record<string, string> = {};
    for (const [val, stats] of Object.entries(results)) {
      if (stats.median_spg >= p75) {
        tiers[val] = 'high';
      } else if (stats.median_spg >= p25) {
        tiers[val] = 'medium';
      } else {
        tiers[val] = 'low';
      }
    }
    tierMap[dimension] = tiers;
  }

  // Override release_group tiers with qualified-only logic
  if ('release_group' in analyses) {
    tierMap['release_group'] = assignReleaseGroupTiers(
      analyses['release_group'],
      torrents,
    );
  }

  return tierMap;
}

// ---------------------------------------------------------------------------
// Torrent tier classification
// ---------------------------------------------------------------------------

/**
 * Classify a single torrent into a tier based on multi-attribute scoring.
 * Category/resolution/source/size_bucket: 1 point each.
 * Release group: 2 points (double weight).
 * Highest score wins; high > medium > low on tie; default medium.
 */
export function classifyTorrentTier(
  torrent: ScoredTorrent,
  tiers: Record<string, Record<string, string>>,
): string {
  const scores: Record<string, number> = { high: 0, medium: 0, low: 0 };

  // Standard dimensions (weight 1 each)
  const checks: Record<string, string> = {
    category: torrent.category,
    resolution: torrent.resolution,
    source: torrent.source,
    size_bucket: sizeBucket(torrent.size_gb),
  };
  for (const [dim, val] of Object.entries(checks)) {
    const tier = tiers[dim]?.[val];
    if (tier) scores[tier] += 1;
  }

  // Release group (weight 2)
  const rgTier = tiers['release_group']?.[torrent.release_group];
  if (rgTier) scores[rgTier] += 2;

  // Resolve: highest score wins, default medium on tie
  const maxScore = Math.max(scores.high, scores.medium, scores.low);
  if (maxScore === 0) return 'medium';
  // Check in priority order: high > medium > low
  for (const level of ['high', 'medium', 'low'] as const) {
    if (scores[level] === maxScore) return level;
  }
  return 'medium';
}

// ---------------------------------------------------------------------------
// Daily volume calculation
// ---------------------------------------------------------------------------

/**
 * Classify all torrents and compute per-tier daily volume + median sizes.
 */
export function calculateDailyVolume(
  torrents: ScoredTorrent[],
  tiers: Record<string, Record<string, string>>,
): { dailyVolume: Record<string, DailyVolume>; medianSizes: Record<string, number> } {
  const tierTorrents: Record<string, ScoredTorrent[]> = {
    high: [],
    medium: [],
    low: [],
  };
  const torrentTiers: Record<number, string> = {};

  for (const t of torrents) {
    const tier = classifyTorrentTier(t, tiers);
    tierTorrents[tier].push(t);
    torrentTiers[t.torrent_id] = tier;
  }

  // Date range
  const dates = torrents
    .map(t => new Date(t.date + (t.date.includes('T') ? '' : ' UTC')).getTime())
    .filter(d => !isNaN(d));
  if (dates.length === 0) {
    return {
      dailyVolume: {},
      medianSizes: {},
    };
  }
  const dateRangeDays = Math.max(
    1,
    (Math.max(...dates) - Math.min(...dates)) / 86400_000,
  );

  const dailyVolume: Record<string, DailyVolume> = {};
  const medianSizes: Record<string, number> = {};

  for (const level of ['high', 'medium', 'low'] as const) {
    const group = tierTorrents[level];
    const count = group.length;
    if (count === 0) {
      dailyVolume[level] = { count: 0, torrents_per_day: 0, daily_gb: 0 };
      medianSizes[level] = 0;
      continue;
    }
    const sizes = group.map(t => t.size_gb);
    const medSize = median(sizes);
    const tpd = count / dateRangeDays;
    dailyVolume[level] = {
      count,
      torrents_per_day: Math.round(tpd * 10) / 10,
      daily_gb: Math.round(tpd * medSize * 10) / 10,
    };
    medianSizes[level] = Math.round(medSize * 100) / 100;
  }

  return { dailyVolume, medianSizes };
}

// ---------------------------------------------------------------------------
// Rate limit calculation
// ---------------------------------------------------------------------------

/**
 * Calculate per-tier rate limits fitting within storage budget.
 * Fill-from-top: high and medium take their natural daily volume (uncapped),
 * then low gets a rate limit calibrated to fill the remaining budget.
 */
export function calculateRateLimits(
  dailyVolume: Record<string, DailyVolume>,
  medianSizes: Record<string, number>,
  storageTb: number,
): Record<string, RateLimit> & { max_daily_gb: number } {
  const maxDailyGb = (storageTb * 1024) / MAX_SEED_DAYS;
  let remainingGb = maxDailyGb;

  const result: Record<string, unknown> = {
    max_daily_gb: Math.round(maxDailyGb * 10) / 10,
  };

  // High and medium: allocate their natural daily volume, uncapped
  for (const level of ['high', 'medium'] as const) {
    const vol = dailyVolume[level] ?? { daily_gb: 0, torrents_per_day: 0 };
    const needed = vol.daily_gb;
    const medSize = medianSizes[level] ?? 0;

    if (remainingGb <= 0 || needed === 0 || medSize === 0) {
      result[level] = {
        enabled: false,
        daily_gb: 0,
        torrents_per_day: 0,
        max_downloads_per_hour: 0,
      };
      continue;
    }

    const allocatedGb = Math.min(needed, remainingGb);
    remainingGb -= allocatedGb;
    const tpd = allocatedGb / medSize;
    const maxDph = Math.max(1, Math.round((tpd / 24) * BURST_FACTOR));
    result[level] = {
      enabled: true,
      daily_gb: Math.round(allocatedGb * 10) / 10,
      torrents_per_day: Math.round(tpd * 10) / 10,
      max_downloads_per_hour: maxDph,
    };
  }

  // Low tier: gets exactly the remaining budget
  const medSizeLow = (() => {
    const ms = medianSizes['low'] ?? 0;
    if (ms > 0) return ms;
    // Fallback: use average of other tier median sizes
    const allSizes = Object.values(medianSizes).filter(s => s > 0);
    return allSizes.length > 0
      ? allSizes.reduce((a, b) => a + b, 0) / allSizes.length
      : 10.0;
  })();

  if (remainingGb > 0) {
    const tpd = remainingGb / medSizeLow;
    // Use a lower burst factor for low tier
    const lowBurst = Math.max(1, Math.floor(BURST_FACTOR / 2));
    const maxDph = Math.max(1, Math.round((tpd / 24) * lowBurst));
    result['low'] = {
      enabled: true,
      daily_gb: Math.round(remainingGb * 10) / 10,
      torrents_per_day: Math.round(tpd * 10) / 10,
      max_downloads_per_hour: maxDph,
    };
    remainingGb = 0;
  } else {
    result['low'] = {
      enabled: false,
      daily_gb: 0,
      torrents_per_day: 0,
      max_downloads_per_hour: 0,
    };
  }

  return result as Record<string, RateLimit> & { max_daily_gb: number };
}
