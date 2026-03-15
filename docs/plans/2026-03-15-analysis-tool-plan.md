# Torrent Performance Analysis Tool — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `analyze_and_generate_filters.py` — a script that reads torrent CSV data, discovers optimal torrent attributes for ratio building, and generates tiered autobrr filter JSONs.

**Architecture:** Single Python script with no external dependencies beyond the standard library. Reads CSV input, runs statistical analysis in pure Python (using `statistics` and `csv` modules), outputs a markdown report and autobrr filter JSON files. Configuration via constants at the top of the file.

**Tech Stack:** Python 3 standard library only (`csv`, `statistics`, `json`, `datetime`, `argparse`, `pathlib`)

---

### Task 1: Script skeleton with configuration and CSV loading

**Files:**
- Create: `analyze_and_generate_filters.py`
- Test: manual run with `python3 analyze_and_generate_filters.py freeleech`

**Step 1: Create the script with config constants and CSV loader**

```python
#!/usr/bin/env python3
"""Analyze torrent performance data and generate optimized autobrr filters."""

import csv
import json
import statistics
import sys
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path(__file__).parent

# ── Configuration ──────────────────────────────────────────────────────────
STORAGE_TB = 4                          # Seedbox storage capacity in TB
MIN_TORRENT_AGE_DAYS = 3                # Exclude torrents younger than this
MAX_SEED_DAYS = 10                      # Hard delete after this many days
TARGET_UTILIZATION_PCT = 85             # Target disk utilization %
# NOTE: Tier storage allocation is now empirical (staged simulation), not fixed splits
HOT_WINDOW_THRESHOLD = 0.02             # 2% day-over-day growth = knee

# Exclusions carried from existing filters
EXCEPT_RELEASES = "*MULTi*,*GERMAN*,*Dublado*,*FRENCH*,*SPANISH*,*Olympics*,*Collection*,*Mega*,*Filmography*"

SOURCES = {
    "freeleech": "torrents_data_freeleech.csv",
    "movies": "torrents_data_movies.csv",
    "tv": "torrents_data_tv.csv",
}


def load_csv(csv_path):
    """Load torrent data from CSV, parse types, compute age."""
    torrents = []
    now = datetime.now()
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                row["snatched"] = int(row["snatched"])
                row["seeders"] = int(row["seeders"])
                row["leechers"] = int(row["leechers"])
                row["size_gb"] = float(row["size_gb"])
                row["date_parsed"] = datetime.strptime(row["date"], "%Y-%m-%d %H:%M:%S")
                row["age_days"] = (now - row["date_parsed"]).total_seconds() / 86400
            except (ValueError, KeyError):
                continue
            torrents.append(row)
    return torrents


def parse_args():
    parser = argparse.ArgumentParser(description="Analyze torrent data and generate autobrr filters")
    parser.add_argument("source", choices=list(SOURCES.keys()), help="Data source to analyze")
    parser.add_argument("--storage", type=float, default=STORAGE_TB, help="Seedbox storage in TB (default: %s)" % STORAGE_TB)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    STORAGE_TB = args.storage
    csv_path = BASE_DIR / SOURCES[args.source]
    if not csv_path.exists():
        print("CSV not found: %s" % csv_path)
        print("Run: python3 parse_and_analyze.py %s" % args.source)
        sys.exit(1)
    torrents = load_csv(csv_path)
    print("Loaded %d torrents from %s" % (len(torrents), csv_path.name))
```

**Step 2: Run to verify CSV loading works**

Run: `python3 analyze_and_generate_filters.py freeleech`
Expected: `Loaded 11198 torrents from torrents_data_freeleech.csv`

**Step 3: Commit**

```bash
git add analyze_and_generate_filters.py
git commit -m "feat: add script skeleton with config and CSV loading"
```

---

### Task 2: Hot window discovery

**Files:**
- Modify: `analyze_and_generate_filters.py`

**Step 1: Add hot window discovery function**

Add after `load_csv`:

