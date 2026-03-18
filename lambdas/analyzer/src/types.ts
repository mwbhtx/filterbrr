export interface NormalizedTorrent {
  torrent_id: number;
  name: string;
  filename: string;
  category: string;
  category_id: number;
  subcategory: string;
  resolution: string;
  source: string;
  codec: string;
  hdr: string;
  release_group: string;
  size_bytes: number;
  size_gb: number;
  size_str: string;
  snatched: number;
  seeders: number;
  leechers: number;
  comments: number;
  date: string;
  tags: string[];
  genres: string;
  rating: number;
  imdb_id: string;
}

export interface ScoredTorrent extends NormalizedTorrent {
  score: number;
  score_per_gb: number;
  age_days: number;
}

export interface AttributeStats {
  median: number;
  mean: number;
  median_spg: number;
  mean_spg: number;
  count: number;
  daily_count: number;
  daily_gb: number;
}

export interface DailyVolume {
  count: number;
  torrents_per_day: number;
  daily_gb: number;
}

export interface RateLimit {
  enabled: boolean;
  daily_gb: number;
  torrents_per_day: number;
  max_downloads_per_hour: number;
}

export interface FilterData {
  enabled: boolean;
  min_size: string;
  max_size: string;
  delay: number;
  priority: number;
  max_downloads: number;
  max_downloads_unit: string;
  except_releases: string;
  announce_types: string[];
  freeleech: boolean;
  resolutions: string[];
  sources: string[];
  match_categories: string;
  is_auto_updated: boolean;
  release_profile_duplicate: string | null;
  match_release_groups: string;
  except_release_groups: string;
}

export interface GeneratedFilter {
  name: string;
  version: string;
  data: FilterData;
}

export interface SimulationResult {
  total_seen: number;
  total_grabbed: number;
  total_grabbed_gb: number;
  grab_rate_pct: number;
  total_days: number;
  skip_reasons: Record<string, number>;
  daily_stats: DailyStats[];
  per_filter_stats: Record<string, { count: number; gb: number; median_size: number }>;
  steady_state_avg_utilization: number;
  steady_state_avg_disk_gb: number;
  max_storage_gb: number;
  filters_used: string[];
  blackout_days: number;
}

export interface DailyStats {
  day: number;
  date: string;
  grabbed: number;
  grabbed_gb: number;
  expired_gb: number;
  disk_usage_gb: number;
  utilization_pct: number;
  available_torrents: number;
  skipped_no_match: number;
  skipped_rate_limit: number;
  skipped_storage: number;
}

export interface AnalyzeEvent {
  jobId?: string;
  userId: string;
  datasetKey: string;
  storageTb: number;
  seedDays: number;
  source: string;
}
