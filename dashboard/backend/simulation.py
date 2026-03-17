"""Simulation engine extracted from analyze_and_generate_filters.py."""
from __future__ import annotations

import csv
import fnmatch
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import median, mean
from typing import Optional


def load_csv(csv_path: str, now: datetime | None = None) -> list[dict]:
    """Load and parse a torrent CSV, computing derived fields."""
    if now is None:
        now = datetime.utcnow()

    from pathlib import Path

    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

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
                t["age_days"] = (now - t["date"]).total_seconds() / 86400
                torrents.append(t)
            except (ValueError, KeyError) as e:
                # Skip malformed rows silently
                continue

    return torrents


def score_torrents(torrents: list[dict]) -> list[dict]:
    """Add 'score' and 'score_per_gb' fields."""
    for t in torrents:
        t["score"] = t["snatched"] / (t["seeders"] + 1)
        t["score_per_gb"] = t["score"] / t["size_gb"] if t["size_gb"] > 0 else 0.0
    return torrents


def _parse_size_str(s: str, default: float = 0.0) -> float:
    """Parse a size string like '30GB' to float GB."""
    s = s.strip().upper()
    if not s:
        return default
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
    for pat in patterns.split(","):
        pat = pat.strip()
        if pat and fnmatch.fnmatch(name, pat):
            return True
    return False


def _torrent_matches_filter(torrent: dict, filt_data: dict) -> bool:
    """Check if a torrent matches a filter's criteria. Returns True if it should be grabbed."""
    # Size check
    size_gb = torrent["size_gb"]
    min_gb = _parse_size_str(filt_data.get("min_size", ""), default=0.0)
    max_gb = _parse_size_str(filt_data.get("max_size", ""), default=999999.0)
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


def _suggest_fix(torrent: dict, filters: list[dict]) -> str:
    """For a torrent that matched no filter, suggest the smallest change to match it."""
    # Try each filter and collect the first rejection reason per filter
    suggestions: list[str] = []
    for filt in filters:
        filt_data = filt["data"]
        reasons = []

        size_gb = torrent["size_gb"]
        min_gb = _parse_size_str(filt_data.get("min_size", ""), default=0.0)
        max_gb = _parse_size_str(filt_data.get("max_size", ""), default=999999.0)
        if size_gb < min_gb:
            reasons.append(f"min_size {min_gb:.0f}GB > {size_gb:.1f}GB")
        elif size_gb > max_gb:
            reasons.append(f"max_size {max_gb:.0f}GB < {size_gb:.1f}GB")

        resolutions = filt_data.get("resolutions", [])
        if resolutions and torrent["resolution"] not in resolutions:
            reasons.append(f"add resolution {torrent['resolution']}")

        sources = filt_data.get("sources", [])
        if sources and torrent["source"] not in sources:
            reasons.append(f"add source {torrent['source']}")

        match_cats = filt_data.get("match_categories", "")
        if match_cats:
            cat_patterns = [p.strip() for p in match_cats.split(",")]
            if not any(_match_category_pattern(torrent["category"], p) for p in cat_patterns):
                reasons.append(f"add category {torrent['category']}")

        except_releases = filt_data.get("except_releases", "")
        if except_releases and _match_except_releases(torrent["name"], except_releases):
            reasons.append("matched except_releases pattern")

        match_groups = filt_data.get("match_release_groups", "")
        if match_groups:
            allowed = {g.strip() for g in match_groups.split(",") if g.strip()}
            if torrent["release_group"] not in allowed:
                reasons.append(f"add group {torrent['release_group']}")

        except_groups = filt_data.get("except_release_groups", "")
        if except_groups:
            blocked = {g.strip() for g in except_groups.split(",") if g.strip()}
            if torrent["release_group"] in blocked:
                reasons.append(f"unblock group {torrent['release_group']}")

        if reasons:
            suggestions.append(f"{filt['name']}: {reasons[0]}")
        else:
            # Would match this filter — shouldn't happen for no_match, but guard
            suggestions.append(f"{filt['name']}: would match")

    # Return the suggestion with fewest changes (first reason only per filter)
    # Pick the filter with the simplest fix
    if not suggestions:
        return "No filters configured"
    return min(suggestions, key=len)


