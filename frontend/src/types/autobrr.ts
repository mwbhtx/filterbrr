/**
 * Maps an autobrr API filter response to our local FilterData shape.
 * Field names are identical where they overlap; this helper provides
 * safe defaults for anything missing.
 */
import type { FilterData } from './index';

export function filterDataFromAutobrr(
  remote: Record<string, unknown>,
  fallback: FilterData,
): FilterData {
  return {
    enabled: (remote.enabled as boolean) ?? fallback.enabled,
    min_size: (remote.min_size as string) ?? fallback.min_size,
    max_size: (remote.max_size as string) ?? fallback.max_size,
    delay: (remote.delay as number) ?? fallback.delay,
    priority: (remote.priority as number) ?? fallback.priority,
    max_downloads: (remote.max_downloads as number) ?? fallback.max_downloads,
    max_downloads_unit: (remote.max_downloads_unit as string) ?? fallback.max_downloads_unit,
    except_releases: (remote.except_releases as string) ?? fallback.except_releases,
    announce_types: (remote.announce_types as string[]) ?? fallback.announce_types,
    freeleech: (remote.freeleech as boolean) ?? fallback.freeleech,
    resolutions: (remote.resolutions as string[]) ?? fallback.resolutions,
    sources: (remote.sources as string[]) ?? fallback.sources,
    match_categories: (remote.match_categories as string) ?? fallback.match_categories,
    is_auto_updated: fallback.is_auto_updated, // local-only concept
    release_profile_duplicate: fallback.release_profile_duplicate, // mapped differently in autobrr
    match_release_groups: (remote.match_release_groups as string) ?? fallback.match_release_groups,
    except_release_groups: (remote.except_release_groups as string) ?? fallback.except_release_groups,
  };
}