```python
def discover_hot_window(torrents):
    """Find how many days after upload most snatches occur.

    Groups torrents by age in days, computes median snatches per bucket,
    and finds the 'knee' where day-over-day growth drops below threshold.
    """
    # Group by integer age in days
    by_age = defaultdict(list)
    for t in torrents:
        day = int(t["age_days"])
        if day >= 1:
            by_age[day].append(t["snatched"])

    if not by_age:
        return 7  # fallback

    # Compute median snatches per day bucket
    daily_medians = {}
    for day in sorted(by_age.keys()):
        if len(by_age[day]) >= 5:  # need enough samples
            daily_medians[day] = statistics.median(by_age[day])

    if len(daily_medians) < 3:
        return 7  # fallback

    # Find knee: where day-over-day growth drops below threshold
    sorted_days = sorted(daily_medians.keys())
    hot_window = sorted_days[-1]  # default to max if no knee found

    for i in range(1, len(sorted_days)):
        prev_day = sorted_days[i - 1]
        curr_day = sorted_days[i]
        prev_median = daily_medians[prev_day]
        curr_median = daily_medians[curr_day]

        if prev_median > 0:
            growth = (curr_median - prev_median) / prev_median
            if growth < HOT_WINDOW_THRESHOLD:
                hot_window = prev_day
                break

    return hot_window
```

**Step 2: Wire it into main and print result**

Add to `__main__` after loading:

```python
    hot_window = discover_hot_window(torrents)
    print("Discovered hot window: %d days" % hot_window)

    # Filter to only torrents older than hot window for scoring
    mature_torrents = [t for t in torrents if t["age_days"] >= hot_window]
    print("Mature torrents (older than %d days): %d" % (hot_window, len(mature_torrents)))
```

**Step 3: Run to verify hot window discovery**

Run: `python3 analyze_and_generate_filters.py freeleech`
Expected: prints discovered hot window (likely 5-14 days) and mature torrent count.

**Step 4: Commit**

```bash
git add analyze_and_generate_filters.py
git commit -m "feat: add hot window discovery from snatches-vs-age data"
```

---

### Task 3: Scoring and attribute analysis

**Files:**
- Modify: `analyze_and_generate_filters.py`

**Step 1: Add scoring and attribute analysis functions**

Add after `discover_hot_window`:

```python
def score_torrents(torrents):
    """Score each torrent: snatched / (seeders + 1)."""
    for t in torrents:
        t["score"] = t["snatched"] / (t["seeders"] + 1)
    return torrents


def size_bucket(size_gb):
    """Categorize torrent size into buckets."""
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


def analyze_attribute(torrents, attr_fn, label):
    """Analyze scores grouped by an attribute.

    Returns dict of {value: {median, mean, count, total_snatched}} sorted by median desc.
    """
    groups = defaultdict(list)
    for t in torrents:
        key = attr_fn(t)
        if key:
            groups[key].append(t["score"])

    results = {}
    for key, scores in groups.items():
        if len(scores) >= 3:  # minimum sample size
            results[key] = {
                "median": statistics.median(scores),
                "mean": statistics.mean(scores),
                "count": len(scores),
            }

    # Sort by median descending
    results = dict(sorted(results.items(), key=lambda x: x[1]["median"], reverse=True))
    return results


def analyze_all_attributes(torrents):
    """Run attribute analysis across all dimensions."""
    analyses = {}

    analyses["category"] = analyze_attribute(
        torrents, lambda t: t.get("category", ""), "Category")

    analyses["resolution"] = analyze_attribute(
        torrents, lambda t: t.get("resolution", ""), "Resolution")

    analyses["source"] = analyze_attribute(
        torrents, lambda t: t.get("source", ""), "Source")

    analyses["codec"] = analyze_attribute(
        torrents, lambda t: t.get("codec", ""), "Codec")

    analyses["hdr"] = analyze_attribute(
        torrents, lambda t: t.get("hdr", ""), "HDR")

    analyses["size_bucket"] = analyze_attribute(
        torrents, lambda t: size_bucket(t["size_gb"]), "Size Bucket")

    analyses["release_group"] = analyze_attribute(
        torrents, lambda t: t.get("release_group", ""), "Release Group")

    # Cross-cut: resolution x source
    analyses["resolution_x_source"] = analyze_attribute(
        torrents, lambda t: "%s %s" % (t.get("resolution", ""), t.get("source", "")), "Resolution x Source")

    return analyses
```