def run_simulation(
    torrents: list[dict],
    filter_jsons: list[dict],
    storage_tb: float,
    max_seed_days: int = 10,
    avg_ratio: float = 0.0,
) -> dict:
    """Simulate autobrr filter behavior over the torrent dataset chronologically.

    Replays torrents hour-by-hour, applying filters with rate limits, priority
    ordering, and storage constraints. Torrents are deleted after max_seed_days.

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
    skipped_torrents: list[dict] = []
    skip_reasons: dict[str, int] = defaultdict(int)  # "no_match", "rate_limited", "storage_full"
    per_filter_stats: dict[str, dict] = {f["name"]: {"count": 0, "gb": 0.0, "upload_gb": 0.0, "sizes": []} for f in filters}

    # Group torrents by day
    base_date = first_date.replace(hour=0, minute=0, second=0)

    for day_offset in range(total_days):
        current_day = base_date + timedelta(days=day_offset)
        next_day = current_day + timedelta(days=1)

        # Expire torrents that have been seeded for max_seed_days full days.
        # Compare against grab date truncated to midnight so intra-day timing
        # doesn't cause an extra day of retention.
        expired_gb = 0.0
        new_disk = []
        for item in disk:
            grab_day = item["grab_date"].replace(hour=0, minute=0, second=0)
            age_days = (current_day - grab_day).days
            if age_days >= max_seed_days:
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
                        reason = "Rate limited"
                        suggestion = ""
                        skip_reasons["rate_limited"] += 1
                        day_skipped_rate += 1
                    else:
                        reason = "No filter match"
                        suggestion = _suggest_fix(torrent, filters)
                        skip_reasons["no_match"] += 1
                        day_skipped_no_match += 1
                    skipped_torrents.append({
                        "name": torrent["name"],
                        "size_gb": torrent["size_gb"],
                        "date": torrent["date"].strftime("%Y-%m-%d %H:%M"),
                        "reason": reason,
                        "suggestion": suggestion,
                    })
                    continue

                # Check storage
                if current_disk_gb + torrent["size_gb"] > max_storage_gb:
                    skip_reasons["storage_full"] += 1
                    day_skipped_storage += 1
                    skipped_torrents.append({
                        "name": torrent["name"],
                        "size_gb": torrent["size_gb"],
                        "date": torrent["date"].strftime("%Y-%m-%d %H:%M"),
                        "reason": "Storage full",
                        "suggestion": "",
                    })
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
                    "name": torrent["name"],
                    "size_gb": torrent["size_gb"],
                    "filter": matched_filter["name"],
                    "date": torrent["date"].strftime("%Y-%m-%d %H:%M"),
                })
                upload_gb = torrent["size_gb"] * avg_ratio
                per_filter_stats[matched_filter["name"]]["count"] += 1
                per_filter_stats[matched_filter["name"]]["gb"] += torrent["size_gb"]
                per_filter_stats[matched_filter["name"]]["upload_gb"] += upload_gb
                per_filter_stats[matched_filter["name"]]["sizes"].append(torrent["size_gb"])
                day_grabbed += 1
                day_grabbed_gb += torrent["size_gb"]

        # Upload estimate: each grabbed torrent produces size_gb * avg_ratio total upload
        day_upload_gb = day_grabbed_gb * avg_ratio

        daily_stats.append({
            "day": day_offset + 1,
            "date": current_day.strftime("%Y-%m-%d"),
            "grabbed": day_grabbed,
            "grabbed_gb": round(day_grabbed_gb, 1),
            "expired_gb": round(expired_gb, 1),
            "disk_usage_gb": round(current_disk_gb, 1),
            "utilization_pct": round(current_disk_gb / max_storage_gb * 100, 1),
            "upload_gb": round(day_upload_gb, 2),
            "available_torrents": len(day_torrents),
            "skipped_no_match": day_skipped_no_match,
            "skipped_rate_limit": day_skipped_rate,
            "skipped_storage": day_skipped_storage,
        })

    # Compute steady-state stats (after day max_seed_days)
    steady_state_days = [d for d in daily_stats if d["day"] > max_seed_days]
    avg_utilization = (
        mean([d["utilization_pct"] for d in steady_state_days])
        if steady_state_days else 0.0
    )
    avg_disk_gb = (
        mean([d["disk_usage_gb"] for d in steady_state_days])
        if steady_state_days else 0.0
    )

    # Compute per-filter median sizes and round upload
    for fname, stats in per_filter_stats.items():
        stats["median_size"] = round(median(stats["sizes"]), 1) if stats["sizes"] else 0.0
        stats["gb"] = round(stats["gb"], 1)
        stats["upload_gb"] = round(stats["upload_gb"], 1)
        del stats["sizes"]

    # Count blackout days (post-ramp-up days with 0 grabs)
    blackout_days = [d for d in steady_state_days if d["grabbed"] == 0]

    total_upload_gb = round(sum(d["upload_gb"] for d in daily_stats), 1)
    steady_state_upload = (
        round(mean([d["upload_gb"] for d in steady_state_days]), 2)
        if steady_state_days else 0.0
    )

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
        "total_upload_gb": total_upload_gb,
        "steady_state_daily_upload_gb": steady_state_upload,
        "avg_ratio": avg_ratio,
        "grabbed_torrents": grabbed_torrents,
        "skipped_torrents": skipped_torrents,
    }
