export interface NormalizedTorrent {
  torrent_id: number;
  name: string;
  date: string;               // "2026-03-19 18:49:16" (full timestamp)
  size_gb: number;
  seeders: number;
  category: string;            // e.g. "Movies/HD"
  resolution: string;          // e.g. "1080p", "2160p"
  source: string;              // e.g. "Blu-Ray", "WEB"
  release_group: string;       // e.g. "SPARKS"
}

export interface FilterData {
  enabled: boolean;
  priority: number;
  min_size: string;
  max_size: string;
  max_downloads: number;
  max_downloads_unit: string;   // "HOUR" | "DAY" | "WEEK"
  min_seeders?: number;
  resolutions?: string[];
  sources?: string[];
  match_categories?: string;
  match_release_groups?: string;
  except_release_groups?: string;
  except_releases?: string;
  delay?: number;
}

export interface FilterDef {
  name: string;
  data: FilterData;
}

export interface SimulationConfig {
  storageTb: number;
  avgSeedDays: number;
  avgRatio: number;
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

export interface FilterStats {
  count: number;
  gb: number;
  upload_gb: number;
  median_size: number;
}

export interface DailyStats {
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

export interface SimulationResult {
  total_seen: number;
  total_grabbed: number;
  total_grabbed_gb: number;
  grab_rate_pct: number;
  total_days: number;
  max_storage_gb: number;
  avg_ratio: number;
  total_upload_gb: number;
  steady_state_daily_upload_gb: number;
  steady_state_avg_utilization: number;
  steady_state_avg_disk_gb: number;
  blackout_days: number;
  skip_reasons: {
    no_match: number;
    rate_limited: number;
    storage_full: number;
  };
  per_filter_stats: Record<string, FilterStats>;
  filters_used: string[];
  daily_stats: DailyStats[];
  grabbed_torrents: GrabbedTorrent[];
  skipped_torrents: SkippedTorrent[];
}