**Step 2: Wire into main**

Add to `__main__` after mature_torrents:

```python
    scored = score_torrents(mature_torrents)
    analyses = analyze_all_attributes(scored)

    # Print summary
    for dimension, results in analyses.items():
        print("\n── %s ──" % dimension.upper())
        for key, stats in list(results.items())[:10]:
            print("  %-30s median=%.1f  mean=%.1f  n=%d" % (
                key, stats["median"], stats["mean"], stats["count"]))
```

**Step 3: Run to verify analysis output**

Run: `python3 analyze_and_generate_filters.py freeleech`
Expected: prints tables of attribute rankings by median score.

**Step 4: Commit**

```bash
git add analyze_and_generate_filters.py
git commit -m "feat: add scoring model and attribute analysis"
```

---

### Task 4: Tier assignment

**Files:**
- Modify: `analyze_and_generate_filters.py`

**Step 1: Add tier assignment functions**

Add after `analyze_all_attributes`:

```python
def assign_tiers(analyses):
    """Assign high/medium/low tiers to each attribute value based on percentile thresholds.

    Returns dict of {dimension: {value: tier}} where tier is 'high', 'medium', or 'low'.
    """
    tiers = {}

    for dimension, results in analyses.items():
        if not results:
            continue

        medians = [stats["median"] for stats in results.values()]
        if len(medians) < 3:
            continue

        medians_sorted = sorted(medians)
        p75 = medians_sorted[int(len(medians_sorted) * 0.75)]
        p25 = medians_sorted[int(len(medians_sorted) * 0.25)]

        tiers[dimension] = {}
        for key, stats in results.items():
            if stats["median"] >= p75:
                tiers[dimension][key] = "high"
            elif stats["median"] >= p25:
                tiers[dimension][key] = "medium"
            else:
                tiers[dimension][key] = "low"

    tiers["release_group"] = assign_release_group_tiers(analyses.get("release_group", {}))

    return tiers


def assign_release_group_tiers(group_results):
    """Special tier assignment for release groups.

    High tier: top 25% by median score with at least 10 releases (proven performers).
    Low tier: bottom 25% by median score.
    Medium tier: everything else.
    """
    if not group_results:
        return {}

    # Filter to groups with enough data
    qualified = {k: v for k, v in group_results.items() if v["count"] >= 10}
    if not qualified:
        return {}

    medians = [v["median"] for v in qualified.values()]
    medians_sorted = sorted(medians)
    p75 = medians_sorted[int(len(medians_sorted) * 0.75)]
    p25 = medians_sorted[int(len(medians_sorted) * 0.25)]

    result = {}
    for key, stats in qualified.items():
        if stats["median"] >= p75:
            result[key] = "high"
        elif stats["median"] >= p25:
            result[key] = "medium"
        else:
            result[key] = "low"

    return result
```

**Step 2: Wire into main**

Add to `__main__` after analyses:

```python
    tiers = assign_tiers(analyses)

    print("\n\n══ TIER ASSIGNMENTS ══")
    for dimension in ["category", "resolution", "source", "size_bucket", "release_group"]:
        if dimension not in tiers:
            continue
        print("\n── %s ──" % dimension.upper())
        for tier_name in ["high", "medium", "low"]:
            values = [k for k, v in tiers[dimension].items() if v == tier_name]
            if values:
                print("  %s: %s" % (tier_name.upper(), ", ".join(values)))
```

**Step 3: Run to verify tier output**

Run: `python3 analyze_and_generate_filters.py freeleech`
Expected: prints tier assignments for each dimension (e.g., `HIGH: 1080p, 2160p` for resolution).

**Step 4: Commit**

```bash
git add analyze_and_generate_filters.py
git commit -m "feat: add tier assignment based on percentile thresholds"
```

---

### Task 5: Storage budget and rate limit calculation

**Files:**
- Modify: `analyze_and_generate_filters.py`

**Step 1: Add storage budget calculation**

Add after `assign_release_group_tiers`:

