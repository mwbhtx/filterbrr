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

export interface Filter {
  name: string;
  version: string;
  data: FilterData;
  _id: string;
  _source: "generated" | "saved" | "temp";
}

export interface Dataset {
  name: string;
  filename: string;
  path: string;
  size_mb: number;
  category: string;
  tracker_type: string;
  scraped_at: string | null;
  torrent_count: number;
  min_date: string | null;
  max_date: string | null;
}

export interface SimulationRequest {
  dataset_path: string;
  filter_ids?: string[];
  filters_inline?: Array<{ name: string; version: string; data: FilterData }>;
  storage_tb: number;
  max_seed_days: number;
  avg_ratio: number;
}

export interface FilterStats {
  count: number;
  gb: number;
  upload_gb: number;
  median_size: number;
}

export interface DailyStat {
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
  skip_reasons: Record<string, number>;
  daily_stats: DailyStat[];
  per_filter_stats: Record<string, FilterStats>;
  steady_state_avg_utilization: number;
  steady_state_avg_disk_gb: number;
  max_storage_gb: number;
  filters_used: string[];
  blackout_days: number;
  total_upload_gb: number;
  steady_state_daily_upload_gb: number;
  avg_ratio: number;
  grabbed_torrents: GrabbedTorrent[];
  skipped_torrents: SkippedTorrent[];
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

export interface ScrapeRequest {
  category: string;
  days: number;
  start_page: number;
  delay: number;
  tracker_id?: string;
}

export interface ParseRequest {
  source: string;
}

export interface AnalyzeRequest {
  source: string;
  storage_tb?: number;
  dataset_path?: string;
  seed_days?: number;
}

export interface JobStatus {
  id: string;
  command: string;
  status: "running" | "completed" | "failed";
  output: string[];
  return_code: number | null;
}

export const SUPPORTED_TRACKERS = ["TorrentLeech"] as const;
export type TrackerType = typeof SUPPORTED_TRACKERS[number];

export interface Tracker {
  id: string;
  tracker_type: TrackerType;
  username: string;
  password: string;
}

export interface Seedbox {
  id: string;
  name: string;
  storage_tb: number;
}

export interface Settings {
  autobrr_url: string;
  autobrr_api_key: string;
  trackers: Tracker[];
  seedboxes: Seedbox[];
}

export type AutobrrSettings = Settings;

export interface AutobrrConnectionStatus {
  connected: boolean;
  filter_count?: number;
  error?: string;
}

export interface SyncFilterEntry {
  name: string;
  local_id: string | null;
  remote_id: number | null;
  source: "both" | "local_only" | "remote_only";
  last_synced: string | null;
  local_filter: Omit<Filter, "_id" | "_source"> | null;
  remote_filter: Omit<Filter, "_id" | "_source"> | null;
}

export interface ReleaseGroupRanking {
  name: string;
  score: number;
  score_per_gb: number;
  count: number;
  daily_gb: number;
  tier: string;
}

export interface AnalysisResults {
  source: string;
  generated_at: string;
  release_groups: ReleaseGroupRanking[];
}
