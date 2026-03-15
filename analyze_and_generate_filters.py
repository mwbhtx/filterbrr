#!/usr/bin/env python3
"""Analyze torrent CSV data to discover optimal attributes for ratio building."""

import argparse
import csv
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from statistics import median, mean, quantiles

# ---------------------------------------------------------------------------
# Configuration — defaults can be overridden via .env file
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent


def _load_env():
    """Load .env file into os.environ (simple key=value parser)."""
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            # Strip inline comments (but not inside quoted values)
            if "#" in value and not (value.startswith('"') or value.startswith("'")):
                value = value[:value.index("#")].strip()
            # Only set if not already in environment (env vars take precedence)
            if key not in os.environ:
                os.environ[key] = value


_load_env()

STORAGE_TB = float(os.environ.get("STORAGE_TB", "4"))
MIN_TORRENT_AGE_DAYS = int(os.environ.get("MIN_TORRENT_AGE_DAYS", "3"))
MAX_SEED_DAYS = int(os.environ.get("MAX_SEED_DAYS", "10"))
BURST_FACTOR = int(os.environ.get("BURST_FACTOR", "8"))
TARGET_UTILIZATION_PCT = float(os.environ.get("TARGET_UTILIZATION_PCT", "85"))
TIER_LABELS = ("high", "medium", "low", "opportunistic")

# Per-tier filter parameters (indexed 0=high, 1=medium, 2=low, 3=opportunistic)
PRIORITY_MAP = {0: 4, 1: 3, 2: 2, 3: 1}
DELAY_MAP = {0: 5, 1: 30, 2: 60, 3: 65}
SIZE_MAP = {0: ("1GB", "30GB"), 1: ("1GB", "30GB"), 2: ("1GB", "30GB"), 3: ("1GB", "15GB")}

EXCEPT_RELEASES = (
    "*Olympics*,*Collection*,*Mega*,*Filmography*"
)

SOURCES = {
    "freeleech": "torrents_data_freeleech.csv",
    "movies": "torrents_data_movies.csv",
    "tv": "torrents_data_tv.csv",
}

NOW = datetime(2026, 3, 15)  # current date per instructions

# ---------------------------------------------------------------------------
# Task 1: CSV loading
# ---------------------------------------------------------------------------

def load_csv(source_key: str) -> list[dict]:
    """Load and parse a torrent CSV, computing derived fields."""
    filename = SOURCES.get(source_key)
    if filename is None:
        print(f"Error: unknown source '{source_key}'. Choose from: {', '.join(SOURCES)}")
        sys.exit(1)

    path = BASE_DIR / filename
    if not path.exists():
        print(f"Error: file not found: {path}")
        sys.exit(1)

    torrents = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                t = {
                    "torrent_id": int(row["torrent_id"]),
                    "name": row["name"],
                    "category": row["category"].strip(),
                    "category_id": int(row["category_id"]),
                    "subcategory": row["subcategory"].strip(),
                    "resolution": row["resolution"].strip(),
                    "source": row["source"].strip(),
                    "codec": row["codec"].strip(),
                    "hdr": row["hdr"].strip(),
                    "release_group": row["release_group"].strip(),
                    "size_str": row["size_str"],
                    "size_gb": float(row["size_gb"]),
                    "snatched": int(row["snatched"]),
                    "seeders": int(row["seeders"]),
                    "leechers": int(row["leechers"]),
                    "comments": int(row["comments"]) if row["comments"] else 0,
                    "date": datetime.strptime(row["date"], "%Y-%m-%d %H:%M:%S"),
                    "tags": row.get("tags", ""),
                    "genres": row.get("genres", ""),
                    "rating": float(row["rating"]) if row.get("rating") else 0.0,
                    "imdb_id": row.get("imdb_id", ""),
                }
                t["age_days"] = (NOW - t["date"]).total_seconds() / 86400
                torrents.append(t)
            except (ValueError, KeyError) as e:
                # Skip malformed rows silently
                continue

    return torrents


# ---------------------------------------------------------------------------
# Scoring and attribute analysis
# ---------------------------------------------------------------------------

def score_torrents(torrents: list[dict]) -> list[dict]:
    """Add 'score' and 'score_per_gb' fields."""
    for t in torrents:
        t["score"] = t["snatched"] / (t["seeders"] + 1)
        t["score_per_gb"] = t["score"] / t["size_gb"] if t["size_gb"] > 0 else 0.0
    return torrents


def size_bucket(size_gb: float) -> str:
    if size_gb < 5:
        return "0-5GB"
    elif size_gb < 15:
        return "5-15GB"
    elif size_gb < 30:
        return "15-30GB"
    elif size_gb < 60:
        return "30-60GB"
    else:
        return "60GB+"


def analyze_attribute(
    torrents: list[dict],
    attr_fn,
    label: str,
    min_samples: int = 3,
) -> dict:
    """Group scores by attribute value, return stats sorted by median score/GB desc.

    Returns: {value: {"median": float, "mean": float, "median_spg": float,
                       "mean_spg": float, "count": int, "daily_count": float,
                       "daily_gb": float}, ...}
    """
    groups: dict[str, list[float]] = defaultdict(list)
    group_spg: dict[str, list[float]] = defaultdict(list)
    group_sizes: dict[str, list[float]] = defaultdict(list)
    for t in torrents:
        val = attr_fn(t)
        if val:  # skip empty/None values
            groups[str(val)].append(t["score"])
            group_spg[str(val)].append(t["score_per_gb"])
            group_sizes[str(val)].append(t["size_gb"])

    # Compute date range for daily estimates
    dates = [t["date"] for t in torrents]
    date_range_days = max(1, (max(dates) - min(dates)).total_seconds() / 86400) if dates else 1

    results = {}
    for val, scores in groups.items():
        if len(scores) >= min_samples:
            count = len(scores)
            daily_count = count / date_range_days
            med_size = median(group_sizes[val])
            results[val] = {
                "median": round(median(scores), 2),
                "mean": round(mean(scores), 2),
                "median_spg": round(median(group_spg[val]), 4),
                "mean_spg": round(mean(group_spg[val]), 4),
                "count": count,
                "daily_count": round(daily_count, 2),
                "daily_gb": round(daily_count * med_size, 1),
            }

    # Sort by median score/GB descending (storage efficiency is the primary metric)
    results = dict(sorted(results.items(), key=lambda x: x[1]["median_spg"], reverse=True))
    return results


def analyze_all_attributes(torrents: list[dict]) -> dict[str, dict]:
    """Run attribute analysis across all dimensions."""
    dimensions = {
        "category": lambda t: t["category"],
        "subcategory": lambda t: t["subcategory"],
        "resolution": lambda t: t["resolution"],
        "source": lambda t: t["source"],
        "codec": lambda t: t["codec"],
        "hdr": lambda t: t["hdr"],
        "size_bucket": lambda t: size_bucket(t["size_gb"]),
        "release_group": lambda t: t["release_group"],
        "resolution_x_source": lambda t: (
            f"{t['resolution']}_{t['source']}" if t["resolution"] and t["source"] else ""
        ),
    }

    results = {}
    for label, fn in dimensions.items():
        results[label] = analyze_attribute(torrents, fn, label)
    return results


def print_summary(all_results: dict[str, dict], top_n: int = 10) -> None:
    """Print top-N summary tables per dimension."""
    for label, data in all_results.items():
        print(f"\n{'='*60}")
        print(f"  {label.upper()} (top {min(top_n, len(data))} of {len(data)})")
        print(f"{'='*60}")
        print(f"  {'Value':<30} {'Score':>8} {'Sc/GB':>8} {'Count':>6} {'DailyVol':>10}")
        print(f"  {'-'*30} {'-'*8} {'-'*8} {'-'*6} {'-'*10}")
        for i, (val, stats) in enumerate(data.items()):
            if i >= top_n:
                break
            daily_gb = stats.get("daily_gb", 0)
            spg = stats.get("median_spg", 0)
            print(
                f"  {val:<30} {stats['median']:>8.2f} {spg:>8.4f} {stats['count']:>6} {daily_gb:>8.1f}GB"
            )


# ---------------------------------------------------------------------------
# Task 4: Tier assignment
# ---------------------------------------------------------------------------

def assign_release_group_tiers(group_results: dict, torrents: list[dict]) -> dict[str, str]:
    """Assign tiers to release groups with >= 10 torrents (proven performers).

    Uses a composite ranking: score rank + snatches rank + score/GB rank.
    This balances raw upload potential, total demand, and storage efficiency.
    """
    qualified = {k: v for k, v in group_results.items() if v["count"] >= 10}
    if not qualified:
        return {}

    if len(qualified) < 4:
        return {k: "medium" for k in qualified}

    # Compute per-group medians from raw torrent data
    group_snatches: dict[str, list[int]] = defaultdict(list)
    group_spg: dict[str, list[float]] = defaultdict(list)
    for t in torrents:
        g = t["release_group"]
        if g in qualified:
            group_snatches[g].append(t["snatched"])
            group_spg[g].append(t["score_per_gb"])

    # Rank by three signals
    by_score = sorted(qualified.keys(), key=lambda g: qualified[g]["median"], reverse=True)
    by_snatches = sorted(qualified.keys(), key=lambda g: median(group_snatches[g]) if group_snatches[g] else 0, reverse=True)
    by_spg = sorted(qualified.keys(), key=lambda g: median(group_spg[g]) if group_spg[g] else 0, reverse=True)

    score_rank = {g: i for i, g in enumerate(by_score)}
    snatch_rank = {g: i for i, g in enumerate(by_snatches)}
    spg_rank = {g: i for i, g in enumerate(by_spg)}

    # Composite rank (lower = better): average of all three ranks
    composite = {g: (score_rank[g] + snatch_rank[g] + spg_rank[g]) / 3 for g in qualified}
    ranked = sorted(composite.keys(), key=lambda g: composite[g])

    n = len(ranked)
    p25_idx = n // 4
    p75_idx = n * 3 // 4

    tiers = {}
    for i, g in enumerate(ranked):
        if i < p25_idx:
            tiers[g] = "high"
        elif i < p75_idx:
            tiers[g] = "medium"
        else:
            tiers[g] = "low"
    return tiers


