# Torrent Performance Analysis Tool — Design

## Purpose

Build a repeatable analysis script that reads torrent CSV data, identifies which torrent attributes predict the best upload performance, and generates tiered autobrr filter JSONs optimized to maximize monthly ratio gain.

## Pipeline

```
scraper.py → parse_and_analyze.py → analyze_and_generate_filters.py
```

1. **scraper.py** — pulls raw JSON from TorrentLeech API
2. **parse_and_analyze.py** — normalizes JSON into CSV
3. **analyze_and_generate_filters.py** — analyzes CSV, outputs report + filter JSONs

Steps 1-2 already exist. This design covers step 3.

## Usage

```bash
python3 analyze_and_generate_filters.py freeleech
python3 analyze_and_generate_filters.py tv
python3 analyze_and_generate_filters.py movies
```

Each reads its corresponding CSV (`torrents_data_<target>.csv`) and generates output specific to that dataset.

## Configuration

Top-level variables in the script:

```python
STORAGE_TB = 4                          # Seedbox storage capacity
MIN_TORRENT_AGE_DAYS = 3                # Exclude torrents still in hot window
TARGET_UTILIZATION_PCT = 85             # Target disk utilization %
```

> **Note:** Storage allocation across tiers is no longer based on fixed percentage splits. It is determined empirically via staged FIFO simulation: high and medium are measured first, then the low tier's rate limit and size cap are calibrated to fill the remaining budget.

Change `STORAGE_TB` to scale all rate limits. The analysis itself is independent of storage — only rate limit calculation uses it.

## Analysis Pipeline

### Step 1: Load & Filter Data

- Load CSV, parse dates
- Exclude torrents younger than `MIN_TORRENT_AGE_DAYS` (still accumulating snatches)

### Step 2: Discover Hot Window

The "hot window" is the period after upload where most snatches occur.

**Method:**
- Group torrents into daily age buckets (day 1, day 2, ... day 90)
- Calculate median snatches per bucket
- Find the "knee" — the age where day-over-day snatch increase drops below 2%
- That knee = `HOT_WINDOW_DAYS`

Only torrents older than `HOT_WINDOW_DAYS` are used for scoring (so we see their full early-life performance). The discovered value is printed in the report.

### Step 3: Score Torrents

```
score = snatched / (seeders + 1)
```

This measures demand relative to seeder competition. Size is excluded from the score — it becomes a filter constraint instead.

### Step 4: Attribute Analysis

Aggregate scores by attribute to find patterns:

- **Category** (Movies, TV, Games, etc.)
- **Resolution** (1080p, 2160p, 720p)
- **Source** (WEB-DL, BluRay, Remux, WEBRip)
- **Size bucket** (0-5GB, 5-15GB, 15-30GB, 30-60GB, 60GB+)
- **Release group** (top 30 by median score)
- **Cross-cuts** — resolution x source combinations

### Step 5: Tier Assignment

For each attribute dimension, split into three tiers using percentile thresholds on median score:

- **High tier** — top 25%
- **Medium tier** — middle 50%
- **Low tier** — bottom 25%

A torrent's overall tier is determined by how many of its attributes land in each tier.

### Step 6: Storage Budget & Rate Limits

**Constraint:** At any point, at most 10 days of torrents sit on disk (everything deleted at day 10, sooner if 1:1 ratio reached).

**Conservative model** (assumes everything sits 10 days):
```
max_daily_grab_gb = (STORAGE_TB * 1024) / 10
```

**Fill from the top:**
1. Calculate daily volume of high-tier torrents from data
2. If high-tier fills daily budget → only enable high-tier
3. If not → enable medium-tier to fill remaining
4. If still not full → enable low-tier

Rate limits per tier derived from daily budget ÷ median torrent size per tier.

### Step 7: Generate Output

**Markdown report** (`analysis_report_<target>.md`):
1. Hot window analysis — discovered duration, snatches-vs-age curve
2. Attribute rankings — tables by category, resolution, source, size, release group, cross-cuts
3. Tier definitions — which attribute values land in each tier
4. Storage budget breakdown — daily budget, volume per tier, which tiers to enable, rate limits
5. Release group recommendations — allowlist and blocklist per tier
6. Filter summary

**Filter JSONs:**
```
autobrr-filters/generated/<target>/
├── tier-1-high.json
├── tier-2-medium.json
└── tier-3-low.json
```

One JSON per tier per target. Matches existing autobrr filter format. Existing hand-crafted filters in `autobrr-filters/` are untouched.

## Filter Design

Each tier filter includes:
- **Priority** — high=3, medium=2, low=1
- **Delay** — high gets shortest delay (fastest grab)
- **Rate limit** — calculated from storage budget
- **Size range** — derived from tier's size distribution
- **Resolutions** — from tier analysis
- **Sources** — from tier analysis
- **Release groups** — allowlist (high tier) or blocklist (medium/low)
- **Exclusions** — multi-language, foreign, collections, etc. (carried from existing filters)