```python
def calculate_daily_volume(torrents, tiers):
    """Estimate daily GB volume of torrents per tier based on historical data.

    Looks at how many torrents per day match each tier's criteria,
    multiplied by their median size.
    """
    # Classify each torrent into its best tier
    tier_torrents = {"high": [], "medium": [], "low": []}

    for t in torrents:
        torrent_tier = classify_torrent_tier(t, tiers)
        tier_torrents[torrent_tier].append(t)

    # Calculate daily volume per tier
    # Use the full date range of the dataset
    if not torrents:
        return {"high": 0, "medium": 0, "low": 0}, {"high": 0, "medium": 0, "low": 0}

    min_age = min(t["age_days"] for t in torrents)
    max_age = max(t["age_days"] for t in torrents)
    date_range_days = max_age - min_age
    if date_range_days < 1:
        date_range_days = 1

    daily_volume = {}
    median_sizes = {}
    for tier_name, tier_list in tier_torrents.items():
        if tier_list:
            sizes = [t["size_gb"] for t in tier_list]
            median_size = statistics.median(sizes)
            torrents_per_day = len(tier_list) / date_range_days
            daily_volume[tier_name] = torrents_per_day * median_size
            median_sizes[tier_name] = median_size
        else:
            daily_volume[tier_name] = 0
            median_sizes[tier_name] = 0

    return daily_volume, median_sizes


def classify_torrent_tier(torrent, tiers):
    """Classify a single torrent into high/medium/low based on its attributes."""
    tier_scores = {"high": 0, "medium": 0, "low": 0}

    # Check each dimension
    for dimension in ["category", "resolution", "source", "size_bucket"]:
        if dimension not in tiers:
            continue

        if dimension == "size_bucket":
            value = size_bucket(torrent["size_gb"])
        else:
            value = torrent.get(dimension, "")

        tier = tiers[dimension].get(value, "medium")
        tier_scores[tier] += 1

    # Check release group (weighted more heavily)
    if "release_group" in tiers:
        group = torrent.get("release_group", "")
        group_tier = tiers["release_group"].get(group, "medium")
        tier_scores[group_tier] += 2  # double weight for release group

    # Return highest-scoring tier
    if tier_scores["high"] >= tier_scores["medium"] and tier_scores["high"] >= tier_scores["low"]:
        return "high"
    elif tier_scores["medium"] >= tier_scores["low"]:
        return "medium"
    else:
        return "low"


def calculate_rate_limits(daily_volume, median_sizes, storage_tb):
    """Calculate rate limits per tier using fill-from-top strategy.

    Conservative model: assume all torrents sit for MAX_SEED_DAYS.
    """
    max_daily_gb = (storage_tb * 1024) / MAX_SEED_DAYS

    result = {}
    remaining_budget = max_daily_gb

    for tier_name in ["high", "medium", "low"]:
        volume = daily_volume[tier_name]
        median_size = median_sizes[tier_name]

        if volume <= 0 or median_size <= 0:
            result[tier_name] = {
                "enabled": False,
                "daily_gb": 0,
                "torrents_per_day": 0,
                "max_downloads_per_hour": 0,
                "median_size_gb": 0,
            }
            continue

        # Cap at remaining budget
        allocated_gb = min(volume, remaining_budget)
        remaining_budget -= allocated_gb

        torrents_per_day = allocated_gb / median_size if median_size > 0 else 0
        per_hour = max(1, round(torrents_per_day / 24 * 4))  # allow some burst

        result[tier_name] = {
            "enabled": allocated_gb > 0,
            "daily_gb": round(allocated_gb, 1),
            "torrents_per_day": round(torrents_per_day, 1),
            "max_downloads_per_hour": per_hour,
            "median_size_gb": round(median_size, 1),
        }

    result["max_daily_gb"] = round(max_daily_gb, 1)
    return result
```

**Step 2: Wire into main**

Add to `__main__` after tier assignments:

