import type { NormalizedTorrent, FilterData } from './types';
import { parseSizeStr } from './size';

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

  // 8. Min seeders check
  if (filtData.min_seeders !== undefined && filtData.min_seeders > 0) {
    if (torrent.seeders < filtData.min_seeders) return false;
  }

  return true;
}