def assign_tiers(analyses: dict[str, dict], torrents: list[dict]) -> dict[str, dict[str, str]]:
    """Assign high/medium/low tiers per dimension based on score/GB percentiles."""
    tier_map: dict[str, dict[str, str]] = {}

    for dimension, results in analyses.items():
        if not results:
            tier_map[dimension] = {}
            continue

        spg_values = [v["median_spg"] for v in results.values()]
        if len(spg_values) < 4:
            tier_map[dimension] = {k: "medium" for k in results}
            continue

        q = quantiles(spg_values, n=4)
        p25, p75 = q[0], q[2]

        tiers = {}
        for val, stats in results.items():
            if stats["median_spg"] >= p75:
                tiers[val] = "high"
            elif stats["median_spg"] >= p25:
                tiers[val] = "medium"
            else:
                tiers[val] = "low"
        tier_map[dimension] = tiers

    # Override release_group tiers with qualified-only logic
    if "release_group" in analyses:
        tier_map["release_group"] = assign_release_group_tiers(analyses["release_group"], torrents)

    return tier_map


def print_tiers(tier_map: dict[str, dict[str, str]], dimensions: list[str]) -> None:
    """Print tier assignments for the given dimensions."""
    for dim in dimensions:
        tiers = tier_map.get(dim, {})
        if not tiers:
            continue
        print(f"\n{'='*60}")
        print(f"  TIERS: {dim.upper()}")
        print(f"{'='*60}")
        by_tier: dict[str, list[str]] = {"high": [], "medium": [], "low": []}
        for val, tier in tiers.items():
            by_tier[tier].append(val)
        for level in ("high", "medium", "low"):
            vals = sorted(by_tier[level])
            print(f"  {level.upper():>8}: {', '.join(vals) if vals else '(none)'}")


# ---------------------------------------------------------------------------
# Task 5: Storage budget and rate limit calculation
# ---------------------------------------------------------------------------

def classify_torrent_tier(torrent: dict, tiers: dict[str, dict[str, str]]) -> str:
    """Classify a single torrent into a tier based on attribute matches."""
    scores = {"high": 0, "medium": 0, "low": 0}

    # Standard dimensions (weight 1 each)
    checks = {
        "category": torrent["category"],
        "resolution": torrent["resolution"],
        "source": torrent["source"],
        "size_bucket": size_bucket(torrent["size_gb"]),
    }
    for dim, val in checks.items():
        tier = tiers.get(dim, {}).get(val)
        if tier:
            scores[tier] += 1

    # Release group (weight 2)
    rg_tier = tiers.get("release_group", {}).get(torrent["release_group"])
    if rg_tier:
        scores[rg_tier] += 2

    # Resolve: highest score wins, default medium on tie
    max_score = max(scores.values())
    if max_score == 0:
        return "medium"
    # Check in priority order: high > medium > low
    for level in ("high", "medium", "low"):
        if scores[level] == max_score:
            return level
    return "medium"


def calculate_daily_volume(
    torrents: list[dict], tiers: dict[str, dict[str, str]]
) -> tuple[dict, dict]:
    """Classify torrents and compute per-tier daily volume stats.

    Returns (daily_volume, median_sizes) where daily_volume maps tier to
    {count, torrents_per_day, daily_gb} and median_sizes maps tier to median GB.

    Includes an "opportunistic" tier: small efficient torrents (<=15GB, 1080p/720p)
    not already in the high tier, to fill remaining storage budget.
    """
    tier_torrents: dict[str, list[dict]] = {"high": [], "medium": [], "low": []}
    torrent_tiers: dict[int, str] = {}  # track classification per torrent
    for t in torrents:
        tier = classify_torrent_tier(t, tiers)
        tier_torrents[tier].append(t)
        torrent_tiers[t["torrent_id"]] = tier

    # Opportunistic pool: small efficient torrents not already high-tier
    rg_tiers = tiers.get("release_group", {})
    opp_torrents = []
    for t in torrents:
        if (t["size_gb"] <= 15
                and t["resolution"] in ("1080p", "720p")
                and rg_tiers.get(t["release_group"]) != "low"
                and torrent_tiers.get(t["torrent_id"]) != "high"):
            opp_torrents.append(t)
    tier_torrents["opportunistic"] = opp_torrents

    # Date range
    dates = [t["date"] for t in torrents]
    if not dates:
        return {}, {}
    date_range_days = max(1, (max(dates) - min(dates)).total_seconds() / 86400)

    daily_volume = {}
    median_sizes = {}
    for level in ("high", "medium", "low", "opportunistic"):
        group = tier_torrents[level]
        count = len(group)
        if count == 0:
            daily_volume[level] = {"count": 0, "torrents_per_day": 0, "daily_gb": 0.0}
            median_sizes[level] = 0.0
            continue
        sizes = [t["size_gb"] for t in group]
        med_size = median(sizes)
        tpd = count / date_range_days
        daily_volume[level] = {
            "count": count,
            "torrents_per_day": round(tpd, 1),
            "daily_gb": round(tpd * med_size, 1),
        }
        median_sizes[level] = round(med_size, 2)

    return daily_volume, median_sizes