```python
    daily_volume, median_sizes = calculate_daily_volume(scored, tiers)
    rate_limits = calculate_rate_limits(daily_volume, median_sizes, STORAGE_TB)

    print("\n\n══ STORAGE BUDGET ══")
    print("Storage: %.0f TB | Max daily grab: %.1f GB/day" % (STORAGE_TB, rate_limits["max_daily_gb"]))
    for tier_name in ["high", "medium", "low"]:
        rl = rate_limits[tier_name]
        status = "ENABLED" if rl["enabled"] else "DISABLED"
        print("  %-8s %s | %.1f GB/day | ~%.1f torrents/day | %d/hour rate limit | median size %.1f GB" % (
            tier_name.upper(), status, rl["daily_gb"], rl["torrents_per_day"],
            rl["max_downloads_per_hour"], rl["median_size_gb"]))
```

**Step 3: Run to verify budget calculation**

Run: `python3 analyze_and_generate_filters.py freeleech`
Expected: prints storage budget breakdown with rate limits per tier.

**Step 4: Commit**

```bash
git add analyze_and_generate_filters.py
git commit -m "feat: add storage budget and rate limit calculation"
```

---

### Task 6: Autobrr filter JSON generation

**Files:**
- Modify: `analyze_and_generate_filters.py`

**Step 1: Add filter generation function**

Add after `calculate_rate_limits`:

```python
def generate_filter(tier_name, tier_index, tiers, rate_limits, source_name):
    """Generate an autobrr filter JSON for a given tier.

    tier_index: 0=high, 1=medium, 2=low
    """
    rl = rate_limits[tier_name]
    priority = 3 - tier_index  # high=3, medium=2, low=1
    delays = [5, 30, 60]
    delay = delays[tier_index]

    # Collect tier-appropriate values
    resolutions = [k for k, v in tiers.get("resolution", {}).items()
                   if v == tier_name or (tier_name == "low")]
    sources = [k for k, v in tiers.get("source", {}).items()
               if v == tier_name or (tier_name == "low")]

    # For high tier: use allowlist of release groups
    # For medium/low: use blocklist of low-tier groups
    high_groups = sorted([k for k, v in tiers.get("release_group", {}).items() if v == "high"])
    low_groups = sorted([k for k, v in tiers.get("release_group", {}).items() if v == "low"])

    # Size ranges from tier's size bucket analysis
    size_ranges = {
        "high": ("1GB", "30GB"),
        "medium": ("1GB", "20GB"),
        "low": ("1GB", "15GB"),
    }
    min_size, max_size = size_ranges[tier_name]

    # If resolution or source lists are empty, use reasonable defaults
    if not resolutions:
        resolutions = ["1080p", "2160p"]
    if not sources:
        sources = ["WEB-DL", "WEBRip", "BluRay", "Remux"]

    # Build categories based on what's in tier
    categories = []
    cat_tiers = tiers.get("category", {})
    if tier_name == "high":
        categories = [k for k, v in cat_tiers.items() if v == "high"]
    if not categories:
        categories = ["movies", "tv"]  # default

    # Map category names to autobrr match format
    cat_map = {"movies": "Movies*", "tv": "TV*", "games": "Games*",
               "education": "Education*", "music": "Music*"}
    match_categories = ",".join(cat_map.get(c, c + "*") for c in categories)

    filter_data = {
        "name": "generated-%s-%s-tier-%d" % (source_name, tier_name, priority),
        "version": "1.0",
        "data": {
            "enabled": rl["enabled"],
            "min_size": min_size,
            "max_size": max_size,
            "delay": delay,
            "priority": priority,
            "max_downloads": rl["max_downloads_per_hour"],
            "max_downloads_unit": "HOUR",
            "except_releases": EXCEPT_RELEASES,
            "announce_types": ["NEW"],
            "freeleech": True if source_name == "freeleech" else False,
            "resolutions": resolutions,
            "sources": sources,
            "match_categories": match_categories,
            "is_auto_updated": False,
            "release_profile_duplicate": None,
        }
    }

    # High tier: allowlist groups. Medium/Low: blocklist bad groups.
    if tier_name == "high" and high_groups:
        filter_data["data"]["match_release_groups"] = ",".join(high_groups)
    elif low_groups:
        filter_data["data"]["except_release_groups"] = ",".join(low_groups)

    return filter_data


def write_filters(tiers, rate_limits, source_name):
    """Generate and write all tier filter JSON files."""
    output_dir = BASE_DIR / "autobrr-filters" / "generated" / source_name
    output_dir.mkdir(parents=True, exist_ok=True)

    written = []
    for i, tier_name in enumerate(["high", "medium", "low"]):
        filter_data = generate_filter(tier_name, i, tiers, rate_limits, source_name)
        filename = "tier-%d-%s.json" % (3 - i, tier_name)
        path = output_dir / filename
        with open(path, "w") as f:
            json.dump(filter_data, f, indent=4)
        written.append(path)
        print("Wrote filter: %s" % path)

    return written
```

