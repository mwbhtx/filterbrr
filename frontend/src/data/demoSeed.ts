import type {
  Filter,
  SimulationResult,
  DailyStat,
} from '../types';

// ---------------------------------------------------------------------------
// Dataset path
// ---------------------------------------------------------------------------
export const DEMO_DATASET_PATH = 'demo/datasets/freeleech_demo.json';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const DEMO_SETTINGS = {
  dataset: DEMO_DATASET_PATH,
  storageTb: 4,
  maxSeedDays: 10,
  avgRatio: 0.8,
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
const filterDefaults = {
  enabled: true,
  delay: 0,
  except_releases: '',
  announce_types: [] as string[],
  resolutions: [] as string[],
  sources: [] as string[],
  match_categories: '',
  is_auto_updated: false,
  release_profile_duplicate: null,
  match_release_groups: '',
  except_release_groups: '',
} as const;

export const DEMO_FILTERS: Filter[] = [
  {
    name: 'Small Freeleech',
    version: '1',
    _id: 'demo_filter_small',
    _source: 'saved',
    data: {
      ...filterDefaults,
      min_size: '100 MB',
      max_size: '2 GB',
      max_downloads: 20,
      max_downloads_unit: 'DAY',
      freeleech: true,
      priority: 1,
    },
  },
  {
    name: 'Medium Freeleech',
    version: '1',
    _id: 'demo_filter_medium',
    _source: 'saved',
    data: {
      ...filterDefaults,
      min_size: '2 GB',
      max_size: '10 GB',
      max_downloads: 10,
      max_downloads_unit: 'DAY',
      freeleech: true,
      priority: 2,
    },
  },
  {
    name: 'Large Freeleech',
    version: '1',
    _id: 'demo_filter_large',
    _source: 'saved',
    data: {
      ...filterDefaults,
      min_size: '10 GB',
      max_size: '50 GB',
      max_downloads: 3,
      max_downloads_unit: 'DAY',
      freeleech: true,
      priority: 3,
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers for daily_stats generation
// ---------------------------------------------------------------------------
function dateStr(dayIndex: number): string {
  // Day 1 = 2026-02-16, Day 30 = 2026-03-17
  const base = new Date('2026-02-16');
  base.setDate(base.getDate() + dayIndex);
  return base.toISOString().slice(0, 10);
}

function buildDailyStats(): DailyStat[] {
  const stats: DailyStat[] = [];
  let diskUsage = 0;

  // Pre-defined daily grabbed/gb values to ensure realistic ramp + consistency
  const dailyData: Array<{
    grabbed: number;
    grabbed_gb: number;
    upload_gb: number;
    available: number;
    skipNoMatch: number;
    skipRate: number;
    skipStorage: number;
  }> = [
    // Days 1-10: ramp up
    { grabbed: 8,  grabbed_gb: 55,  upload_gb: 10,  available: 28, skipNoMatch: 12, skipRate: 3, skipStorage: 0 },
    { grabbed: 9,  grabbed_gb: 68,  upload_gb: 18,  available: 30, skipNoMatch: 13, skipRate: 2, skipStorage: 0 },
    { grabbed: 10, grabbed_gb: 82,  upload_gb: 25,  available: 27, skipNoMatch: 10, skipRate: 3, skipStorage: 0 },
    { grabbed: 11, grabbed_gb: 90,  upload_gb: 33,  available: 29, skipNoMatch: 11, skipRate: 2, skipStorage: 1 },
    { grabbed: 10, grabbed_gb: 78,  upload_gb: 40,  available: 31, skipNoMatch: 14, skipRate: 3, skipStorage: 0 },
    { grabbed: 12, grabbed_gb: 95,  upload_gb: 48,  available: 33, skipNoMatch: 12, skipRate: 4, skipStorage: 1 },
    { grabbed: 11, grabbed_gb: 88,  upload_gb: 55,  available: 30, skipNoMatch: 11, skipRate: 3, skipStorage: 1 },
    { grabbed: 13, grabbed_gb: 110, upload_gb: 62,  available: 32, skipNoMatch: 10, skipRate: 4, skipStorage: 1 },
    { grabbed: 12, grabbed_gb: 102, upload_gb: 68,  available: 29, skipNoMatch: 9,  skipRate: 3, skipStorage: 1 },
    { grabbed: 14, grabbed_gb: 115, upload_gb: 72,  available: 34, skipNoMatch: 11, skipRate: 4, skipStorage: 1 },
    // Days 11-20: stabilising
    { grabbed: 12, grabbed_gb: 98,  upload_gb: 75,  available: 31, skipNoMatch: 11, skipRate: 3, skipStorage: 2 },
    { grabbed: 11, grabbed_gb: 92,  upload_gb: 78,  available: 28, skipNoMatch: 10, skipRate: 2, skipStorage: 2 },
    { grabbed: 13, grabbed_gb: 105, upload_gb: 80,  available: 33, skipNoMatch: 12, skipRate: 3, skipStorage: 2 },
    { grabbed: 10, grabbed_gb: 85,  upload_gb: 76,  available: 30, skipNoMatch: 13, skipRate: 2, skipStorage: 2 },
    { grabbed: 12, grabbed_gb: 100, upload_gb: 82,  available: 32, skipNoMatch: 11, skipRate: 4, skipStorage: 2 },
    { grabbed: 11, grabbed_gb: 90,  upload_gb: 78,  available: 29, skipNoMatch: 10, skipRate: 3, skipStorage: 3 },
    { grabbed: 13, grabbed_gb: 108, upload_gb: 85,  available: 35, skipNoMatch: 13, skipRate: 4, skipStorage: 2 },
    { grabbed: 10, grabbed_gb: 82,  upload_gb: 74,  available: 27, skipNoMatch: 10, skipRate: 2, skipStorage: 3 },
    { grabbed: 12, grabbed_gb: 96,  upload_gb: 80,  available: 31, skipNoMatch: 12, skipRate: 3, skipStorage: 2 },
    { grabbed: 11, grabbed_gb: 88,  upload_gb: 77,  available: 30, skipNoMatch: 11, skipRate: 3, skipStorage: 3 },
    // Days 21-30: steady state
    { grabbed: 12, grabbed_gb: 100, upload_gb: 82,  available: 32, skipNoMatch: 12, skipRate: 3, skipStorage: 3 },
    { grabbed: 10, grabbed_gb: 84,  upload_gb: 76,  available: 28, skipNoMatch: 11, skipRate: 2, skipStorage: 3 },
    { grabbed: 13, grabbed_gb: 106, upload_gb: 84,  available: 34, skipNoMatch: 13, skipRate: 4, skipStorage: 2 },
    { grabbed: 11, grabbed_gb: 90,  upload_gb: 78,  available: 30, skipNoMatch: 10, skipRate: 3, skipStorage: 4 },
    { grabbed: 12, grabbed_gb: 98,  upload_gb: 80,  available: 31, skipNoMatch: 12, skipRate: 3, skipStorage: 3 },
    { grabbed: 10, grabbed_gb: 86,  upload_gb: 75,  available: 29, skipNoMatch: 11, skipRate: 2, skipStorage: 4 },
    { grabbed: 11, grabbed_gb: 92,  upload_gb: 78,  available: 30, skipNoMatch: 10, skipRate: 3, skipStorage: 3 },
    { grabbed: 13, grabbed_gb: 104, upload_gb: 82,  available: 33, skipNoMatch: 12, skipRate: 4, skipStorage: 2 },
    { grabbed: 10, grabbed_gb: 88,  upload_gb: 76,  available: 28, skipNoMatch: 11, skipRate: 2, skipStorage: 4 },
    { grabbed: 12, grabbed_gb: 96,  upload_gb: 80,  available: 31, skipNoMatch: 12, skipRate: 3, skipStorage: 3 },
  ];

  for (let i = 0; i < 30; i++) {
    const d = dailyData[i];
    // Expired GB: content from ~10 days ago rolls off
    const expiredGb = i >= 10 ? dailyData[i - 10].grabbed_gb : 0;
    diskUsage = Math.max(0, diskUsage + d.grabbed_gb - expiredGb);

    stats.push({
      day: i + 1,
      date: dateStr(i),
      grabbed: d.grabbed,
      grabbed_gb: d.grabbed_gb,
      expired_gb: expiredGb,
      disk_usage_gb: Math.round(diskUsage),
      utilization_pct: Math.round((diskUsage / 4000) * 100 * 10) / 10,
      upload_gb: d.upload_gb,
      available_torrents: d.available,
      skipped_no_match: d.skipNoMatch,
      skipped_rate_limit: d.skipRate,
      skipped_storage: d.skipStorage,
    });
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Grabbed torrents (representative sample)
// ---------------------------------------------------------------------------
const GRABBED_TORRENTS: SimulationResult['grabbed_torrents'] = [
  { name: 'The.Last.Adventure.2025.1080p.BluRay.x264-SPARKS', size_gb: 1.4, filter: 'Small Freeleech', date: '2026-02-16' },
  { name: 'Breaking.Limits.S03E08.720p.WEB-DL.x265-NTFY', size_gb: 0.85, filter: 'Small Freeleech', date: '2026-02-17' },
  { name: 'Neon.Horizons.2025.2160p.WEB-DL.DDP5.1.H.265-FLUX', size_gb: 8.2, filter: 'Medium Freeleech', date: '2026-02-18' },
  { name: 'Deep.Currents.S01E01-E03.1080p.AMZN.WEB-DL-NTb', size_gb: 4.6, filter: 'Medium Freeleech', date: '2026-02-19' },
  { name: 'Midnight.Protocol.2024.COMPLETE.BLURAY-UNTOUCHED', size_gb: 42.0, filter: 'Large Freeleech', date: '2026-02-20' },
  { name: 'Solar.Winds.S02E12.PROPER.720p.WEB.H264-GGEZ', size_gb: 1.1, filter: 'Small Freeleech', date: '2026-02-21' },
  { name: 'The.Iron.Coast.2025.1080p.Remux.AVC.DTS-HD.MA-EPSiLON', size_gb: 28.5, filter: 'Large Freeleech', date: '2026-02-22' },
  { name: 'Velocity.2025.720p.BluRay.x264-HANDJOB', size_gb: 3.8, filter: 'Medium Freeleech', date: '2026-02-23' },
  { name: 'Ghost.Signal.S05E01.1080p.DSNP.WEB-DL.DDP5.1-APEX', size_gb: 1.6, filter: 'Small Freeleech', date: '2026-02-24' },
  { name: 'Quantum.Leap.2025.2160p.BluRay.REMUX.HEVC-FraMeSToR', size_gb: 48.3, filter: 'Large Freeleech', date: '2026-02-25' },
  { name: 'Under.The.Wire.S01E05.720p.HMAX.WEB-DL-EDITH', size_gb: 0.92, filter: 'Small Freeleech', date: '2026-02-27' },
  { name: 'Crimson.Tide.Remastered.2025.1080p.BluRay.x264-GECKOS', size_gb: 7.4, filter: 'Medium Freeleech', date: '2026-02-28' },
  { name: 'Starfall.S02.COMPLETE.720p.AMZN.WEB-DL-MIXED', size_gb: 18.6, filter: 'Large Freeleech', date: '2026-03-02' },
  { name: 'The.Quiet.Ones.2025.1080p.WEB-DL.DD5.1.H.264-CMRG', size_gb: 4.2, filter: 'Medium Freeleech', date: '2026-03-05' },
  { name: 'Frostbite.S01E09.720p.PCOK.WEB-DL-SMURF', size_gb: 1.3, filter: 'Small Freeleech', date: '2026-03-08' },
  { name: 'Parallel.Lines.2025.2160p.WEB.H265-GGWP', size_gb: 6.1, filter: 'Medium Freeleech', date: '2026-03-10' },
  { name: 'Echo.Valley.S03E02.1080p.AMZN.WEB-DL.DDP5.1-KODO', size_gb: 1.7, filter: 'Small Freeleech', date: '2026-03-12' },
  { name: 'The.Architects.2025.1080p.BluRay.Remux.AVC-decibeL', size_gb: 32.1, filter: 'Large Freeleech', date: '2026-03-15' },
];

// ---------------------------------------------------------------------------
// Skipped torrents (representative sample)
// ---------------------------------------------------------------------------
const SKIPPED_TORRENTS: SimulationResult['skipped_torrents'] = [
  { name: 'Random.CAM.Movie.2025.HDTS-NOGROUP', size_gb: 1.5, date: '2026-02-16', reason: 'no_match', suggestion: 'No filter matched this release. Add a filter for CAM sources if desired.' },
  { name: 'Ultra.Rare.Anime.S01.1080p.DUAL-WEEB', size_gb: 35.0, date: '2026-02-19', reason: 'no_match', suggestion: 'No filter matched this release. Consider adding an anime-specific filter.' },
  { name: 'Big.Bang.Collection.2025.Remux-FULL', size_gb: 120.0, date: '2026-02-22', reason: 'no_match', suggestion: 'Size exceeds all filter maximums (50 GB). Increase max_size on Large Freeleech if desired.' },
  { name: 'Fast.Track.2025.720p.BluRay.x264-ROVERS', size_gb: 4.5, date: '2026-02-25', reason: 'rate_limited', suggestion: 'Medium Freeleech hit its daily download limit (10/day). Increase max_downloads to grab more.' },
  { name: 'Sunset.Drive.S01E01.1080p.WEB-DL-SIGMA', size_gb: 1.2, date: '2026-02-26', reason: 'rate_limited', suggestion: 'Small Freeleech hit its daily download limit (20/day). Increase max_downloads to grab more.' },
  { name: 'Northern.Lights.2025.2160p.Remux-HONE', size_gb: 45.0, date: '2026-03-01', reason: 'storage_full', suggestion: 'Disk usage was at 95%. Consider increasing storage or reducing max_seed_days.' },
  { name: 'The.Great.Escape.2025.1080p.BluRay-SPARKS', size_gb: 8.0, date: '2026-03-05', reason: 'storage_full', suggestion: 'Disk usage was at 92%. Reduce seed days or increase storage capacity.' },
  { name: 'Wild.Frontier.S02.COMPLETE.1080p-MIXED', size_gb: 22.0, date: '2026-03-08', reason: 'storage_full', suggestion: 'Disk usage was at 97%. Large grabs are first to be skipped when storage is tight.' },
  { name: 'Obscure.Doc.2024.DVDRip.x264-NONAME', size_gb: 0.7, date: '2026-03-11', reason: 'no_match', suggestion: 'Release is not marked freeleech. All filters require freeleech.' },
  { name: 'Rapid.Fire.2025.720p.WEB-DL-JETSET', size_gb: 3.2, date: '2026-03-14', reason: 'rate_limited', suggestion: 'Medium Freeleech hit its daily download limit (10/day). Increase max_downloads to grab more.' },
];

// ---------------------------------------------------------------------------
// Compute totals from daily_stats for consistency
// ---------------------------------------------------------------------------
const daily_stats = buildDailyStats();

const totalGrabbed = daily_stats.reduce((s, d) => s + d.grabbed, 0);
const totalGrabbedGb = daily_stats.reduce((s, d) => s + d.grabbed_gb, 0);
const totalUploadGb = daily_stats.reduce((s, d) => s + d.upload_gb, 0);
const totalSkipNoMatch = daily_stats.reduce((s, d) => s + d.skipped_no_match, 0);
const totalSkipRate = daily_stats.reduce((s, d) => s + d.skipped_rate_limit, 0);
const totalSkipStorage = daily_stats.reduce((s, d) => s + d.skipped_storage, 0);
const totalSeen = totalGrabbed + totalSkipNoMatch + totalSkipRate + totalSkipStorage;

// Steady-state = last 20 days (days 11-30)
const steadyDays = daily_stats.slice(10);
const steadyAvgUtil = Math.round(
  (steadyDays.reduce((s, d) => s + d.utilization_pct, 0) / steadyDays.length) * 10,
) / 10;
const steadyAvgDisk = Math.round(
  steadyDays.reduce((s, d) => s + d.disk_usage_gb, 0) / steadyDays.length,
);
const steadyDailyUpload = Math.round(
  (steadyDays.reduce((s, d) => s + d.upload_gb, 0) / steadyDays.length) * 10,
) / 10;

// Per-filter stats — must sum to totalGrabbed / totalGrabbedGb / totalUploadGb
// Small: ~53% of grabs, ~6.5% of GB  |  Medium: ~32%, ~20%  |  Large: ~15%, ~73.5%
const smallCount = Math.round(totalGrabbed * 0.53);
const mediumCount = Math.round(totalGrabbed * 0.32);
const largeCount = totalGrabbed - smallCount - mediumCount;

const smallGb = Math.round(totalGrabbedGb * 0.065);
const mediumGb = Math.round(totalGrabbedGb * 0.20);
const largeGb = totalGrabbedGb - smallGb - mediumGb;

const smallUpload = Math.round(smallGb * 0.8);
const mediumUpload = Math.round(mediumGb * 0.8);
const largeUpload = totalUploadGb - smallUpload - mediumUpload;

// ---------------------------------------------------------------------------
// Full simulation result
// ---------------------------------------------------------------------------
export const DEMO_SIMULATION_RESULT: SimulationResult = {
  total_seen: totalSeen,
  total_grabbed: totalGrabbed,
  total_grabbed_gb: totalGrabbedGb,
  grab_rate_pct: Math.round((totalGrabbed / totalSeen) * 1000) / 10,
  total_days: 30,
  skip_reasons: {
    no_match: totalSkipNoMatch,
    storage_full: totalSkipStorage,
    rate_limited: totalSkipRate,
  },
  daily_stats,
  per_filter_stats: {
    'Small Freeleech': { count: smallCount, gb: smallGb, upload_gb: smallUpload, median_size: 0.95 },
    'Medium Freeleech': { count: mediumCount, gb: mediumGb, upload_gb: mediumUpload, median_size: 4.8 },
    'Large Freeleech': { count: largeCount, gb: largeGb, upload_gb: largeUpload, median_size: 22.0 },
  },
  steady_state_avg_utilization: steadyAvgUtil,
  steady_state_avg_disk_gb: steadyAvgDisk,
  max_storage_gb: 4000,
  filters_used: ['Small Freeleech', 'Medium Freeleech', 'Large Freeleech'],
  blackout_days: 0,
  total_upload_gb: totalUploadGb,
  steady_state_daily_upload_gb: steadyDailyUpload,
  avg_ratio: Math.round((totalUploadGb / totalGrabbedGb) * 100) / 100,
  grabbed_torrents: GRABBED_TORRENTS,
  skipped_torrents: SKIPPED_TORRENTS,
};
