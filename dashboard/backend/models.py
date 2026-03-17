from __future__ import annotations
from typing import Optional, Dict, List
from pydantic import BaseModel


class FilterData(BaseModel):
    enabled: bool = True
    min_size: str = "1GB"
    max_size: str = "30GB"
    delay: int = 5
    priority: int = 1
    max_downloads: int = 5
    max_downloads_unit: str = "HOUR"
    except_releases: str = ""
    announce_types: list[str] = ["NEW"]
    freeleech: bool = True
    resolutions: list[str] = []
    sources: list[str] = []
    match_categories: str = ""
    is_auto_updated: bool = False
    release_profile_duplicate: Optional[str] = None
    match_release_groups: str = ""
    except_release_groups: str = ""


class Filter(BaseModel):
    name: str
    version: str = "1.0"
    data: FilterData


class SimulationRequest(BaseModel):
    dataset_path: str
    filter_ids: list[str] = []
    filters_inline: Optional[list[Filter]] = None
    storage_tb: float = 4.0
    max_seed_days: int = 10
    avg_ratio: float = 0.0


class FilterStats(BaseModel):
    count: int
    gb: float
    upload_gb: float
    median_size: float


class DailyStat(BaseModel):
    day: int
    date: str
    grabbed: int
    grabbed_gb: float
    expired_gb: float
    disk_usage_gb: float
    utilization_pct: float
    upload_gb: float
    available_torrents: int
    skipped_no_match: int
    skipped_rate_limit: int
    skipped_storage: int


class SimulationResult(BaseModel):
    total_seen: int
    total_grabbed: int
    total_grabbed_gb: float
    grab_rate_pct: float
    total_days: int
    skip_reasons: dict[str, int]
    daily_stats: list[DailyStat]
    per_filter_stats: dict[str, FilterStats]
    steady_state_avg_utilization: float
    steady_state_avg_disk_gb: float
    max_storage_gb: float
    filters_used: list[str]
    blackout_days: int
    total_upload_gb: float
    steady_state_daily_upload_gb: float
    avg_ratio: float


class AppConfig(BaseModel):
    storage_tb: float
    max_seed_days: int
    min_torrent_age_days: int
    burst_factor: int
    target_utilization_pct: float


class ScrapeRequest(BaseModel):
    category: str
    days: int = 30
    start_page: int = 1
    delay: float = 1.0
    tracker_id: Optional[str] = None


class ParseRequest(BaseModel):
    source: str


class AnalyzeRequest(BaseModel):
    source: str
    storage_tb: Optional[float] = None
    dataset_path: Optional[str] = None
    seed_days: Optional[int] = None