**Step 2: Wire into main**

Add to `__main__` after rate limits:

```python
    filters = write_filters(tiers, rate_limits, args.source)
```

**Step 3: Run and verify filter output**

Run: `python3 analyze_and_generate_filters.py freeleech`
Expected: creates `autobrr-filters/generated/freeleech/tier-3-high.json`, `tier-2-medium.json`, `tier-1-low.json`

Verify a generated filter:
Run: `cat autobrr-filters/generated/freeleech/tier-3-high.json | python3 -m json.tool`
Expected: valid JSON matching autobrr filter structure.

**Step 4: Commit**

```bash
git add analyze_and_generate_filters.py
git commit -m "feat: add autobrr filter JSON generation per tier"
```

---

### Task 7: Markdown report generation

**Files:**
- Modify: `analyze_and_generate_filters.py`

**Step 1: Add report generation function**

Add after `write_filters`:

```python
def generate_report(source_name, torrents, hot_window, analyses, tiers, daily_volume,
                    median_sizes, rate_limits, storage_tb):
    """Generate a markdown analysis report."""
    lines = []
    lines.append("# Torrent Performance Analysis Report: %s" % source_name)
    lines.append("")
    lines.append("Generated: %s" % datetime.now().strftime("%Y-%m-%d %H:%M"))
    lines.append("Dataset: %d torrents" % len(torrents))
    lines.append("Storage budget: %.0f TB (conservative: all torrents seed %d days)" % (storage_tb, MAX_SEED_DAYS))
    lines.append("")

    # Hot window
    lines.append("## Hot Window Analysis")
    lines.append("")
    lines.append("Discovered hot window: **%d days**" % hot_window)
    lines.append("")
    lines.append("Most snatches occur within the first %d days after upload. " % hot_window)
    lines.append("Torrents younger than %d days were excluded from scoring." % hot_window)
    lines.append("")

    # Attribute rankings
    for dimension in ["category", "resolution", "source", "codec", "hdr", "size_bucket", "resolution_x_source"]:
        if dimension not in analyses:
            continue
        title = dimension.replace("_", " ").title()
        lines.append("## %s Rankings" % title)
        lines.append("")
        lines.append("| %s | Median Score | Mean Score | Count | Tier |" % title)
        lines.append("|---|---|---|---|---|")

        for key, stats in analyses[dimension].items():
            tier = tiers.get(dimension, {}).get(key, "-")
            lines.append("| %s | %.1f | %.1f | %d | %s |" % (
                key, stats["median"], stats["mean"], stats["count"], tier))
        lines.append("")

    # Release groups (top 30 only)
    if "release_group" in analyses:
        lines.append("## Top Release Groups")
        lines.append("")
        lines.append("| Group | Median Score | Mean Score | Count | Tier |")
        lines.append("|---|---|---|---|---|")
        for key, stats in list(analyses["release_group"].items())[:30]:
            tier = tiers.get("release_group", {}).get(key, "-")
            lines.append("| %s | %.1f | %.1f | %d | %s |" % (
                key, stats["median"], stats["mean"], stats["count"], tier))
        lines.append("")

    # Storage budget
    lines.append("## Storage Budget")
    lines.append("")
    lines.append("| Parameter | Value |")
    lines.append("|---|---|")
    lines.append("| Storage | %.0f TB |" % storage_tb)
    lines.append("| Max seed time | %d days |" % MAX_SEED_DAYS)
    lines.append("| Max daily grab | %.1f GB/day |" % rate_limits["max_daily_gb"])
    lines.append("")
    lines.append("| Tier | Status | Daily GB | Torrents/Day | Rate Limit | Median Size |")
    lines.append("|---|---|---|---|---|---|")
    for tier_name in ["high", "medium", "low"]:
        rl = rate_limits[tier_name]
        status = "ENABLED" if rl["enabled"] else "DISABLED"
        lines.append("| %s | %s | %.1f GB | %.1f | %d/hour | %.1f GB |" % (
            tier_name.upper(), status, rl["daily_gb"], rl["torrents_per_day"],
            rl["max_downloads_per_hour"], rl["median_size_gb"]))
    lines.append("")

    # Filter summary
    lines.append("## Generated Filters")
    lines.append("")
    for tier_name in ["high", "medium", "low"]:
        rl = rate_limits[tier_name]
        lines.append("### Tier: %s (priority %d)" % (tier_name.upper(), {"high": 3, "medium": 2, "low": 1}[tier_name]))
        lines.append("")
        if not rl["enabled"]:
            lines.append("**DISABLED** — budget filled by higher tiers.")
            lines.append("")
            continue

        resolutions = [k for k, v in tiers.get("resolution", {}).items()
                       if v == tier_name or tier_name == "low"]
        sources = [k for k, v in tiers.get("source", {}).items()
                   if v == tier_name or tier_name == "low"]
        high_groups = sorted([k for k, v in tiers.get("release_group", {}).items() if v == "high"])
        low_groups = sorted([k for k, v in tiers.get("release_group", {}).items() if v == "low"])

        lines.append("- **Rate limit:** %d/hour" % rl["max_downloads_per_hour"])
        lines.append("- **Resolutions:** %s" % ", ".join(resolutions) if resolutions else "- **Resolutions:** 1080p, 2160p")
        lines.append("- **Sources:** %s" % ", ".join(sources) if sources else "- **Sources:** WEB-DL, WEBRip, BluRay, Remux")

        if tier_name == "high" and high_groups:
            lines.append("- **Allowlist groups:** %s" % ", ".join(high_groups))
        elif low_groups:
            lines.append("- **Blocklist groups:** %s" % ", ".join(low_groups))
        lines.append("")

    # Write report
    report_path = BASE_DIR / ("analysis_report_%s.md" % source_name)
    with open(report_path, "w") as f:
        f.write("\n".join(lines))

    print("Wrote report: %s" % report_path)
    return report_path
```

