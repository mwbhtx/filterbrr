import type {
  ScoredTorrent,
  AttributeStats,
  DailyVolume,
  RateLimit,
  GeneratedFilter,
  SimulationResult,
} from './types';
import {
  MAX_SEED_DAYS,
  BURST_FACTOR,
  TARGET_UTILIZATION_PCT,
} from './tiers';
import {
  EXCEPT_RELEASES,
  EXCLUDED_RESOLUTIONS,
  EXCLUDED_SOURCES,
  collectTierValues,
  PRIORITY_MAP,
  DELAY_MAP,
  SIZE_MAP,
} from './filters';

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/**
 * Generate a full markdown analysis report.
 */
export function generateReport(
  sourceName: string,
  torrents: ScoredTorrent[],
  analyses: Record<string, Record<string, AttributeStats>>,
  tiers: Record<string, Record<string, string>>,
  dailyVolume: Record<string, DailyVolume>,
  medianSizes: Record<string, number>,
  rateLimits: Record<string, RateLimit> & { max_daily_gb?: number },
  storageTb: number,
  filters: GeneratedFilter[],
  simResult?: SimulationResult,
): string {
  const lines: string[] = [];
  const add = (text = '') => lines.push(text);

  // -----------------------------------------------------------------------
  // 1. Header
  // -----------------------------------------------------------------------
  add(`# Torrent Performance Analysis: ${sourceName}`);
  add();
  add(`- **Generated:** ${new Date().toISOString().slice(0, 10)}`);
  add(`- **Dataset:** ${torrents.length} torrents`);
  add(`- **Storage budget:** ${storageTb} TB`);
  add();

  // -----------------------------------------------------------------------
  // 2. Methodology
  // -----------------------------------------------------------------------
  add('## Methodology');
  add();
  add('### Scoring Model');
  add();
  add('Each torrent is scored to estimate upload potential relative to competition:');
  add();
  add('```');
  add('score = snatched / (seeders + 1)');
  add('```');
  add();
  add('- **snatched** = total downloads (lifetime demand signal)');
  add('- **seeders** = current seeders (competition signal)');
  add('- **+1** prevents division by zero');
  add();
  add('### Storage Efficiency (Score/GB)');
  add();
  add('```');
  add('score_per_gb = score / size_gb');
  add('```');
  add();
  add('This is the primary ranking metric. Tier assignment is based on Score/GB percentiles.');
  add();
  add(`Torrents matching the global except_releases pattern are excluded.`);

  // -----------------------------------------------------------------------
  // 3. Attribute Rankings
  // -----------------------------------------------------------------------
  add('## Attribute Rankings');
  add();
  add('Tables are sorted by Score/GB (the tier-assignment metric). Columns:');
  add();
  add('- **Median Score:** Raw score for reference');
  add('- **Score/GB:** Storage efficiency (primary ranking metric)');
  add('- **Count:** Torrents with this value');
  add('- **Est. Daily Vol:** Estimated daily volume in GB');
  add('- **Tier:** Assigned from Score/GB percentiles');
  add();

  const reportDims = [
    'category', 'subcategory', 'resolution', 'source', 'codec', 'hdr',
    'size_bucket', 'resolution_x_source',
  ];

  for (const dim of reportDims) {
    const data = analyses[dim];
    if (!data || Object.keys(data).length === 0) continue;
    const dimTiers = tiers[dim] ?? {};
    add(`### ${dim.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);
    add();
    add('| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |');
    add('|-------|-------------|---------|-------|---------------|------|');
    for (const [val, stats] of Object.entries(data)) {
      const tier = dimTiers[val] ?? '-';
      add(`| ${val} | ${stats.median.toFixed(2)} | ${stats.median_spg.toFixed(4)} | ${stats.count} | ${stats.daily_gb.toFixed(1)} GB/d | ${tier} |`);
    }
    add();
  }

  // -----------------------------------------------------------------------
  // Release Groups
  // -----------------------------------------------------------------------
  const rgData = analyses['release_group'] ?? {};
  const rgTiers = tiers['release_group'] ?? {};
  if (Object.keys(rgData).length > 0) {
    add('## Top Release Groups');
    add();
    add('Release groups ranked by median Score/GB. Only groups with 3+ torrents shown.');
    add('Tier assignment uses composite ranking (score rank + snatches rank + score/GB rank).');
    add('Groups with 10+ torrents are eligible for tiers.');
    add();
    add('| Group | Median Score | Score/GB | Count | Est. Daily Vol | Tier |');
    add('|-------|-------------|---------|-------|---------------|------|');

    const tieredGroups = Object.entries(rgData).filter(([val]) => val in rgTiers);
    const untieredGroups = Object.entries(rgData).filter(([val]) => !(val in rgTiers));
    const orderedGroups = [...tieredGroups, ...untieredGroups];

    for (let i = 0; i < Math.min(30, orderedGroups.length); i++) {
      const [val, stats] = orderedGroups[i];
      const tier = rgTiers[val] ?? '-';
      add(`| ${val} | ${stats.median.toFixed(2)} | ${stats.median_spg.toFixed(4)} | ${stats.count} | ${stats.daily_gb.toFixed(1)} GB/d | ${tier} |`);
    }
    add();
  }

  // -----------------------------------------------------------------------
  // 4. Tier Assignment
  // -----------------------------------------------------------------------
  add('## Tier Assignment');
  add();
  add('- **High tier:** Score/GB >= 75th percentile (top 25%)');
  add('- **Medium tier:** Score/GB >= 25th percentile (middle 50%)');
  add('- **Low tier:** Score/GB < 25th percentile (bottom 25%)');
  add();
  add('### How tiers map to filters');
  add();
  add('- **High** (priority 4, 5s delay): Allowlist of high-tier release groups');
  add('- **Medium** (priority 3, 30s delay): Blocklist of low-tier groups');
  add('- **Low** (priority 2, 60s delay): All resolutions/sources, rate/size calibrated via simulation');
  add('- **Opportunistic** (priority 1, 65s delay): Small efficient torrents (<=15GB, 1080p/720p)');
  add();

  // -----------------------------------------------------------------------
  // 5. Storage Budget
  // -----------------------------------------------------------------------
  add('## Storage Budget');
  add();
  const maxDailyGb = (rateLimits as Record<string, unknown>).max_daily_gb ?? ((storageTb * 1024) / MAX_SEED_DAYS);
  add('```');
  add(`max_daily_intake = (${storageTb} TB * 1024) / ${MAX_SEED_DAYS} days = ${typeof maxDailyGb === 'number' ? maxDailyGb.toFixed(1) : maxDailyGb} GB/day`);
  add('```');
  add();
  add('### Parameters');
  add();
  add('| Parameter | Value |');
  add('|-----------|-------|');
  add(`| Storage capacity | ${storageTb} TB |`);
  add(`| Max seed days | ${MAX_SEED_DAYS} days |`);
  add(`| Max daily intake | ${typeof maxDailyGb === 'number' ? maxDailyGb.toFixed(1) : maxDailyGb} GB/day |`);
  add(`| Burst factor | ${BURST_FACTOR} |`);
  add(`| Target utilization | ${TARGET_UTILIZATION_PCT}% |`);
  add();

  add('### Per-Tier Budget Allocation');
  add();
  add('| Tier | Enabled | Budget GB/day | Median Size | DL/hour Rate Limit |');
  add('|------|---------|--------------|-------------|--------------------|');
  for (const level of ['high', 'medium', 'low', 'opportunistic'] as const) {
    const info = (rateLimits as Record<string, RateLimit>)[level] ?? { enabled: false, daily_gb: 0, max_downloads_per_hour: 0 };
    const enabled = info.enabled ? 'yes' : 'no';
    const dailyGb = info.daily_gb ?? 0;
    const med = medianSizes[level] ?? 0;
    const dph = info.max_downloads_per_hour ?? 0;
    if (level === 'low' && simResult) {
      const lowSim = simResult.per_filter_stats;
      const lowKey = Object.keys(lowSim).find(k => k.includes('low'));
      const actualMed = lowKey ? lowSim[lowKey].median_size : med;
      add(`| ${level} | yes | *(calibrated)* | ${actualMed.toFixed(1)} GB | ${dph} |`);
    } else {
      add(`| ${level} | ${enabled} | ${dailyGb.toFixed(1)} | ${med.toFixed(1)} GB | ${dph} |`);
    }
  }
  add();

  // -----------------------------------------------------------------------
  // 6. Generated Filters
  // -----------------------------------------------------------------------
  add('## Generated Filters');
  add();
  add('### Excluded from all filters');
  add();
  add('```');
  add(EXCEPT_RELEASES);
  add('```');
  add();

  const resTiers = tiers['resolution'] ?? {};
  const srcTiers = tiers['source'] ?? {};
  const highGroups = collectTierValues(rgTiers, ['high']).sort();
  const lowGroups = collectTierValues(rgTiers, ['low']).sort();

  const tierSpecs: Array<[string, number]> = [
    ['high', 0], ['medium', 1], ['low', 2], ['opportunistic', 3],
  ];

  for (const [level, idx] of tierSpecs) {
    const info = (rateLimits as Record<string, RateLimit>)[level] ?? { enabled: false, max_downloads_per_hour: 0, daily_gb: 0, torrents_per_day: 0 };
    const isEnabled = info.enabled;
    const dph = info.max_downloads_per_hour ?? 0;
    const priority = PRIORITY_MAP[idx];
    const delay = DELAY_MAP[idx];
    const sizeRange = SIZE_MAP[idx];

    // Compute resolutions for display
    let resolutions: string[];
    if (idx === 2) {
      resolutions = Object.keys(resTiers).filter(r => r !== 'unknown');
    } else if (idx === 3) {
      resolutions = ['720p', '1080p'];
    } else if (idx === 0) {
      resolutions = collectTierValues(resTiers, ['high', 'medium']).filter(r => !EXCLUDED_RESOLUTIONS.has(r));
    } else {
      resolutions = collectTierValues(resTiers, ['medium']).filter(r => !EXCLUDED_RESOLUTIONS.has(r));
    }
    if (resolutions.length === 0) resolutions = ['1080p', '2160p'];

    let sources: string[];
    if (idx === 2) {
      sources = Object.keys(srcTiers).filter(s => s !== 'Other');
    } else if (idx === 3) {
      sources = collectTierValues(srcTiers, ['high', 'medium']).filter(s => !EXCLUDED_SOURCES.has(s));
    } else if (idx === 0) {
      sources = collectTierValues(srcTiers, ['high', 'medium']).filter(s => !EXCLUDED_SOURCES.has(s));
    } else {
      sources = collectTierValues(srcTiers, ['medium']).filter(s => !EXCLUDED_SOURCES.has(s));
    }
    if (sources.length === 0) sources = ['WEB-DL', 'WEBRip', 'BluRay', 'Remux'];

    add(`### Tier: ${level.toUpperCase()} (priority ${priority})`);
    add();

    if (!isEnabled) {
      add('**Status: DISABLED** -- storage budget consumed by higher tiers.');
      add();
    } else {
      if (idx === 2 && simResult) {
        const lowSim = simResult.per_filter_stats;
        const lowKey = Object.keys(lowSim).find(k => k.includes('low'));
        if (lowKey) {
          const actualGbDay = lowSim[lowKey].gb / Math.max(1, simResult.total_days);
          const actualTpd = lowSim[lowKey].count / Math.max(1, simResult.total_days);
          add(`**Status: ENABLED** -- ~${actualGbDay.toFixed(1)} GB/day, ~${actualTpd.toFixed(1)} torrents/day (from simulation)`);
        } else {
          add(`**Status: ENABLED** -- ${(info.daily_gb ?? 0).toFixed(1)} GB/day`);
        }
      } else {
        add(`**Status: ENABLED** -- ${(info.daily_gb ?? 0).toFixed(1)} GB/day, ~${(info.torrents_per_day ?? 0).toFixed(1)} torrents/day`);
      }
      add();
    }

    add('| Setting | Value |');
    add('|---------|-------|');
    add(`| Priority | ${priority} |`);
    add(`| Delay | ${delay}s |`);
    add(`| Size range | ${sizeRange[0]} - ${sizeRange[1]} |`);
    add(`| Rate limit | ${dph} downloads/hour |`);
    add(`| Resolutions | ${[...resolutions].sort().join(', ')} |`);
    add(`| Sources | ${[...sources].sort().join(', ')} |`);

    if (idx === 0) {
      add('| Strategy | **Allowlist** -- only grab from these groups |');
      add(`| Groups | ${highGroups.join(', ') || '(none)'} |`);
    } else {
      add('| Strategy | **Blocklist** -- grab from anyone except these groups |');
      add(`| Groups excluded | ${lowGroups.join(', ') || '(none)'} |`);
    }
    add();
  }

  // -----------------------------------------------------------------------
  // 7. Simulation Results
  // -----------------------------------------------------------------------
  if (simResult) {
    const sim = simResult;
    add('## Filter Simulation');
    add();
    add('### Summary');
    add();
    add('| Metric | Value |');
    add('|--------|-------|');
    add(`| Simulation period | ${sim.total_days} days |`);
    add(`| Torrents seen | ${sim.total_seen} |`);
    add(`| Torrents grabbed | ${sim.total_grabbed} (${sim.grab_rate_pct}%) |`);
    add(`| Total GB grabbed | ${sim.total_grabbed_gb.toFixed(1)} GB |`);

    const steadyStateDays = sim.daily_stats.filter(d => d.day > MAX_SEED_DAYS);
    if (steadyStateDays.length > 0) {
      add(`| Steady-state avg disk usage | ${sim.steady_state_avg_disk_gb.toFixed(1)} GB (${sim.steady_state_avg_utilization.toFixed(1)}% of ${sim.max_storage_gb.toFixed(0)} GB) |`);
      const minUtil = Math.min(...steadyStateDays.map(d => d.utilization_pct));
      const maxUtil = Math.max(...steadyStateDays.map(d => d.utilization_pct));
      add(`| Steady-state utilization range | ${minUtil.toFixed(1)}% -- ${maxUtil.toFixed(1)}% |`);
      add(`| Blackout days (0 grabs, post-ramp-up) | ${sim.blackout_days} |`);
    }
    add();

    // Verdict
    if (steadyStateDays.length > 0) {
      const targetLow = sim.max_storage_gb * (TARGET_UTILIZATION_PCT / 100);
      const avgGb = sim.steady_state_avg_disk_gb;
      add('### Verdict');
      add();
      if (avgGb >= targetLow) {
        add(`**PASS** -- Steady-state disk usage averages ${avgGb.toFixed(0)} GB (${sim.steady_state_avg_utilization.toFixed(1)}%), within the target range.`);
      } else {
        const shortfall = targetLow - avgGb;
        add(`**UNDERUTILIZED** -- Steady-state disk usage averages ${avgGb.toFixed(0)} GB (${sim.steady_state_avg_utilization.toFixed(1)}%), ${shortfall.toFixed(0)} GB below target.`);
      }
      add();
    }

    // Skip reasons
    const skips = sim.skip_reasons;
    const totalSkipped = Object.values(skips).reduce((a, b) => a + b, 0);
    if (totalSkipped > 0) {
      add('### Skip Reasons');
      add();
      add('| Reason | Count | % of Seen |');
      add('|--------|-------|-----------|');
      const sorted = Object.entries(skips).sort((a, b) => b[1] - a[1]);
      for (const [reason, count] of sorted) {
        const label = reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const pct = sim.total_seen > 0 ? (count / sim.total_seen * 100).toFixed(1) : '0.0';
        add(`| ${label} | ${count} | ${pct}% |`);
      }
      add();
    }

    // Per-filter breakdown
    add('### Per-Filter Breakdown');
    add();
    add('| Filter | Torrents | Total GB | Median Size | Avg GB/day |');
    add('|--------|----------|----------|-------------|------------|');
    for (const fname of sim.filters_used) {
      const fstats = sim.per_filter_stats[fname] ?? { count: 0, gb: 0, median_size: 0 };
      const avgDaily = sim.total_days > 0 ? fstats.gb / sim.total_days : 0;
      add(`| ${fname} | ${fstats.count} | ${fstats.gb.toFixed(1)} GB | ${fstats.median_size.toFixed(1)} GB | ${avgDaily.toFixed(1)} GB/d |`);
    }
    add();

    // Daily log
    add('### Daily Log');
    add();
    add('| Day | Date | Available | Grabbed | GB In | GB Expired | Disk Usage | Util % |');
    add('|-----|------|-----------|---------|-------|------------|------------|--------|');
    for (const d of sim.daily_stats) {
      add(`| ${d.day} | ${d.date} | ${d.available_torrents} | ${d.grabbed} | ${d.grabbed_gb.toFixed(1)} | ${d.expired_gb.toFixed(1)} | ${d.disk_usage_gb.toFixed(1)} GB | ${d.utilization_pct.toFixed(1)}% |`);
    }
    add();

    // Storage pressure days
    const storagePressureDays = sim.daily_stats.filter(d => d.skipped_storage > 0);
    if (storagePressureDays.length > 0) {
      add('### Storage Pressure Days');
      add();
      add('| Date | Skipped (Storage) | Skipped (Rate) | Disk Usage |');
      add('|------|-------------------|----------------|------------|');
      for (const d of storagePressureDays) {
        add(`| ${d.date} | ${d.skipped_storage} | ${d.skipped_rate_limit} | ${d.disk_usage_gb.toFixed(1)} GB |`);
      }
      add();
    }
  }

  return lines.join('\n');
}