def calculate_rate_limits(
    daily_volume: dict, median_sizes: dict, storage_tb: float
) -> dict:
    """Calculate per-tier rate limits fitting within storage budget.

    Fill-from-top: high and medium take their natural daily volume (uncapped),
    then low gets a rate limit precisely calibrated to fill the remaining budget.
    This ensures the low tier can't crowd out higher tiers — it's only allowed
    to consume what high and medium leave behind.
    """
    max_daily_gb = (storage_tb * 1024) / MAX_SEED_DAYS
    remaining_gb = max_daily_gb

    result = {"max_daily_gb": round(max_daily_gb, 1)}

    # High and medium: allocate their natural daily volume, uncapped
    for level in ("high", "medium"):
        vol = daily_volume.get(level, {"daily_gb": 0, "torrents_per_day": 0})
        needed = vol["daily_gb"]
        med_size = median_sizes.get(level, 0)

        if remaining_gb <= 0 or needed == 0 or med_size == 0:
            result[level] = {"enabled": False, "daily_gb": 0.0,
                             "torrents_per_day": 0, "max_downloads_per_hour": 0}
            continue

        allocated_gb = min(needed, remaining_gb)
        remaining_gb -= allocated_gb
        tpd = allocated_gb / med_size
        max_dph = max(1, round(tpd / 24 * BURST_FACTOR))
        result[level] = {"enabled": True, "daily_gb": round(allocated_gb, 1),
                         "torrents_per_day": round(tpd, 1),
                         "max_downloads_per_hour": max_dph}

    # Low tier: gets exactly the remaining budget — rate-limited to fill the gap
    for level in ("low",):
        med_size = median_sizes.get(level, 0)
        if med_size == 0:
            # Fallback: use average of other tier median sizes
            all_sizes = [s for s in median_sizes.values() if s > 0]
            med_size = sum(all_sizes) / len(all_sizes) if all_sizes else 10.0

        if remaining_gb > 0:
            tpd = remaining_gb / med_size
            # Use a lower burst factor for low tier to prevent bursty grabs
            # from consuming headroom meant for high/medium content
            low_burst = max(1, BURST_FACTOR // 2)
            max_dph = max(1, round(tpd / 24 * low_burst))
            result[level] = {"enabled": True, "daily_gb": round(remaining_gb, 1),
                             "torrents_per_day": round(tpd, 1),
                             "max_downloads_per_hour": max_dph}
            remaining_gb = 0
        else:
            result[level] = {"enabled": False, "daily_gb": 0.0,
                             "torrents_per_day": 0, "max_downloads_per_hour": 0}

    # Opportunistic: disabled (low tier fills the role)
    result["opportunistic"] = {"enabled": False, "daily_gb": 0.0,
                               "torrents_per_day": 0, "max_downloads_per_hour": 0}

    return result


def print_storage_budget(rate_limits: dict, median_sizes: dict) -> None:
    """Print storage budget summary."""
    print(f"\n{'='*60}")
    print(f"  STORAGE BUDGET SUMMARY")
    print(f"{'='*60}")
    print(f"  Max daily intake: {rate_limits['max_daily_gb']} GB/day "
          f"(seed {MAX_SEED_DAYS} days)")
    print()
    print(f"  {'Tier':<10} {'Enabled':<9} {'GB/day':>8} {'Torrents/d':>11} "
          f"{'Med Size':>9} {'DL/hour':>8}")
    print(f"  {'-'*10} {'-'*9} {'-'*8} {'-'*11} {'-'*9} {'-'*8}")
    for level in ("high", "medium", "low", "opportunistic"):
        info = rate_limits.get(level, {})
        enabled = "yes" if info.get("enabled") else "no"
        daily_gb = info.get("daily_gb", 0)
        tpd = info.get("torrents_per_day", 0)
        med = median_sizes.get(level, 0)
        dph = info.get("max_downloads_per_hour", 0)
        print(f"  {level:<14} {enabled:<9} {daily_gb:>8.1f} {tpd:>11.1f} "
              f"{med:>8.1f}G {dph:>8}")


# ---------------------------------------------------------------------------
# Task 6: Autobrr filter JSON generation
# ---------------------------------------------------------------------------

CATEGORY_MAP = {
    "movies": "Movies*",
    "tv": "TV*",
    "games": "Games*",
    "education": "Education*",
}

# Resolutions/sources to exclude from generated filters (not useful for racing)
EXCLUDED_RESOLUTIONS = {"unknown", "480p", "576p"}
EXCLUDED_SOURCES = {"Other", "DVDRip", "HDTV"}


def _collect_tier_values(tier_map: dict[str, str], target_tiers: list[str]) -> list[str]:
    """Return values from tier_map whose tier is in target_tiers."""
    return [val for val, tier in tier_map.items() if tier in target_tiers]


def generate_filter(
    tier_name: str,
    tier_index: int,
    tiers: dict[str, dict[str, str]],
    rate_limits: dict,
    source_name: str,
    analyses: dict[str, dict],
) -> dict:
    """Generate a single autobrr filter dict for a tier.

    tier_index: 0=high, 1=medium, 2=low, 3=opportunistic
    """
    priority = PRIORITY_MAP[tier_index]
    delay = DELAY_MAP[tier_index]
    min_size, max_size = SIZE_MAP[tier_index]

    # Resolutions (filter out unusable values like "unknown", "480p", "576p")
    res_tiers = tiers.get("resolution", {})
    if tier_index == 2:
        # Low tier: all resolutions except truly unusable ones
        resolutions = [r for r in res_tiers.keys() if r not in {"unknown"}]
    elif tier_index == 3:
        # Opportunistic: only small-file-friendly resolutions
        resolutions = ["720p", "1080p"]
    elif tier_index == 0:
        resolutions = [r for r in _collect_tier_values(res_tiers, ["high", "medium"])
                       if r not in EXCLUDED_RESOLUTIONS]
    elif tier_index == 1:
        resolutions = [r for r in _collect_tier_values(res_tiers, ["medium"])
                       if r not in EXCLUDED_RESOLUTIONS]
    else:
        resolutions = [r for r in res_tiers.keys() if r not in EXCLUDED_RESOLUTIONS]
    if not resolutions:
        resolutions = ["1080p", "2160p"]

    # Sources (filter out unusable values)
    src_tiers = tiers.get("source", {})
    if tier_index == 2:
        # Low tier: all sources except truly unusable ones
        sources = [s for s in src_tiers.keys() if s not in {"Other"}]
    elif tier_index == 3:
        # Opportunistic: all non-excluded sources from high+medium tiers
        sources = [s for s in _collect_tier_values(src_tiers, ["high", "medium"])
                   if s not in EXCLUDED_SOURCES]
    elif tier_index == 0:
        sources = [s for s in _collect_tier_values(src_tiers, ["high", "medium"])
                   if s not in EXCLUDED_SOURCES]
    elif tier_index == 1:
        sources = [s for s in _collect_tier_values(src_tiers, ["medium"])
                   if s not in EXCLUDED_SOURCES]
    else:
        sources = [s for s in src_tiers.keys() if s not in EXCLUDED_SOURCES]
    if not sources:
        sources = ["WEB-DL", "WEBRip", "BluRay", "Remux"]

    # Categories — all racing tiers focus on movies + tv (the bulk of freeleech volume)
    cat_tiers = tiers.get("category", {})
    if tier_index <= 1:
        # High and medium: movies + tv (high-tier groups release both)
        cat_values = [c for c in cat_tiers if c in ("movies", "tv")]
        if not cat_values:
            cat_values = _collect_tier_values(cat_tiers, ["high", "medium"])
    else:
        # Low and opportunistic: movies + tv
        cat_values = [c for c in cat_tiers if c in ("movies", "tv")]
        if not cat_values:
            cat_values = list(cat_tiers.keys())
    categories = []
    for c in cat_values:
        pattern = CATEGORY_MAP.get(c)
        if pattern and pattern not in categories:
            categories.append(pattern)
    if not categories:
        categories = ["Movies*", "TV*"]
    match_categories = ",".join(sorted(categories))

    # Release groups
    rg_tiers = tiers.get("release_group", {})
    high_groups = sorted(_collect_tier_values(rg_tiers, ["high"]))
    low_groups = sorted(_collect_tier_values(rg_tiers, ["low"]))

    # Rate limits
    level = tier_name.lower()
    tier_limits = rate_limits.get(level, {})
    is_enabled = tier_limits.get("enabled", False)
    max_downloads = tier_limits.get("max_downloads_per_hour", 1) if is_enabled else 1

    data = {
        "enabled": is_enabled,
        "min_size": min_size,
        "max_size": max_size,
        "delay": delay,
        "priority": priority,
        "max_downloads": max_downloads,
        "max_downloads_unit": "HOUR",
        "except_releases": EXCEPT_RELEASES,
        "announce_types": ["NEW"],
        "freeleech": source_name == "freeleech",
        "resolutions": sorted(resolutions),
        "sources": sorted(sources),
        "match_categories": match_categories,
        "is_auto_updated": False,
        "release_profile_duplicate": None,
    }

    # Allowlist for high tier, blocklist for medium and low
    if tier_index == 0:
        data["match_release_groups"] = ",".join(high_groups) if high_groups else ""
    else:
        data["except_release_groups"] = ",".join(low_groups) if low_groups else ""

    filter_name = f"fl-{source_name}-{tier_name.lower()}-priority"

    return {
        "name": filter_name,
        "version": "1.0",
        "data": data,
    }


def write_filters(
    tiers: dict[str, dict[str, str]],
    rate_limits: dict,
    source_name: str,
    analyses: dict[str, dict],
) -> list[str]:
    """Generate and write tier filter JSON files. Returns list of paths written."""
    output_dir = BASE_DIR / "autobrr-filters" / "generated" / source_name
    output_dir.mkdir(parents=True, exist_ok=True)

    # Clean old generated files
    for old_file in output_dir.glob("tier-*.json"):
        old_file.unlink()

    tier_specs = [
        ("High", 0, "tier-4-high.json"),
        ("Medium", 1, "tier-3-medium.json"),
        ("Low", 2, "tier-2-low.json"),
        ("Opportunistic", 3, "tier-1-opportunistic.json"),
    ]

    paths = []
    for tier_name, tier_index, filename in tier_specs:
        filt = generate_filter(tier_name, tier_index, tiers, rate_limits, source_name, analyses)
        path = output_dir / filename
        with open(path, "w", encoding="utf-8") as f:
            json.dump(filt, f, indent=4)
        print(f"  Wrote: {path}")
        paths.append(str(path))

    return paths


# ---------------------------------------------------------------------------
# Task 7: Markdown report generation
# ---------------------------------------------------------------------------

def generate_report(
    source_name: str,
    torrents: list[dict],
    analyses: dict[str, dict],
    tiers: dict[str, dict[str, str]],
    daily_volume: dict,
    median_sizes: dict,
    rate_limits: dict,
    storage_tb: float,
    sim_results=None,
) -> str:
    """Generate a markdown analysis report. Returns path to written file."""
    report_path = BASE_DIR / f"analysis_report_{source_name}.md"
    lines: list[str] = []

    def add(text: str = "") -> None:
        lines.append(text)

    # 1. Header
    add(f"# Torrent Performance Analysis: {source_name}")
    add()
    add(f"- **Generated:** {NOW.strftime('%Y-%m-%d')}")
    add(f"- **Dataset:** {len(torrents)} torrents from `{SOURCES[source_name]}`")
    add(f"- **Storage budget:** {storage_tb} TB")
    add()

    # 2. Methodology
    add("## Methodology")
    add()
    add("### Goal")
    add()
    add("Maximize monthly upload credits (ratio) on a private tracker by identifying which "
        "torrent attributes predict the best upload performance, then generating autobrr "
        "filters that automatically grab the highest-performing torrents within storage constraints.")
    add()
    add("### Assumptions")
    add()
    add("- **Seedbox constraint:** All torrents are deleted after reaching a 1:1 seed ratio "
        f"or after {MAX_SEED_DAYS} days, whichever comes first.")
    add(f"- **Storage constraint:** The seedbox has {storage_tb} TB of storage. At any given time, "
        f"at most {MAX_SEED_DAYS} days worth of grabbed torrents sit on disk.")
    add("- **Conservative model:** For rate limit calculations, we assume the worst case — "
        f"every torrent sits for the full {MAX_SEED_DAYS} days before deletion. In practice, "
        "many torrents hit 1:1 sooner, so actual capacity is higher than calculated.")
    add("- **Racing advantage:** Upload is earned primarily in the first hours after "
        "a torrent is uploaded to the tracker. Being an early seeder is critical. "
        "The real \"hot window\" for racing is likely under 24 hours, but we cannot measure "
        "this from a single data snapshot (see Data Maturity below).")
    add("- **Freeleech:** Downloaded data does not count against your ratio, so the only cost "
        "of grabbing a torrent is storage space and time.")
    add()
    add("### Data Maturity")
    add()
    add(f"Torrents younger than **{MIN_TORRENT_AGE_DAYS} days** are excluded from the analysis "
        "to ensure each torrent has had enough time to accumulate a representative snatch count.")
    add()
    add("**Important:** The `snatched` field in our data is a lifetime total — we see "
        "*how many* people downloaded a torrent, but not *when* they downloaded it. "
        "We cannot observe the accumulation curve (e.g., \"5000 snatches in hour 1, "
        "then 200 more over the next 30 days\"). For this reason, we recommend using "
        "data that is **at least 30 days old** so that every torrent has had time to "
        "reach its final snatch count. The relative rankings between attributes "
        "(which groups, resolutions, and sources produce the most-snatched torrents) "
        "are stable regardless of torrent age once past the first few days.")
    add()
    add("### Scoring Model")
    add()
    add("Each torrent is scored to estimate its upload potential relative to competition:")
    add()
    add("```")
    add("score = snatched / (seeders + 1)")
    add("```")
    add()
    add("Where:")
    add("- **snatched** = total number of users who have downloaded the torrent (lifetime demand signal)")
    add("- **seeders** = current number of seeders (competition signal — fewer seeders = bigger upload share)")
    add("- **+1** prevents division by zero and dampens the effect for low-seeder torrents")
    add()
    add("**Why this formula:** A torrent with 1000 snatches and 100 seeders (score = 9.9) is "
        "less valuable to seed than one with 500 snatches and 10 seeders (score = 45.5). "
        "The second torrent has fewer seeders competing for upload, so each seeder gets a "
        "larger share of the upload. This score approximates \"upload earned per seeder.\"")
    add()
    add("**Why not just use raw snatches?** Raw snatches measure total demand but ignore "
        "competition. A torrent with 20,000 snatches but 2,000 seeders gives you less upload "
        "per seeder than one with 5,000 snatches and 50 seeders. For release groups specifically, "
        "we use a composite of both signals (see Release Groups below).")
    add()
    add("**Limitation:** Both `snatched` and `seeders` are point-in-time snapshots. "
        "The snatched count is cumulative (always grows) while seeders fluctuate "
        "(seeders leave over time). This means older torrents may have slightly deflated "
        "seeder counts relative to their snatch counts. Since we compare torrents within "
        "attribute groups (not across ages), this bias affects all torrents in a group "
        "equally and doesn't distort the relative rankings.")
    add()
    add("### Storage Efficiency Metric (Score/GB)")
    add()
    add("Since storage is the binding constraint, the primary metric for tier assignment "
        "is upload potential per GB of disk consumed:")
    add()
    add("```")
    add("score_per_gb = score / size_gb")
    add("            = (snatched / (seeders + 1)) / size_gb")
    add("```")
    add()
    add("**Why this matters:** A torrent with score 20 at 10 GB (score/GB = 2.0) is twice as "
        "storage-efficient as one with score 20 at 20 GB (score/GB = 1.0). When storage is "
        "limited, grabbing two efficient small torrents beats one large torrent at the same "
        "raw score. This metric is what determines tier assignment — raw score is shown in "
        "tables for reference but does not drive tier thresholds.")
    add()
    add("**Effect on rankings:** This rehabilitates some attributes that score lower in raw "
        "terms but are highly efficient per GB stored:")
    add("- **TV** (smaller files) rises relative to Movies")
    add("- **WEB-DL** (competitive score/GB despite high seeder counts) rises from low to medium")
    add("- **Small size buckets** (0-5GB) rise despite lower raw scores")
    add("- Release groups that produce smaller files at decent scores are promoted")
    add()

    # 4. Attribute Rankings
    add("## Attribute Rankings")
    add()
    add("### How to read these tables")
    add()
    add("For each attribute (category, resolution, source, etc.), we group all torrents by "
        "that attribute's value and compute:")
    add()
    add("- **Median Score:** The middle raw score when all scores are sorted. Shown for "
        "reference — not used for tier assignment.")
    add("- **Score/GB:** Median storage efficiency (`score / size_gb`). **This is the "
        "primary ranking metric** — tables are sorted by this column and tiers are "
        "assigned based on its percentiles.")
    add("- **Count:** Number of torrents with this attribute value. Low counts (< 20) mean "
        "the ranking may not be reliable.")
    add("- **Est. Daily Vol:** Estimated daily volume in GB for this attribute value, "
        "calculated as `(count / date_range_days) * median_torrent_size_gb`. This surfaces "
        "which attributes are both high-performing AND high-volume — a high score with "
        "negligible daily volume won't fill your seedbox.")
    add("- **Tier:** Assigned based on Score/GB percentile thresholds (see Tier Assignment below).")
    add()
    report_dims = [
        "category", "subcategory", "resolution", "source", "codec", "hdr",
        "size_bucket", "resolution_x_source",
    ]
    for dim in report_dims:
        data = analyses.get(dim, {})
        if not data:
            continue
        dim_tiers = tiers.get(dim, {})
        add(f"### {dim.replace('_', ' ').title()}")
        add()
        add("| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |")
        add("|-------|-------------|---------|-------|---------------|------|")
        for val, stats in data.items():
            tier = dim_tiers.get(val, "-")
            daily_gb = stats.get("daily_gb", 0)
            spg = stats.get("median_spg", 0)
            add(f"| {val} | {stats['median']:.2f} | {spg:.4f} | {stats['count']} | {daily_gb:.1f} GB/d | {tier} |")
        add()

    # 5. Release Groups
    add("## Top Release Groups")
    add()
    add("Release groups are ranked by median Score/GB (storage efficiency). Only groups with "
        "3+ torrents are shown. The table shows the top 30 groups that have a tier assignment "
        "(10+ torrents), followed by untiered groups up to 30 total rows.")
    add()
    add("**Tier assignment for release groups** uses a composite ranking that combines three signals:")
    add()
    add("1. **Score rank:** Rank by median `snatched / (seeders + 1)` — how much upload "
        "each seeder gets")
    add("2. **Snatches rank:** Rank by median raw `snatched` count — total demand")
    add("3. **Score/GB rank:** Rank by median `score / size_gb` — storage efficiency")
    add()
    add("```")
    add("composite_rank = (score_rank + snatches_rank + score_per_gb_rank) / 3")
    add("```")
    add()
    add("This balances three signals: raw upload potential, total demand, and storage "
        "efficiency. Groups that release smaller files at decent scores (high score/GB) "
        "are promoted, while groups with large files at similar raw scores are demoted. "
        "Only groups with **10+ torrents** in the dataset are eligible for tier assignment "
        "(marked with `-` otherwise).")
    add()
    rg_data = analyses.get("release_group", {})
    rg_tiers = tiers.get("release_group", {})
    add("| Group | Median Score | Score/GB | Count | Est. Daily Vol | Tier |")
    add("|-------|-------------|---------|-------|---------------|------|")
    # Show tiered groups first (sorted by score/GB), then untiered up to 30 total
    tiered_groups = [(val, stats) for val, stats in rg_data.items() if val in rg_tiers]
    untiered_groups = [(val, stats) for val, stats in rg_data.items() if val not in rg_tiers]
    ordered_groups = tiered_groups + untiered_groups
    for i, (val, stats) in enumerate(ordered_groups):
        if i >= 30:
            break
        tier = rg_tiers.get(val, "-")
        daily_gb = stats.get("daily_gb", 0)
        spg = stats.get("median_spg", 0)
        add(f"| {val} | {stats['median']:.2f} | {spg:.4f} | {stats['count']} | {daily_gb:.1f} GB/d | {tier} |")
    add()

    # 6. Tier Assignment
    add("## Tier Assignment")
    add()
    add("### How tiers are assigned")
    add()
    add("For each attribute dimension (category, resolution, source, etc.), we take all "
        "median Score/GB values and compute percentile thresholds:")
    add()
    add("- **High tier:** Median Score/GB >= 75th percentile (top 25%)")
    add("- **Medium tier:** Median Score/GB >= 25th percentile (middle 50%)")
    add("- **Low tier:** Median Score/GB < 25th percentile (bottom 25%)")
    add()
    add("### How tiers map to filters")
    add()
    add("- **High tier filter** (priority 4, 5s delay): Uses an **allowlist** — only grabs "
        "torrents from high-tier release groups. Includes Movies + TV categories, high + medium "
        "tier resolutions and sources. Fastest grab speed.")
    add("- **Medium tier filter** (priority 3, 30s delay): Uses a **blocklist** — grabs "
        "from any group except low-tier ones. Includes medium tier resolutions/sources only.")
    add("- **Low tier filter** (priority 2, 60s delay): Uses a **blocklist** — same exclusions "
        "as medium. Includes all resolutions and sources. The theoretical budget model allocates "
        "all storage to high and medium, but in practice those tiers are supply-constrained and "
        "can't fill the disk. The low tier's rate limit (1/hr) and size cap are tuned via staged "
        "simulation to fill the gap without causing blackout days.")
    add("- **Opportunistic filter** (priority 1, 65s delay): Targets small efficient "
        "torrents (<=15GB, 1080p/720p) from non-low-tier groups. Currently disabled as the "
        "low tier fills its role.")
    add()
    add("**Note on size ranges:** All tiers cap at 30GB. This prevents large 30-60GB "
        "BluRay/Remux content from consuming disproportionate storage — each 60GB torrent "
        "displaces 3-7 high-tier torrents (median 8-9 GB). "
        f"In practice, the high tier's median torrent size is {median_sizes.get('high', 0):.1f} GB, "
        "so most high-tier matches are well under the cap.")
    add()
    add("### Torrent classification")
    add()
    add("Each torrent is classified into an overall tier by checking its attributes against "
        "the tier maps. Each matching attribute scores points:")
    add()
    add("- Category, resolution, source, size bucket: **1 point** each for their tier")
    add("- Release group: **2 points** (double weight — group is the strongest predictor)")
    add()
    add("The tier with the most points wins. On a tie, higher tier wins (high > medium > low).")
    add()

    # 7. Storage Budget
    add("## Storage Budget")
    add()
    add("### Model")
    add()
    add("The storage budget determines how many torrents can be grabbed per day without "
        "exceeding the seedbox capacity.")
    add()
    add("```")
    add(f"max_daily_intake = (storage_tb * 1024 GB) / max_seed_days")
    add(f"                 = ({storage_tb} * 1024) / {MAX_SEED_DAYS}")
    add(f"                 = {rate_limits.get('max_daily_gb', 0)} GB/day")
    add("```")
    add()
    add(f"This assumes the worst case: every torrent sits for the full {MAX_SEED_DAYS} days "
        "before being deleted. At any moment, the disk holds up to "
        f"{MAX_SEED_DAYS} days x {rate_limits.get('max_daily_gb', 0)} GB/day = "
        f"{storage_tb * 1024:.0f} GB = {storage_tb} TB.")
    add()
    add("### Staged simulation calibration")
    add()
    add("Rather than relying on theoretical daily volume estimates, we measure each tier's "
        "actual storage contribution by running the FIFO simulation in stages:")
    add()
    add("1. **High tier only** — simulate with just the high-tier filter to measure its real "
        "steady-state disk utilization")
    add("2. **High + Medium** — add the medium filter and measure combined utilization")
    add("3. **Remaining budget** — subtract the high+medium utilization from the target to "
        "determine how much the low tier needs to contribute")
    add("4. **Calibrate low tier** — sweep the low tier's autobrr-enforceable knobs "
        "(max\\_downloads/hour and max\\_size) to find the combination that brings total "
        "utilization closest to the target with zero blackout days")
    add()
    add("This empirical approach accounts for real-world effects that theoretical estimates miss: "
        "bursty torrent arrival patterns, rate limit interactions, FIFO ordering, and the "
        "10-day expiry cycle. The resulting rate limits are directly enforceable in autobrr — "
        "no simulation-only tricks like storage ceilings are needed.")
    add()
    add("### Rate limit calculation")
    add()
    add("**High and medium tiers** use a burst-factor formula to convert their daily GB "
        "allocation into an hourly download cap:")
    add()
    add("```")
    add("torrents_per_day  = allocated_gb / median_torrent_size_gb")
    add(f"downloads_per_hour = max(1, round(torrents_per_day / 24 * {BURST_FACTOR}))")
    add("```")
    add()
    add(f"The `* {BURST_FACTOR}` burst factor allows grabbing multiple torrents in a short window "
        "(e.g., when a batch of new freeleech torrents drops during peak evening hours) "
        "while still respecting the daily average.")
    add()
    add("**Low tier** rate limit and size cap are determined empirically by the staged "
        "simulation calibration. The budget model allocates 0 to low tier (high+medium "
        "theoretically consume everything), but those tiers are supply-constrained in practice. "
        "The calibration sweep finds the rate/size combination that fills the actual gap.")
    add()

    add("### Parameters")
    add()
    add("| Parameter | Value |")
    add("|-----------|-------|")
    add(f"| Storage capacity | {storage_tb} TB |")
    add(f"| Max seed days (hard delete) | {MAX_SEED_DAYS} days |")
    add(f"| Max daily intake | {rate_limits.get('max_daily_gb', 0)} GB/day |")
    add()

    add("### Per-Tier Budget Allocation")
    add()
    add("This table shows the **theoretical** budget allocation from the fill-from-top model. "
        "The low tier may show 0 allocation here because the model assigns all budget to "
        "high and medium based on their theoretical daily volume. In practice, the low tier's "
        "rate limit and size cap are determined by the staged simulation calibration (see below), "
        "and the actual per-tier throughput is shown in the simulation's Per-Filter Breakdown.")
    add()
    add("| Tier | Enabled | Budget GB/day | Median Size | DL/hour Rate Limit |")
    add("|------|---------|--------------|-------------|--------------------|")
    for level in ("high", "medium", "low", "opportunistic"):
        info = rate_limits.get(level, {})
        enabled = "yes" if info.get("enabled") else "no"
        daily_gb = info.get("daily_gb", 0)
        med = median_sizes.get(level, 0)
        dph = info.get("max_downloads_per_hour", 0)
        if level == "low" and sim_results:
            # Show calibrated values instead of theoretical
            low_sim = sim_results.get("per_filter_stats", {})
            low_key = [k for k in low_sim if "low" in k]
            if low_key:
                actual_med = low_sim[low_key[0]].get("median_size", med)
                med = actual_med
            enabled = "yes"
            dph = info.get("max_downloads_per_hour", 1)
            add(f"| {level} | {enabled} | *(calibrated)* | {med:.1f} GB | {dph} |")
        else:
            add(f"| {level} | {enabled} | {daily_gb:.1f} | {med:.1f} GB | {dph} |")
    add()

    # Check if 2160p is excluded from enabled filters and add a note
    res_tiers_check = tiers.get("resolution", {})
    res_2160_tier = res_tiers_check.get("2160p", "unknown")
    low_enabled = rate_limits.get("low", {}).get("enabled", False)
    if res_2160_tier == "low" and not low_enabled:
        res_2160_data = analyses.get("resolution", {}).get("2160p", {})
        add("### Note: 2160p content")
        add()
        add(f"2160p is classified as **low tier** by Score/GB ({res_2160_data.get('median_spg', 0):.4f}) "
            f"and produces {res_2160_data.get('daily_gb', 0):.0f} GB/day of volume with a median score "
            f"of {res_2160_data.get('median', 0):.2f}. Since the low-tier filter is disabled and "
            "high/medium filters do not include 2160p, **no 2160p content is currently being grabbed**. "
            "This is the correct outcome of the storage efficiency math — 2160p files are large and "
            "deliver less upload per GB than smaller resolutions. If you specifically want 2160p content, "
            "either increase storage capacity or manually enable the low-tier filter at the cost of "
            "reduced overall efficiency.")
        add()

    # 8. Generated Filters
    add("## Generated Filters")
    add()
    add("These filters are generated in `autobrr-filters/generated/{source}/` and can be "
        "imported directly into autobrr. Each filter corresponds to a tier.")
    add()
    add("### Excluded from all filters")
    add()
    add("The following release name patterns are excluded across all tiers "
        "(collections, packs, and other non-individual releases that consume "
        "disproportionate storage for their upload return):")
    add()
    add(f"```")
    add(f"{EXCEPT_RELEASES}")
    add(f"```")
    add()
    add("### Resolution and source restrictions")
    add()
    add("The **high and medium** tier filters exclude certain resolutions and sources "
        "to focus on the best racing opportunities:")
    add()
    add("Resolutions excluded from high/medium: "
        f"{', '.join(sorted(EXCLUDED_RESOLUTIONS))}")
    add()
    add("**Note:** 480p ranks medium by Score/GB but is excluded from high/medium because "
        "autobrr resolution matching is unreliable for SD content and the daily volume is "
        "negligible. Similarly, 576p and unknown resolutions cannot be reliably matched.")
    add()
    add("Sources excluded from high/medium: "
        f"{', '.join(sorted(EXCLUDED_SOURCES))}")
    add()
    add("**Note:** DVDRip and HDTV rank high by Score/GB but are excluded from high/medium "
        "because their daily volume is very low and they are not competitive for racing. "
        "\"Other\" source is excluded because it cannot be reliably matched in autobrr filters.")
    add()
    add("The **low tier** includes all resolutions (except `unknown`) and all "
        "sources (except `Other`), but uses the same blocklist as medium to exclude "
        "low-performing release groups. Its rate limit and size cap are tuned via staged "
        "simulation to fill the storage gap that high and medium tiers leave due to "
        "supply constraints.")
    add()
    tier_specs = [
        ("high", 0),
        ("medium", 1),
        ("low", 2),
        ("opportunistic", 3),
    ]
    rg_tiers_map = tiers.get("release_group", {})
    high_groups = sorted(_collect_tier_values(rg_tiers_map, ["high"]))
    low_groups = sorted(_collect_tier_values(rg_tiers_map, ["low"]))

    res_tiers = tiers.get("resolution", {})
    src_tiers = tiers.get("source", {})

    for level, idx in tier_specs:
        info = rate_limits.get(level, {})
        is_enabled = info.get("enabled", False)
        dph = info.get("max_downloads_per_hour", 0)
        daily_gb = info.get("daily_gb", 0)
        tpd = info.get("torrents_per_day", 0)

        if idx == 2:
            # Low tier: mirrors filter generation logic
            resolutions = [r for r in res_tiers.keys() if r not in {"unknown"}]
            sources = [s for s in src_tiers.keys() if s not in {"Other"}]
        elif idx == 3:
            resolutions = ["720p", "1080p"]
            sources = [s for s in _collect_tier_values(src_tiers, ["high", "medium"])
                       if s not in EXCLUDED_SOURCES]
        elif idx == 0:
            resolutions = [r for r in _collect_tier_values(res_tiers, ["high", "medium"])
                           if r not in EXCLUDED_RESOLUTIONS]
            sources = [s for s in _collect_tier_values(src_tiers, ["high", "medium"])
                       if s not in EXCLUDED_SOURCES]
        elif idx == 1:
            resolutions = [r for r in _collect_tier_values(res_tiers, ["medium"])
                           if r not in EXCLUDED_RESOLUTIONS]
            sources = [s for s in _collect_tier_values(src_tiers, ["medium"])
                       if s not in EXCLUDED_SOURCES]
        else:
            resolutions = [r for r in res_tiers.keys() if r not in EXCLUDED_RESOLUTIONS]
            sources = [s for s in src_tiers.keys() if s not in EXCLUDED_SOURCES]

        if not resolutions:
            resolutions = ["1080p", "2160p"]
        if not sources:
            sources = ["WEB-DL", "WEBRip", "BluRay", "Remux"]

        priority = PRIORITY_MAP[idx]
        delay_val = DELAY_MAP[idx]
        size_range = SIZE_MAP[idx]

        add(f"### Tier: {level.upper()} (priority {priority})")
        add()
        if not is_enabled:
            add("**Status: DISABLED** — storage budget is fully consumed by higher tiers. "
                "Enable this filter if high-tier volume drops or you increase storage.")
            add()
        else:
            if idx == 2 and sim_results:
                # Show actual simulation throughput for low tier, not theoretical allocation
                low_sim = sim_results.get("per_filter_stats", {})
                low_key = [k for k in low_sim if "low" in k]
                if low_key:
                    actual_gb_day = low_sim[low_key[0]].get("gb", 0) / max(1, sim_results.get("total_days", 1))
                    actual_count = low_sim[low_key[0]].get("count", 0)
                    actual_tpd = actual_count / max(1, sim_results.get("total_days", 1))
                    add(f"**Status: ENABLED** — ~{actual_gb_day:.1f} GB/day, ~{actual_tpd:.1f} torrents/day "
                        "(measured from simulation)")
                else:
                    add(f"**Status: ENABLED** — {daily_gb:.1f} GB/day, ~{tpd:.1f} torrents/day")
            else:
                add(f"**Status: ENABLED** — {daily_gb:.1f} GB/day, ~{tpd:.1f} torrents/day")
            add()
        if idx == 2:
            add("**Purpose:** Fill the storage gap that high and medium tiers leave due to supply "
                "constraints. Accepts all resolutions (including 2160p), all sources (including BluRay "
                f"and Remux), and files up to {size_range[1]}. Uses the same release group "
                "blocklist as medium tier. Rate limit (1/hr) and size cap are tuned via staged "
                "simulation — not derived from the budget model, which allocates 0 to this tier.")
            add()
        if idx == 3:
            add("**Purpose:** Fill remaining storage budget with small, efficient torrents "
                "that deliver high upload per GB. Targets 720p/1080p content <=15GB from any "
                "non-low-tier group.")
            add()
        add(f"| Setting | Value |")
        add(f"|---------|-------|")
        add(f"| Priority | {priority} |")
        add(f"| Delay | {delay_val}s |")
        add(f"| Size range | {size_range[0]} - {size_range[1]} |")
        add(f"| Rate limit | {dph} downloads/hour |")
        add(f"| Resolutions | {', '.join(sorted(resolutions))} |")
        add(f"| Sources | {', '.join(sorted(sources))} |")
        if idx == 0:
            add(f"| Strategy | **Allowlist** — only grab from these groups |")
            add(f"| Groups | {', '.join(high_groups) if high_groups else '(none)'} |")
        else:
            add(f"| Strategy | **Blocklist** — grab from anyone except these groups |")
            add(f"| Groups excluded | {', '.join(low_groups) if low_groups else '(none)'} |")
        add()

    # 9. Filter Simulation
    if sim_results:
        sim = sim_results
        add("## Filter Simulation")
        add()
        add("### Overview")
        add()
        add(f"To validate the generated filters, we replay all {sim['total_seen']} torrents "
            "from the dataset chronologically, simulating what autobrr would do if these "
            "filters had been active during the data collection period. The simulation "
            "tests the filters against the **full dataset** (including foreign-language "
            "and collection torrents) to verify that exclusion patterns correctly reject them.")
        add()
        add("### How the simulation works")
        add()
        add("**1. Setup**")
        add()
        add("- All torrents are sorted chronologically by their upload timestamp.")
        add(f"- Only filters with `enabled: true` are loaded. Disabled filters (e.g., low "
            "and opportunistic tiers when budget is consumed by higher tiers) are skipped entirely.")
        add("- Enabled filters are sorted by priority descending (highest priority = first to match).")
        add(f"- A virtual disk starts empty with a {sim['max_storage_gb']:.0f} GB capacity "
            f"({storage_tb} TB).")
        add()
        add("**2. Day-by-day processing**")
        add()
        add("For each calendar day in the dataset:")
        add()
        add(f"1. **Expire old torrents:** At the start of each day, any torrent that has been "
            f"on disk for {MAX_SEED_DAYS} or more full days is deleted. The grab timestamp is "
            "truncated to midnight, so a torrent grabbed at any time on day 1 expires at the "
            f"start of day {MAX_SEED_DAYS + 1}. This models the tracker's minimum seed requirement "
            f"of {MAX_SEED_DAYS} days.")
        add("2. **Process torrents hour by hour:** Each day is split into 24 one-hour windows. "
            "Torrents are assigned to the hour they were uploaded.")
        add("3. **Within each hour**, torrents are processed in **FIFO order** (earliest upload "
            "first), matching real autobrr behavior where torrents are grabbed in announcement order.")
        add()
        add("**3. Per-torrent matching**")
        add()
        add("For each torrent in the hour, filters are tried in priority order (highest first). "
            "A torrent matches a filter if **all** of these pass:")
        add()
        add("- **Size:** torrent size is within the filter's `min_size`–`max_size` range")
        add("- **Resolution:** torrent resolution is in the filter's resolution list")
        add("- **Source:** torrent source is in the filter's source list")
        add("- **Category:** torrent category matches at least one `match_categories` pattern "
            "(e.g., `Movies*` matches `movies`)")
        add("- **Name exclusions:** torrent name does NOT match any `except_releases` glob pattern "
            "(e.g., `*Collection*`)")
        add("- **Release group allowlist** (high tier): torrent group must be in `match_release_groups`")
        add("- **Release group blocklist** (other tiers): torrent group must NOT be in `except_release_groups`")
        add()
        add("**4. Rate limit enforcement**")
        add()
        add("Each filter has a `max_downloads` per hour limit. If a torrent matches a filter but "
            "that filter has already grabbed `max_downloads` torrents in the current hour, the "
            "simulation tries the next lower-priority filter. If no filter can accept the torrent "
            "(all matched filters are at their hourly limit), it is counted as **rate limited**.")
        add()
        add("**5. Storage enforcement**")
        add()
        add("If a torrent matches a filter and passes the rate limit, the simulation checks whether "
            f"adding it would exceed the {sim['max_storage_gb']:.0f} GB disk capacity. If so, the "
            "torrent is counted as **storage full** and skipped. Otherwise, it is grabbed: added to "
            "the virtual disk, and the filter's hourly counter is incremented.")
        add()
        add("**Note on low-tier budget control:** The theoretical budget model allocates all "
            "storage to high and medium tiers, but in practice they are supply-constrained and "
            "achieve ~55% utilization. The low tier's rate limit (1/hr) and size cap are tuned "
            "via staged simulation to fill the remaining ~42% without causing blackout days. "
            "No artificial storage ceiling is used — the rate limit and size cap alone are "
            "sufficient and are directly enforceable in autobrr.")
        add()
        add("**6. Skip classification**")
        add()
        add("Every torrent that is not grabbed is classified into exactly one skip reason:")
        add()
        add("- **No match:** The torrent did not pass any enabled filter's criteria (wrong resolution, "
            "source, size, category, excluded by name pattern, or blocked release group).")
        add("- **Rate limited:** The torrent matched at least one filter, but all matching filters "
            "had already hit their hourly download limit.")
        add("- **Storage full:** The torrent matched a filter with available rate limit capacity, "
            "but adding it would exceed disk capacity.")
        add()
        add("**7. Steady-state metrics**")
        add()
        add(f"After the first {MAX_SEED_DAYS} days (the ramp-up period where the disk is filling "
            "from empty), the simulation reaches steady state — new torrents are being grabbed at "
            "roughly the same rate as old ones expire. The steady-state utilization percentage is "
            "the primary measure of whether the filters are well-calibrated to the storage budget.")
        add()

        add("### Summary")
        add()
        add("| Metric | Value |")
        add("|--------|-------|")
        add(f"| Simulation period | {sim['total_days']} days |")
        add(f"| Torrents seen | {sim['total_seen']} |")
        add(f"| Torrents grabbed | {sim['total_grabbed']} ({sim['grab_rate_pct']}%) |")
        add(f"| Total GB grabbed | {sim['total_grabbed_gb']:.1f} GB |")
        steady_state_days = [d for d in sim['daily_stats'] if d['day'] > MAX_SEED_DAYS]
        if steady_state_days:
            add(f"| Steady-state avg disk usage | {sim['steady_state_avg_disk_gb']:.1f} GB "
                f"({sim['steady_state_avg_utilization']:.1f}% of {sim['max_storage_gb']:.0f} GB) |")
            min_util = min(d['utilization_pct'] for d in steady_state_days)
            max_util = max(d['utilization_pct'] for d in steady_state_days)
            add(f"| Steady-state utilization range | {min_util:.1f}% – {max_util:.1f}% |")
            add(f"| Blackout days (0 grabs, post-ramp-up) | {sim['blackout_days']} |")
        add()

        # Verdict
        target_low = sim["max_storage_gb"] * (TARGET_UTILIZATION_PCT / 100)
        target_high = sim["max_storage_gb"]
        avg_gb = sim["steady_state_avg_disk_gb"]
        if steady_state_days:
            add("### Verdict")
            add()
            if avg_gb >= target_low:
                add(f"**PASS** — Steady-state disk usage averages {avg_gb:.0f} GB "
                    f"({sim['steady_state_avg_utilization']:.1f}%), which is within the "
                    f"target range of {target_low/1024:.1f}–{target_high/1024:.1f} TB. "
                    "The filters are grabbing enough content to keep the seedbox well-utilized.")
            else:
                shortfall = target_low - avg_gb
                add(f"**UNDERUTILIZED** — Steady-state disk usage averages {avg_gb:.0f} GB "
                    f"({sim['steady_state_avg_utilization']:.1f}%), which is {shortfall:.0f} GB "
                    f"below the {target_low/1024:.1f} TB target.")
                add()
                # Diagnose the bottleneck
                skips = sim["skip_reasons"]
                total_skipped = sum(skips.values())
                no_match = skips.get("no_match", 0)
                rate_limited = skips.get("rate_limited", 0)
                storage_full = skips.get("storage_full", 0)
                add("**Bottleneck analysis:**")
                add()
                if no_match > rate_limited and no_match > storage_full:
                    no_match_pct = no_match / sim["total_seen"] * 100
                    add(f"- **Primary bottleneck: filter criteria too narrow** — {no_match_pct:.0f}% "
                        "of torrents matched no enabled filter. The filters exclude most "
                        "of the available content before rate limits or storage can be a factor.")
                    add("- Consider: enabling the low or opportunistic tier, widening resolution/source "
                        "lists, increasing size caps, or adding more categories to the high-tier filter.")
                if rate_limited > 0:
                    rate_pct = rate_limited / sim["total_seen"] * 100
                    add(f"- **Rate limits rejected {rate_limited} torrents ({rate_pct:.1f}%)** that "
                        "would have matched a filter. Increasing `max_downloads` per hour would "
                        "capture more of these.")
                if storage_full > 0:
                    add(f"- **Storage was full for {storage_full} torrents** — the budget is "
                        "being hit. This is expected behavior, not a problem.")
            add()

        # Skip reasons
        skips = sim["skip_reasons"]
        total_skipped = sum(skips.values())
        if total_skipped > 0:
            add("### Skip Reasons")
            add()
            add("Torrents that were not grabbed and why:")
            add()
            add("| Reason | Count | % of Seen |")
            add("|--------|-------|-----------|")
            for reason, count in sorted(skips.items(), key=lambda x: x[1], reverse=True):
                label = reason.replace("_", " ").title()
                pct = count / sim["total_seen"] * 100
                add(f"| {label} | {count} | {pct:.1f}% |")
            add()

        # Per-filter breakdown
        add("### Per-Filter Breakdown")
        add()
        add("| Filter | Torrents | Total GB | Median Size | Avg GB/day |")
        add("|--------|----------|----------|-------------|------------|")
        for fname in sim["filters_used"]:
            fstats = sim["per_filter_stats"].get(fname, {})
            count = fstats.get("count", 0)
            gb = fstats.get("gb", 0)
            med = fstats.get("median_size", 0)
            avg_daily = gb / sim["total_days"] if sim["total_days"] > 0 else 0
            add(f"| {fname} | {count} | {gb:.1f} GB | {med:.1f} GB | {avg_daily:.1f} GB/d |")
        add()

        # Daily log table
        add("### Daily Log")
        add()
        add("| Day | Date | Available | Grabbed | GB In | GB Expired | Disk Usage | Util % |")
        add("|-----|------|-----------|---------|-------|------------|------------|--------|")
        for d in sim["daily_stats"]:
            add(f"| {d['day']} | {d['date']} | {d['available_torrents']} | {d['grabbed']} | "
                f"{d['grabbed_gb']:.1f} | {d['expired_gb']:.1f} | "
                f"{d['disk_usage_gb']:.1f} GB | {d['utilization_pct']:.1f}% |")
        add()

        # Detailed skip log for days with storage_full skips
        storage_skip_days = [d for d in sim["daily_stats"] if d.get("skipped_storage", 0) > 0]
        if storage_skip_days:
            add("### Storage Pressure Days")
            add()
            add("Days where torrents were skipped due to storage being full:")
            add()
            add("| Date | Skipped (Storage) | Skipped (Rate) | Disk Usage |")
            add("|------|-------------------|----------------|------------|")
            for d in storage_skip_days:
                add(f"| {d['date']} | {d['skipped_storage']} | {d['skipped_rate_limit']} | "
                    f"{d['disk_usage_gb']:.1f} GB |")
            add()

    # 10. Configuration Reference
    add("## Configuration Reference")
    add()
    add("These values can be set via environment variables, a `.env` file, or edited at the top of `analyze_and_generate_filters.py`:")
    add()
    add("| Variable | Current Value | Description |")
    add("|----------|--------------|-------------|")
    add(f"| `STORAGE_TB` | {STORAGE_TB} | Seedbox storage capacity in TB. Changing this scales all rate limits. |")
    add(f"| `MIN_TORRENT_AGE_DAYS` | {MIN_TORRENT_AGE_DAYS} | Exclude torrents younger than this from analysis (still accumulating snatches). |")
    add(f"| `MAX_SEED_DAYS` | {MAX_SEED_DAYS} | Hard delete after this many days. Used for storage budget calculation. |")
    add(f"| `BURST_FACTOR` | {BURST_FACTOR} | Multiplier for hourly rate limits. Higher = more burst capacity during peak hours. |")
    add(f"| `TARGET_UTILIZATION_PCT` | {TARGET_UTILIZATION_PCT} | Target disk utilization %. Simulation verdict uses this as the PASS threshold. |")
    add()
    add("To regenerate with different storage:")
    add()
    add("```bash")
    add("python3 analyze_and_generate_filters.py freeleech --storage 10")
    add("```")

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return str(report_path)


# ---------------------------------------------------------------------------
# Task 8: Filter simulation
# ---------------------------------------------------------------------------

def _parse_size_str(s: str) -> float:
    """Parse a size string like '30GB' to float GB."""
    s = s.strip().upper()
    if s.endswith("GB"):
        return float(s[:-2])
    if s.endswith("TB"):
        return float(s[:-2]) * 1024
    if s.endswith("MB"):
        return float(s[:-2]) / 1024
    return float(s)


def _match_category_pattern(category: str, pattern: str) -> bool:
    """Check if a category matches a pattern like 'Movies*' or 'TV*'."""
    if pattern.endswith("*"):
        return category.lower().startswith(pattern[:-1].lower())
    return category.lower() == pattern.lower()


def _match_except_releases(name: str, patterns: str) -> bool:
    """Return True if the torrent name matches any except_releases pattern (should be excluded)."""
    import fnmatch
    for pat in patterns.split(","):
        pat = pat.strip()
        if pat and fnmatch.fnmatch(name, pat):
            return True
    return False


def _torrent_matches_filter(torrent: dict, filt_data: dict) -> bool:
    """Check if a torrent matches a filter's criteria. Returns True if it should be grabbed."""
    # Size check
    size_gb = torrent["size_gb"]
    min_gb = _parse_size_str(filt_data.get("min_size", "0GB"))
    max_gb = _parse_size_str(filt_data.get("max_size", "999999GB"))
    if size_gb < min_gb or size_gb > max_gb:
        return False

    # Resolution check
    resolutions = filt_data.get("resolutions", [])
    if resolutions and torrent["resolution"] not in resolutions:
        return False

    # Source check
    sources = filt_data.get("sources", [])
    if sources and torrent["source"] not in sources:
        return False

    # Category check
    match_cats = filt_data.get("match_categories", "")
    if match_cats:
        cat_patterns = [p.strip() for p in match_cats.split(",")]
        if not any(_match_category_pattern(torrent["category"], p) for p in cat_patterns):
            return False

    # Except releases (name patterns to exclude)
    except_releases = filt_data.get("except_releases", "")
    if except_releases and _match_except_releases(torrent["name"], except_releases):
        return False

    # Release group: allowlist (match_release_groups) or blocklist (except_release_groups)
    match_groups = filt_data.get("match_release_groups", "")
    if match_groups:
        allowed = {g.strip() for g in match_groups.split(",") if g.strip()}
        if torrent["release_group"] not in allowed:
            return False

    except_groups = filt_data.get("except_release_groups", "")
    if except_groups:
        blocked = {g.strip() for g in except_groups.split(",") if g.strip()}
        if torrent["release_group"] in blocked:
            return False

    return True


def run_simulation(
    torrents: list[dict],
    filter_jsons: list[dict],
    storage_tb: float,
) -> dict:
    """Simulate autobrr filter behavior over the torrent dataset chronologically.

    Replays torrents hour-by-hour, applying filters with rate limits, priority
    ordering, and storage constraints. Torrents are deleted after MAX_SEED_DAYS.

    The low tier's rate limit is calibrated to fill only the remaining budget
    after high and medium take their natural volume. No artificial storage ceiling
    is needed — the rate limit itself prevents the low tier from crowding out
    higher-priority content.

    Returns a dict with simulation results for report generation.
    """
    max_storage_gb = storage_tb * 1024

    # Build filter list sorted by priority descending (highest priority evaluated first)
    filters = []
    for fj in filter_jsons:
        data = fj["data"]
        if not data.get("enabled", False):
            continue
        filters.append({
            "name": fj["name"],
            "priority": data["priority"],
            "delay": data.get("delay", 0),
            "max_downloads": data.get("max_downloads", 999),
            "data": data,
        })
    filters.sort(key=lambda f: f["priority"], reverse=True)

    # Sort torrents chronologically
    sorted_torrents = sorted(torrents, key=lambda t: t["date"])

    # Determine date range
    first_date = sorted_torrents[0]["date"]
    last_date = sorted_torrents[-1]["date"]
    total_days = max(1, (last_date - first_date).days + 1)

    # State tracking
    disk: list[dict] = []  # {"torrent": t, "grab_date": datetime, "size_gb": float, "filter": str}
    current_disk_gb = 0.0

    # Per-hour rate limit counters: {(day_idx, hour, filter_name): count}
    hourly_grabs: dict[tuple, int] = defaultdict(int)

    # Results tracking
    daily_stats: list[dict] = []  # one entry per day
    grabbed_torrents: list[dict] = []
    skip_reasons: dict[str, int] = defaultdict(int)  # "no_match", "rate_limited", "storage_full"
    per_filter_stats: dict[str, dict] = {f["name"]: {"count": 0, "gb": 0.0, "sizes": []} for f in filters}

    # Group torrents by day
    from datetime import timedelta
    base_date = first_date.replace(hour=0, minute=0, second=0)

    for day_offset in range(total_days):
        current_day = base_date + timedelta(days=day_offset)
        next_day = current_day + timedelta(days=1)

        # Expire torrents that have been seeded for MAX_SEED_DAYS full days.
        # Compare against grab date truncated to midnight so intra-day timing
        # doesn't cause an extra day of retention.
        expired_gb = 0.0
        new_disk = []
        for item in disk:
            grab_day = item["grab_date"].replace(hour=0, minute=0, second=0)
            age_days = (current_day - grab_day).days
            if age_days >= MAX_SEED_DAYS:
                expired_gb += item["size_gb"]
                current_disk_gb -= item["size_gb"]
            else:
                new_disk.append(item)
        disk = new_disk

        # Get torrents for this day
        day_torrents = [t for t in sorted_torrents if current_day <= t["date"] < next_day]

        # Process hour by hour
        day_grabbed = 0
        day_grabbed_gb = 0.0
        day_skipped_no_match = 0
        day_skipped_rate = 0
        day_skipped_storage = 0

        for hour in range(24):
            hour_start = current_day.replace(hour=hour)
            hour_end = current_day.replace(hour=hour) + timedelta(hours=1)
            hour_torrents = [t for t in day_torrents if hour_start <= t["date"] < hour_end]

            # Sort by date (FIFO) to match real autobrr announcement-order behavior
            hour_torrents.sort(key=lambda t: t["date"])

            for torrent in hour_torrents:
                matched_filter = None

                # Try filters in priority order
                for filt in filters:
                    if not _torrent_matches_filter(torrent, filt["data"]):
                        continue

                    # Check rate limit for this filter this hour
                    hour_key = (day_offset, hour, filt["name"])
                    if hourly_grabs[hour_key] >= filt["max_downloads"]:
                        continue

                    matched_filter = filt
                    break

                if matched_filter is None:
                    # Check if any filter would match ignoring rate limits
                    any_match = any(_torrent_matches_filter(torrent, f["data"]) for f in filters)
                    if any_match:
                        skip_reasons["rate_limited"] += 1
                        day_skipped_rate += 1
                    else:
                        skip_reasons["no_match"] += 1
                        day_skipped_no_match += 1
                    continue

                # Check storage
                if current_disk_gb + torrent["size_gb"] > max_storage_gb:
                    skip_reasons["storage_full"] += 1
                    day_skipped_storage += 1
                    continue

                # Grab the torrent
                hour_key = (day_offset, hour, matched_filter["name"])
                hourly_grabs[hour_key] += 1
                current_disk_gb += torrent["size_gb"]
                disk.append({
                    "torrent": torrent,
                    "grab_date": torrent["date"],
                    "size_gb": torrent["size_gb"],
                    "filter": matched_filter["name"],
                })
                grabbed_torrents.append({
                    "torrent_id": torrent["torrent_id"],
                    "name": torrent["name"],
                    "size_gb": torrent["size_gb"],
                    "score": torrent.get("score", 0),
                    "filter": matched_filter["name"],
                    "date": torrent["date"],
                })
                per_filter_stats[matched_filter["name"]]["count"] += 1
                per_filter_stats[matched_filter["name"]]["gb"] += torrent["size_gb"]
                per_filter_stats[matched_filter["name"]]["sizes"].append(torrent["size_gb"])
                day_grabbed += 1
                day_grabbed_gb += torrent["size_gb"]

        daily_stats.append({
            "day": day_offset + 1,
            "date": current_day.strftime("%Y-%m-%d"),
            "grabbed": day_grabbed,
            "grabbed_gb": round(day_grabbed_gb, 1),
            "expired_gb": round(expired_gb, 1),
            "disk_usage_gb": round(current_disk_gb, 1),
            "utilization_pct": round(current_disk_gb / max_storage_gb * 100, 1),
            "available_torrents": len(day_torrents),
            "skipped_no_match": day_skipped_no_match,
            "skipped_rate_limit": day_skipped_rate,
            "skipped_storage": day_skipped_storage,
        })

    # Compute steady-state stats (after day MAX_SEED_DAYS)
    steady_state_days = [d for d in daily_stats if d["day"] > MAX_SEED_DAYS]
    avg_utilization = (
        mean([d["utilization_pct"] for d in steady_state_days])
        if steady_state_days else 0.0
    )
    avg_disk_gb = (
        mean([d["disk_usage_gb"] for d in steady_state_days])
        if steady_state_days else 0.0
    )

    # Compute per-filter median sizes
    for fname, stats in per_filter_stats.items():
        stats["median_size"] = round(median(stats["sizes"]), 1) if stats["sizes"] else 0.0
        stats["gb"] = round(stats["gb"], 1)
        del stats["sizes"]

    # Count blackout days (post-ramp-up days with 0 grabs)
    blackout_days = [d for d in steady_state_days if d["grabbed"] == 0]

    return {
        "total_seen": len(sorted_torrents),
        "total_grabbed": len(grabbed_torrents),
        "total_grabbed_gb": round(sum(g["size_gb"] for g in grabbed_torrents), 1),
        "grab_rate_pct": round(len(grabbed_torrents) / len(sorted_torrents) * 100, 1) if sorted_torrents else 0,
        "total_days": total_days,
        "skip_reasons": dict(skip_reasons),
        "daily_stats": daily_stats,
        "per_filter_stats": per_filter_stats,
        "steady_state_avg_utilization": round(avg_utilization, 1),
        "steady_state_avg_disk_gb": round(avg_disk_gb, 1),
        "max_storage_gb": max_storage_gb,
        "filters_used": [f["name"] for f in filters],
        "blackout_days": len(blackout_days),
    }


def print_simulation_summary(sim: dict) -> None:
    """Print simulation summary to console."""
    print(f"\n{'='*60}")
    print("  FILTER SIMULATION RESULTS")
    print(f"{'='*60}")
    print(f"  Simulated {sim['total_days']} days of torrent data")
    print(f"  Torrents seen: {sim['total_seen']}, grabbed: {sim['total_grabbed']} "
          f"({sim['grab_rate_pct']}%)")
    print(f"  Total GB grabbed: {sim['total_grabbed_gb']:.1f}")
    print(f"  Steady-state disk usage: {sim['steady_state_avg_disk_gb']:.1f} GB "
          f"({sim['steady_state_avg_utilization']:.1f}% of {sim['max_storage_gb']:.0f} GB)")
    print(f"  Blackout days (post-ramp-up): {sim['blackout_days']}")
    print()
    skips = sim["skip_reasons"]
    print(f"  Skip reasons: no match={skips.get('no_match', 0)}, "
          f"rate limited={skips.get('rate_limited', 0)}, "
          f"storage full={skips.get('storage_full', 0)}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze torrent data for optimal ratio-building attributes."
    )
    parser.add_argument(
        "source",
        choices=list(SOURCES.keys()),
        help="Data source to analyze",
    )
    parser.add_argument(
        "--storage",
        type=float,
        default=STORAGE_TB,
        help=f"Available storage in TB (default: {STORAGE_TB})",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _run_sim_for_filters(filter_jsons: list[dict], mature: list[dict], storage_tb: float) -> dict:
    """Helper: run simulation with given filter JSONs. Returns sim results."""
    return run_simulation(mature, filter_jsons, storage_tb)


def _calibrate_low_tier(
    filter_jsons: list[dict],
    mature: list[dict],
    storage_tb: float,
    target_utilization_pct: float,
) -> tuple[dict, dict]:
    """Calibrate the low-tier filter to fill remaining budget after high+medium.

    Sweeps two autobrr-enforceable knobs:
      - max_downloads/hour (1-10)
      - max_size (15GB, 20GB, 25GB, 30GB)

    Returns (best_settings, best_sim_results) where best_settings is a dict
    with "rate" and "max_size" keys.
    """
    low_filter_idx = None
    for i, fj in enumerate(filter_jsons):
        if "low" in fj["name"]:
            low_filter_idx = i
            break

    if low_filter_idx is None:
        return {"rate": 0, "max_size": "30GB"}, run_simulation(mature, filter_jsons, storage_tb)

    best_settings = {"rate": 1, "max_size": "30GB"}
    best_sim = None
    best_diff = float("inf")

    size_caps = ["15GB", "20GB", "25GB", "30GB"]
    rates = range(1, 11)

    for max_size in size_caps:
        for rate in rates:
            test_jsons = []
            for i, fj in enumerate(filter_jsons):
                fj_copy = {"name": fj["name"], "version": fj["version"],
                           "data": dict(fj["data"])}
                if i == low_filter_idx:
                    fj_copy["data"]["max_downloads"] = rate
                    fj_copy["data"]["max_size"] = max_size
                    fj_copy["data"]["enabled"] = True
                test_jsons.append(fj_copy)

            sim = run_simulation(mature, test_jsons, storage_tb)
            util = sim["steady_state_avg_utilization"]
            blackouts = sim["blackout_days"]
            diff = abs(util - target_utilization_pct)

            # Penalize blackout days heavily — they mean high-tier content is being blocked
            if blackouts > 0:
                diff += blackouts * 5

            print(f"    size={max_size:>4s} rate={rate}/hr → "
                  f"util={util:.1f}% blackouts={blackouts}")

            if diff < best_diff:
                best_diff = diff
                best_settings = {"rate": rate, "max_size": max_size}
                best_sim = sim

            # If this rate already overshoots with blackouts, larger rates will be worse
            if blackouts > 0:
                break

    return best_settings, best_sim


def main() -> None:
    args = parse_args()

    # Load CSV
    torrents = load_csv(args.source)
    print(f"Loaded {len(torrents)} torrents from {SOURCES[args.source]}")
    print(f"Storage budget: {args.storage} TB")

    # Filter to mature torrents (exclude very recent with incomplete data)
    mature = [t for t in torrents if t["age_days"] >= MIN_TORRENT_AGE_DAYS]
    print(f"Mature torrents (>= {MIN_TORRENT_AGE_DAYS} days old): {len(mature)}")

    # Pre-filter: exclude torrents that would be blocked by except_releases patterns
    # so that rankings reflect only torrents the filters can actually grab.
    filterable = [t for t in mature if not _match_except_releases(t["name"], EXCEPT_RELEASES)]
    print(f"After excluding except_releases patterns: {len(filterable)} "
          f"({len(mature) - len(filterable)} excluded)")

    # Score and analyze
    filterable = score_torrents(filterable)
    all_results = analyze_all_attributes(filterable)
    print_summary(all_results)

    # Task 4: Tier assignment (based on filterable data only)
    tier_map = assign_tiers(all_results, filterable)
    print_tiers(tier_map, ["category", "subcategory", "resolution", "source", "size_bucket", "release_group"])

    # Task 5: Storage budget and rate limits (based on filterable data)
    daily_volume, median_sizes = calculate_daily_volume(filterable, tier_map)
    rate_limits = calculate_rate_limits(daily_volume, median_sizes, args.storage)
    print_storage_budget(rate_limits, median_sizes)

    # Task 6: Generate autobrr filter JSON files
    print(f"\n{'='*60}")
    print("  GENERATING AUTOBRR FILTERS")
    print(f"{'='*60}")
    filter_paths = write_filters(tier_map, rate_limits, args.source, all_results)

    # Score the full mature set for simulation
    mature = score_torrents(mature)

    # Load the generated filter JSON files
    filter_dir = BASE_DIR / "autobrr-filters" / "generated" / args.source
    filter_jsons = []
    for fpath in sorted(filter_dir.glob("tier-*.json")):
        with open(fpath, encoding="utf-8") as f:
            filter_jsons.append(json.load(f))

    # ---------------------------------------------------------------
    # Staged simulation: measure each tier's real contribution
    # ---------------------------------------------------------------
    print(f"\n{'='*60}")
    print("  STAGED SIMULATION: MEASURING PER-TIER CONTRIBUTION")
    print(f"{'='*60}")

    # Stage 1: High tier only
    high_only = [fj for fj in filter_jsons if "high" in fj["name"]]
    sim_high = _run_sim_for_filters(high_only, mature, args.storage)
    high_util = sim_high["steady_state_avg_utilization"]
    high_gb = sim_high["steady_state_avg_disk_gb"]
    print(f"\n  HIGH only: {high_util:.1f}% utilization "
          f"({high_gb:.0f} GB avg disk)")

    # Stage 2: High + Medium
    high_med = [fj for fj in filter_jsons if "high" in fj["name"] or "medium" in fj["name"]]
    sim_high_med = _run_sim_for_filters(high_med, mature, args.storage)
    hm_util = sim_high_med["steady_state_avg_utilization"]
    hm_gb = sim_high_med["steady_state_avg_disk_gb"]
    med_contribution_gb = hm_gb - high_gb
    print(f"  HIGH+MED:  {hm_util:.1f}% utilization "
          f"({hm_gb:.0f} GB avg disk, medium adds ~{med_contribution_gb:.0f} GB)")

    # Stage 3: Remaining budget for low tier
    max_storage_gb = args.storage * 1024
    remaining_pct = TARGET_UTILIZATION_PCT - hm_util
    remaining_gb = max_storage_gb * (remaining_pct / 100) if remaining_pct > 0 else 0
    print(f"\n  Target utilization: {TARGET_UTILIZATION_PCT:.0f}%")
    print(f"  High+Medium covers: {hm_util:.1f}%")
    print(f"  Remaining for low:  {remaining_pct:.1f}% (~{remaining_gb:.0f} GB)")

    # Stage 4: Calibrate low-tier settings to fill the remainder
    if remaining_pct > 0:
        print(f"\n  Calibrating low-tier filter (rate + size cap)...")
        best_settings, sim_results = _calibrate_low_tier(
            filter_jsons, mature, args.storage, TARGET_UTILIZATION_PCT,
        )
        print(f"\n  Best low-tier settings: rate={best_settings['rate']}/hr, "
              f"max_size={best_settings['max_size']} → "
              f"{sim_results['steady_state_avg_utilization']:.1f}% utilization, "
              f"{sim_results['blackout_days']} blackout days")

        # Update the low filter JSON with calibrated settings and enable it
        for fj in filter_jsons:
            if "low" in fj["name"]:
                fj["data"]["max_downloads"] = best_settings["rate"]
                fj["data"]["max_size"] = best_settings["max_size"]
                fj["data"]["enabled"] = True
                fpath = filter_dir / "tier-2-low.json"
                with open(fpath, "w", encoding="utf-8") as f:
                    json.dump(fj, f, indent=4)
                print(f"  Updated {fpath} with rate={best_settings['rate']}, "
                      f"max_size={best_settings['max_size']}, enabled=true")

        # Also update rate_limits dict for report
        rate_limits["low"]["enabled"] = True
        rate_limits["low"]["max_downloads_per_hour"] = best_settings["rate"]
    else:
        print(f"\n  High+Medium already exceeds target — low tier not needed")
        sim_results = sim_high_med
        # Disable low filter
        for fj in filter_jsons:
            if "low" in fj["name"]:
                fj["data"]["enabled"] = False
                fpath = filter_dir / "tier-2-low.json"
                with open(fpath, "w", encoding="utf-8") as f:
                    json.dump(fj, f, indent=4)
        rate_limits["low"]["enabled"] = False

    print_simulation_summary(sim_results)

    # Task 7: Generate markdown report (use filterable for analysis data)
    report = generate_report(
        source_name=args.source,
        torrents=filterable,
        analyses=all_results,
        tiers=tier_map,
        daily_volume=daily_volume,
        median_sizes=median_sizes,
        rate_limits=rate_limits,
        storage_tb=args.storage,
        sim_results=sim_results,
    )
    print(f"\nDone! Check {report} for full analysis.")


if __name__ == "__main__":
    main()
