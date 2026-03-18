import type { AttributeStats, RateLimit, FilterData, GeneratedFilter } from './types';

// ---------------------------------------------------------------------------
// Constants (1:1 from Python)
// ---------------------------------------------------------------------------

/** Tier index -> autobrr priority (higher = grabbed first) */
export const PRIORITY_MAP: Record<number, number> = { 0: 4, 1: 3, 2: 2, 3: 1 };

/** Tier index -> delay in seconds before grabbing */
export const DELAY_MAP: Record<number, number> = { 0: 5, 1: 30, 2: 60, 3: 65 };

/** Tier index -> [min_size, max_size] */
export const SIZE_MAP: Record<number, [string, string]> = {
  0: ['1GB', '30GB'],
  1: ['1GB', '30GB'],
  2: ['1GB', '30GB'],
  3: ['1GB', '15GB'],
};

/** Glob patterns to exclude from all filters */
export const EXCEPT_RELEASES = '*Olympics*,*Collection*,*Mega*,*Filmography*';

/** Map torrent categories to autobrr match_categories patterns */
export const AUTOBRR_CATEGORY_MAP: Record<string, string> = {
  movies: 'Movies*',
  tv: 'TV*',
  games: 'Games*',
  education: 'Education*',
};

/** Resolutions excluded from generated filters (not useful for racing) */
export const EXCLUDED_RESOLUTIONS = new Set(['unknown', '480p', '576p']);

