/**
 * Autobrr filter schema — derived from autobrr source code.
 * https://github.com/autobrr/autobrr  (internal/domain/filter.go + SQLite schema)
 *
 * NOT NULL columns in the autobrr `filter` table:
 *   name        TEXT    NOT NULL
 *   priority    INTEGER NOT NULL DEFAULT 0
 *   resolutions TEXT[]  NOT NULL DEFAULT '{}'
 *   codecs      TEXT[]  NOT NULL DEFAULT '{}'
 *   sources     TEXT[]  NOT NULL DEFAULT '{}'
 *   containers  TEXT[]  NOT NULL DEFAULT '{}'
 *
 * Everything else is nullable / has a DB default.
 */

/** Shape autobrr's POST /api/filters expects (JSON keys match Go struct tags). */
export interface AutobrrFilter {
  // --- identity (set by autobrr on create) ---
  id?: number;

  // --- NOT NULL fields ---
  name: string;
  priority: number;
  resolutions: string[];
  codecs: string[];
  sources: string[];
  containers: string[];

  // --- core ---
  enabled?: boolean;
  delay?: number;
  min_size?: string;
  max_size?: string;
  max_downloads?: number;
  max_downloads_unit?: string; // HOUR | DAY | WEEK | MONTH | EVER

  // --- release matching ---
  match_releases?: string;
  except_releases?: string;
  use_regex?: boolean;
  match_release_groups?: string;
  except_release_groups?: string;

  // --- release tags ---
  match_release_tags?: string;
  except_release_tags?: string;
  use_regex_release_tags?: boolean;

  // --- description ---
  match_description?: string;
  except_description?: string;
  use_regex_description?: boolean;

  // --- tracker / source booleans ---
  scene?: boolean;
  freeleech?: boolean;
  freeleech_percent?: string;
  smart_episode?: boolean;

  // --- TV ---
  shows?: string;
  seasons?: string;
  episodes?: string;

  // --- array fields (nullable in DB, default '{}') ---
  match_hdr?: string[];
  except_hdr?: string[];
  match_other?: string[];
  except_other?: string[];
  announce_types?: string[];
  origins?: string[];
  except_origins?: string[];
  match_language?: string[];
  except_language?: string[];

  // --- date matching ---
  years?: string;
  months?: string;
  days?: string;

  // --- music ---
  artists?: string;
  albums?: string;
  match_release_types?: string[];
  except_release_types?: string;
  formats?: string[];
  quality?: string[];
  media?: string[];
  perfect_flac?: boolean;
  cue?: boolean;     // JSON "cue", DB "has_cue"
  log?: boolean;     // JSON "log", DB "has_log"
  log_score?: number;
  match_record_labels?: string;
  except_record_labels?: string;

  // --- categories / uploaders ---
  match_categories?: string;
  except_categories?: string;
  match_uploaders?: string;
  except_uploaders?: string;

  // --- tags ---
  tags?: string;
  except_tags?: string;
  tags_match_logic?: string;
  except_tags_match_logic?: string;

  // --- seeders / leechers ---
  min_seeders?: number;
  max_seeders?: number;
  min_leechers?: number;
  max_leechers?: number;

  // --- duplicate handling ---
  release_profile_duplicate_id?: number | null;

  // --- nested objects (managed via separate tables) ---
  actions?: unknown[];
  external?: unknown[];
  indexers?: unknown[];
}

/**
 * Build a valid autobrr filter payload from a local filter record.
 * Ensures all NOT NULL fields are present with correct defaults.
 */
export function toAutobrrPayload(
  name: string,
  data: Record<string, unknown>,
): AutobrrFilter {
  return {
    // NOT NULL fields — always present
    name,
    priority: (data.priority as number) ?? 0,
    resolutions: (data.resolutions as string[]) ?? [],
    codecs: (data.codecs as string[]) ?? [],
    sources: (data.sources as string[]) ?? [],
    containers: (data.containers as string[]) ?? [],

    // core
    enabled: (data.enabled as boolean) ?? false,
    delay: (data.delay as number) ?? 0,
    min_size: (data.min_size as string) ?? '',
    max_size: (data.max_size as string) ?? '',
    max_downloads: (data.max_downloads as number) ?? 0,
    max_downloads_unit: (data.max_downloads_unit as string) ?? undefined,

    // release matching
    match_releases: (data.match_releases as string) ?? undefined,
    except_releases: (data.except_releases as string) ?? undefined,
    use_regex: (data.use_regex as boolean) ?? undefined,
    match_release_groups: (data.match_release_groups as string) ?? undefined,
    except_release_groups: (data.except_release_groups as string) ?? undefined,

    // categories
    match_categories: (data.match_categories as string) ?? undefined,
    except_categories: (data.except_categories as string) ?? undefined,

    // tracker
    freeleech: (data.freeleech as boolean) ?? undefined,
    freeleech_percent: (data.freeleech_percent as string) ?? undefined,

    // TV
    shows: (data.shows as string) ?? undefined,
    seasons: (data.seasons as string) ?? undefined,
    episodes: (data.episodes as string) ?? undefined,

    // arrays
    announce_types: (data.announce_types as string[]) ?? undefined,
    match_hdr: (data.match_hdr as string[]) ?? undefined,
    except_hdr: (data.except_hdr as string[]) ?? undefined,
    match_other: (data.match_other as string[]) ?? undefined,
    except_other: (data.except_other as string[]) ?? undefined,
    origins: (data.origins as string[]) ?? undefined,
    except_origins: (data.except_origins as string[]) ?? undefined,
    match_language: (data.match_language as string[]) ?? undefined,
    except_language: (data.except_language as string[]) ?? undefined,

    // uploaders / tags
    match_uploaders: (data.match_uploaders as string) ?? undefined,
    except_uploaders: (data.except_uploaders as string) ?? undefined,
    tags: (data.tags as string) ?? undefined,
    except_tags: (data.except_tags as string) ?? undefined,
    tags_match_logic: (data.tags_match_logic as string) ?? undefined,
    except_tags_match_logic: (data.except_tags_match_logic as string) ?? undefined,

    // date
    years: (data.years as string) ?? undefined,
    months: (data.months as string) ?? undefined,
    days: (data.days as string) ?? undefined,

    // music
    artists: (data.artists as string) ?? undefined,
    albums: (data.albums as string) ?? undefined,
    match_release_types: (data.match_release_types as string[]) ?? undefined,
    except_release_types: (data.except_release_types as string) ?? undefined,
    formats: (data.formats as string[]) ?? undefined,
    quality: (data.quality as string[]) ?? undefined,
    media: (data.media as string[]) ?? undefined,
    perfect_flac: (data.perfect_flac as boolean) ?? undefined,
    cue: (data.has_cue as boolean) ?? (data.cue as boolean) ?? undefined,
    log: (data.has_log as boolean) ?? (data.log as boolean) ?? undefined,
    log_score: (data.log_score as number) ?? undefined,

    // seeders / leechers
    min_seeders: (data.min_seeders as number) ?? undefined,
    max_seeders: (data.max_seeders as number) ?? undefined,
    min_leechers: (data.min_leechers as number) ?? undefined,
    max_leechers: (data.max_leechers as number) ?? undefined,
  };
}