**Step 2: Wire into main**

Add to `__main__` after write_filters:

```python
    report = generate_report(
        args.source, scored, hot_window, analyses, tiers,
        daily_volume, median_sizes, rate_limits, STORAGE_TB)

    print("\nDone! Check %s for full analysis." % report.name)
```

**Step 3: Run full pipeline and verify report**

Run: `python3 analyze_and_generate_filters.py freeleech`
Expected: creates `analysis_report_freeleech.md` with all sections populated.

Run: `head -50 analysis_report_freeleech.md`
Expected: valid markdown with hot window, attribute rankings, storage budget, and filter summary.

**Step 4: Commit**

```bash
git add analyze_and_generate_filters.py
git commit -m "feat: add markdown report generation"
```

---

### Task 8: End-to-end verification

**Files:**
- No new files

**Step 1: Run full pipeline**

Run: `python3 analyze_and_generate_filters.py freeleech`
Expected: full output with all sections, no errors.

**Step 2: Verify all output files exist**

Run: `ls -la autobrr-filters/generated/freeleech/`
Expected: `tier-3-high.json`, `tier-2-medium.json`, `tier-1-low.json`

Run: `ls -la analysis_report_freeleech.md`
Expected: report file exists.

**Step 3: Validate filter JSON structure matches existing filters**

Run: `python3 -c "import json; [json.load(open('autobrr-filters/generated/freeleech/' + f)) for f in ['tier-3-high.json', 'tier-2-medium.json', 'tier-1-low.json']]; print('All valid JSON')"`
Expected: `All valid JSON`

**Step 4: Test with --storage flag**

Run: `python3 analyze_and_generate_filters.py freeleech --storage 10`
Expected: rate limits scale up compared to default 4TB run.

**Step 5: Final commit**

```bash
git add autobrr-filters/generated/ analysis_report_freeleech.md
git commit -m "feat: add generated filters and report for freeleech dataset"
```