/** Sources excluded from generated filters */
export const EXCLUDED_SOURCES = new Set(['Other', 'DVDRip', 'HDTV']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return values from tierMap whose tier is in targetTiers.
 */
export function collectTierValues(
  tierMap: Record<string, string>,
  targetTiers: string[],
): string[] {
  return Object.entries(tierMap)
    .filter(([, tier]) => targetTiers.includes(tier))
    .map(([val]) => val);
}

// ---------------------------------------------------------------------------
// Filter generation
// ---------------------------------------------------------------------------

/**
 * Generate a single autobrr filter dict for a tier.
 *
 * tierIndex: 0=high, 1=medium, 2=low, 3=opportunistic
 *
 * Per-tier logic (1:1 from Python generate_filter):
 * - Resolutions: tier 2 (low) = all except "unknown"; tier 3 (opp) = ["720p","1080p"];
 *   tier 0 (high) = high+medium minus excluded; tier 1 (medium) = medium minus excluded
 * - Sources: similar per-tier logic
 * - Categories: high/medium -> movies+tv; low/opp -> movies+tv fallback
 * - Release groups: tier 0 -> allowlist; tiers 1-3 -> blocklist
 * - Rate limits from rateLimits dict
 */
export function generateFilter(
  tierName: string,
  tierIndex: number,
  tiers: Record<string, Record<string, string>>,
  rateLimits: Record<string, RateLimit>,
  sourceName: string,
  _analyses: Record<string, Record<string, AttributeStats>>,
): GeneratedFilter {
  const priority = PRIORITY_MAP[tierIndex];
  const delay = DELAY_MAP[tierIndex];
  const [minSize, maxSize] = SIZE_MAP[tierIndex];

  // --- Resolutions ---
  const resTiers = tiers['resolution'] ?? {};
  let resolutions: string[];
  if (tierIndex === 2) {
    // Low tier: all resolutions except truly unusable ones
    resolutions = Object.keys(resTiers).filter(r => r !== 'unknown');
  } else if (tierIndex === 3) {
    // Opportunistic: only small-file-friendly resolutions
    resolutions = ['720p', '1080p'];
  } else if (tierIndex === 0) {
    // High: high+medium minus excluded
    resolutions = collectTierValues(resTiers, ['high', 'medium']).filter(
      r => !EXCLUDED_RESOLUTIONS.has(r),
    );
  } else if (tierIndex === 1) {
    // Medium: medium minus excluded
    resolutions = collectTierValues(resTiers, ['medium']).filter(
      r => !EXCLUDED_RESOLUTIONS.has(r),
    );
  } else {
    resolutions = Object.keys(resTiers).filter(r => !EXCLUDED_RESOLUTIONS.has(r));
  }
  if (resolutions.length === 0) {
    resolutions = ['1080p', '2160p'];
  }

  // --- Sources ---
  const srcTiers = tiers['source'] ?? {};
  let sources: string[];
  if (tierIndex === 2) {
    // Low tier: all sources except truly unusable ones
    sources = Object.keys(srcTiers).filter(s => s !== 'Other');
  } else if (tierIndex === 3) {
    // Opportunistic: all non-excluded sources from high+medium tiers
    sources = collectTierValues(srcTiers, ['high', 'medium']).filter(
      s => !EXCLUDED_SOURCES.has(s),
    );
  } else if (tierIndex === 0) {
    // High: high+medium minus excluded
    sources = collectTierValues(srcTiers, ['high', 'medium']).filter(
      s => !EXCLUDED_SOURCES.has(s),
    );
  } else if (tierIndex === 1) {
    // Medium: medium minus excluded
    sources = collectTierValues(srcTiers, ['medium']).filter(
      s => !EXCLUDED_SOURCES.has(s),
    );
  } else {
    sources = Object.keys(srcTiers).filter(s => !EXCLUDED_SOURCES.has(s));
  }
  if (sources.length === 0) {
    sources = ['WEB-DL', 'WEBRip', 'BluRay', 'Remux'];
  }

  // --- Categories ---
  const catTiers = tiers['category'] ?? {};
  let catValues: string[];
  if (tierIndex <= 1) {
    // High and medium: movies + tv
    catValues = Object.keys(catTiers).filter(c => c === 'movies' || c === 'tv');
    if (catValues.length === 0) {
      catValues = collectTierValues(catTiers, ['high', 'medium']);
    }
  } else {
    // Low and opportunistic: movies + tv
    catValues = Object.keys(catTiers).filter(c => c === 'movies' || c === 'tv');
    if (catValues.length === 0) {
      catValues = Object.keys(catTiers);
    }
  }
  const categories: string[] = [];
  for (const c of catValues) {
    const pattern = AUTOBRR_CATEGORY_MAP[c];
    if (pattern && !categories.includes(pattern)) {
      categories.push(pattern);
    }
  }
  const matchCategories =
    categories.length > 0
      ? [...categories].sort().join(',')
      : 'Movies*,TV*';

  // --- Release groups ---
  const rgTiers = tiers['release_group'] ?? {};
  const highGroups = collectTierValues(rgTiers, ['high']).sort();
  const lowGroups = collectTierValues(rgTiers, ['low']).sort();

  // --- Rate limits ---
  const level = tierName.toLowerCase();
  const tierLimits = rateLimits[level] ?? { enabled: false, max_downloads_per_hour: 1 };
  const isEnabled = tierLimits.enabled;
  const maxDownloads = isEnabled ? tierLimits.max_downloads_per_hour : 1;

  // --- Build filter data ---
  const data: FilterData = {
    enabled: isEnabled,
    min_size: minSize,
    max_size: maxSize,
    delay,
    priority,
    max_downloads: maxDownloads,
    max_downloads_unit: 'HOUR',
    except_releases: EXCEPT_RELEASES,
    announce_types: ['NEW'],
    freeleech: sourceName === 'freeleech',
    resolutions: [...resolutions].sort(),
    sources: [...sources].sort(),
    match_categories: matchCategories,
    is_auto_updated: false,
    release_profile_duplicate: null,
    match_release_groups: '',
    except_release_groups: '',
  };

  // Allowlist for high tier, blocklist for medium/low/opportunistic
  if (tierIndex === 0) {
    data.match_release_groups = highGroups.join(',');
  } else {
    data.except_release_groups = lowGroups.join(',');
  }

  const filterName = `fl-${sourceName}-${tierName.toLowerCase()}-priority`;

  return {
    name: filterName,
    version: '1.0',
    data,
  };
}
