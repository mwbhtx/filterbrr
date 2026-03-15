# Torrent Performance Analysis: freeleech

- **Generated:** 2026-03-15
- **Dataset:** 11655 torrents from `torrents_data_freeleech.csv`
- **Storage budget:** 4.0 TB

## Methodology

### Goal

Maximize monthly upload credits (ratio) on a private tracker by identifying which torrent attributes predict the best upload performance, then generating autobrr filters that automatically grab the highest-performing torrents within storage constraints.

### Assumptions

- **Seedbox constraint:** All torrents are deleted after reaching a 1:1 seed ratio or after 10 days, whichever comes first.
- **Storage constraint:** The seedbox has 4.0 TB of storage. At any given time, at most 10 days worth of grabbed torrents sit on disk.
- **Conservative model:** For rate limit calculations, we assume the worst case — every torrent sits for the full 10 days before deletion. In practice, many torrents hit 1:1 sooner, so actual capacity is higher than calculated.
- **Racing advantage:** Upload is earned primarily in the first hours after a torrent is uploaded to the tracker. Being an early seeder is critical. The real "hot window" for racing is likely under 24 hours, but we cannot measure this from a single data snapshot (see Data Maturity below).
- **Freeleech:** Downloaded data does not count against your ratio, so the only cost of grabbing a torrent is storage space and time.

### Data Maturity

Torrents younger than **3 days** are excluded from the analysis to ensure each torrent has had enough time to accumulate a representative snatch count.

**Important:** The `snatched` field in our data is a lifetime total — we see *how many* people downloaded a torrent, but not *when* they downloaded it. We cannot observe the accumulation curve (e.g., "5000 snatches in hour 1, then 200 more over the next 30 days"). For this reason, we recommend using data that is **at least 30 days old** so that every torrent has had time to reach its final snatch count. The relative rankings between attributes (which groups, resolutions, and sources produce the most-snatched torrents) are stable regardless of torrent age once past the first few days.

### Scoring Model

Each torrent is scored to estimate its upload potential relative to competition:

```
score = snatched / (seeders + 1)
```

Where:
- **snatched** = total number of users who have downloaded the torrent (lifetime demand signal)
- **seeders** = current number of seeders (competition signal — fewer seeders = bigger upload share)
- **+1** prevents division by zero and dampens the effect for low-seeder torrents

**Why this formula:** A torrent with 1000 snatches and 100 seeders (score = 9.9) is less valuable to seed than one with 500 snatches and 10 seeders (score = 45.5). The second torrent has fewer seeders competing for upload, so each seeder gets a larger share of the upload. This score approximates "upload earned per seeder."

**Why not just use raw snatches?** Raw snatches measure total demand but ignore competition. A torrent with 20,000 snatches but 2,000 seeders gives you less upload per seeder than one with 5,000 snatches and 50 seeders. For release groups specifically, we use a composite of both signals (see Release Groups below).

**Limitation:** Both `snatched` and `seeders` are point-in-time snapshots. The snatched count is cumulative (always grows) while seeders fluctuate (seeders leave over time). This means older torrents may have slightly deflated seeder counts relative to their snatch counts. Since we compare torrents within attribute groups (not across ages), this bias affects all torrents in a group equally and doesn't distort the relative rankings.

### Storage Efficiency Metric (Score/GB)

Since storage is the binding constraint, the primary metric for tier assignment is upload potential per GB of disk consumed:

```
score_per_gb = score / size_gb
            = (snatched / (seeders + 1)) / size_gb
```

**Why this matters:** A torrent with score 20 at 10 GB (score/GB = 2.0) is twice as storage-efficient as one with score 20 at 20 GB (score/GB = 1.0). When storage is limited, grabbing two efficient small torrents beats one large torrent at the same raw score. This metric is what determines tier assignment — raw score is shown in tables for reference but does not drive tier thresholds.

**Effect on rankings:** This rehabilitates some attributes that score lower in raw terms but are highly efficient per GB stored:
- **TV** (smaller files) rises relative to Movies
- **WEB-DL** (competitive score/GB despite high seeder counts) rises from low to medium
- **Small size buckets** (0-5GB) rise despite lower raw scores
- Release groups that produce smaller files at decent scores are promoted

## Attribute Rankings

### How to read these tables

For each attribute (category, resolution, source, etc.), we group all torrents by that attribute's value and compute:

- **Median Score:** The middle raw score when all scores are sorted. Shown for reference — not used for tier assignment.
- **Score/GB:** Median storage efficiency (`score / size_gb`). **This is the primary ranking metric** — tables are sorted by this column and tiers are assigned based on its percentiles.
- **Count:** Number of torrents with this attribute value. Low counts (< 20) mean the ranking may not be reliable.
- **Est. Daily Vol:** Estimated daily volume in GB for this attribute value, calculated as `(count / date_range_days) * median_torrent_size_gb`. This surfaces which attributes are both high-performing AND high-volume — a high score with negligible daily volume won't fill your seedbox.
- **Tier:** Assigned based on Score/GB percentile thresholds (see Tier Assignment below).

### Category

| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |
|-------|-------------|---------|-------|---------------|------|
| tv | 13.31 | 0.8267 | 4994 | 1000.0 GB/d | high |
| other | 9.52 | 0.7202 | 19 | 3.2 GB/d | high |
| books | 12.50 | 0.6537 | 21 | 5.1 GB/d | medium |
| movies | 17.91 | 0.6399 | 5973 | 1762.6 GB/d | medium |
| unknown | 13.64 | 0.5110 | 68 | 21.6 GB/d | medium |
| education | 10.00 | 0.4917 | 55 | 14.0 GB/d | medium |
| games | 13.32 | 0.4729 | 325 | 101.2 GB/d | low |
| music | 14.45 | 0.4087 | 200 | 80.2 GB/d | low |

### Subcategory

| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |
|-------|-------------|---------|-------|---------------|------|
| TV/Episodes SD | 27.29 | 1.4456 | 145 | 27.5 GB/d | high |
| TV/Foreign | 25.75 | 1.1189 | 723 | 191.1 GB/d | high |
| Movies/HD | 13.59 | 0.9496 | 60 | 14.6 GB/d | high |
| Movies/WebRip | 25.25 | 0.9372 | 1267 | 357.4 GB/d | high |
| Movies/XviD | 16.88 | 0.8971 | 394 | 82.0 GB/d | high |
| Unknown (48) | 18.00 | 0.8397 | 27 | 6.5 GB/d | medium |
| Movies/BluRay | 20.83 | 0.8181 | 1801 | 497.4 GB/d | medium |
| Movies/Documentary | 17.72 | 0.7857 | 86 | 21.5 GB/d | medium |
| TV/Boxsets | 11.65 | 0.7811 | 3944 | 722.5 GB/d | medium |
| Other/Foreign | 9.52 | 0.7202 | 19 | 3.2 GB/d | medium |
| Books/EBooks | 12.50 | 0.6537 | 21 | 5.1 GB/d | medium |
| Music/Albums | 17.90 | 0.6529 | 76 | 22.4 GB/d | medium |
| Education/Foreign | 10.00 | 0.4917 | 55 | 14.0 GB/d | medium |
| Movies/HDRip | 11.07 | 0.4894 | 4 | 0.9 GB/d | medium |
| Movies/4K | 12.43 | 0.4830 | 32 | 8.6 GB/d | medium |
| Games/PC | 13.09 | 0.4726 | 323 | 100.8 GB/d | medium |
| Movies/4K-UHD | 13.30 | 0.3946 | 2329 | 1069.1 GB/d | low |
| TV/Anime | 13.89 | 0.3660 | 182 | 73.2 GB/d | low |
| Unknown (49) | 11.44 | 0.3161 | 38 | 16.3 GB/d | low |
| Music/Singles | 14.00 | 0.2775 | 118 | 60.4 GB/d | low |
| Music/Videos | 9.82 | 0.1359 | 6 | 4.4 GB/d | low |

### Resolution

| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |
|-------|-------------|---------|-------|---------------|------|
| 720p | 19.55 | 2.7080 | 472 | 41.9 GB/d | high |
| 480p | 12.30 | 2.6346 | 72 | 4.2 GB/d | medium |
| 576p | 10.58 | 2.1513 | 12 | 0.8 GB/d | medium |
| 1080p | 15.77 | 0.8398 | 6145 | 1420.0 GB/d | medium |
| unknown | 16.75 | 0.7002 | 1343 | 419.1 GB/d | medium |
| 2160p | 14.20 | 0.4002 | 3609 | 1643.4 GB/d | low |

### Source

| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |
|-------|-------------|---------|-------|---------------|------|
| DVDRip | 16.38 | 2.4640 | 69 | 5.9 GB/d | high |
| HDTV | 23.85 | 1.5333 | 88 | 17.7 GB/d | high |
| WEB | 21.00 | 1.2607 | 916 | 169.8 GB/d | medium |
| WEBRip | 9.93 | 0.9624 | 955 | 123.3 GB/d | medium |
| WEB-DL | 12.27 | 0.6554 | 2681 | 594.1 GB/d | medium |
| Other | 13.54 | 0.6124 | 1127 | 290.5 GB/d | medium |
| BluRay | 19.67 | 0.6106 | 3187 | 1166.0 GB/d | low |
| Remux | 16.67 | 0.5887 | 2632 | 812.5 GB/d | low |

### Codec

| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |
|-------|-------------|---------|-------|---------------|------|
| XviD | 16.51 | 3.9634 | 18 | 0.9 GB/d | high |
| H.264 | 17.33 | 0.8661 | 4452 | 1057.7 GB/d | medium |
| Other | 18.43 | 0.6859 | 3304 | 939.7 GB/d | medium |
| AV1 | 10.59 | 0.6718 | 117 | 25.5 GB/d | medium |
| H.265 | 12.00 | 0.4793 | 3764 | 1162.4 GB/d | low |

### Hdr

| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |
|-------|-------------|---------|-------|---------------|------|
| None | 16.58 | 0.7972 | 9145 | 2267.8 GB/d | high |
| DV | 16.41 | 0.5999 | 306 | 86.1 GB/d | medium |
| SDR | 11.69 | 0.4703 | 153 | 39.1 GB/d | medium |
| HDR10+ | 13.25 | 0.4508 | 28 | 14.0 GB/d | medium |
| HDR | 13.48 | 0.4023 | 522 | 225.3 GB/d | medium |
| DV+HDR | 11.29 | 0.3533 | 1501 | 651.8 GB/d | low |

### Size Bucket

| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |
|-------|-------------|---------|-------|---------------|------|
| 0-5GB | 10.88 | 4.4115 | 609 | 20.5 GB/d | high |
| 5-15GB | 14.32 | 1.3949 | 1814 | 217.6 GB/d | medium |
| 15-30GB | 16.40 | 0.7903 | 4839 | 1109.0 GB/d | medium |
| 30-60GB | 17.54 | 0.4194 | 2886 | 1322.3 GB/d | medium |
| 60GB+ | 13.50 | 0.1656 | 1507 | 1285.9 GB/d | low |

### Resolution X Source

| Value | Median Score | Score/GB | Count | Est. Daily Vol | Tier |
|-------|-------------|---------|-------|---------------|------|
| unknown_HDTV | 26.90 | 9.1595 | 10 | 0.4 GB/d | high |
| 720p_WEB | 32.67 | 4.5534 | 67 | 6.4 GB/d | high |
| 480p_DVDRip | 16.29 | 3.8205 | 4 | 0.3 GB/d | high |
| 480p_WEB-DL | 11.29 | 3.0382 | 39 | 1.7 GB/d | high |
| 720p_Other | 17.55 | 2.9468 | 81 | 5.9 GB/d | high |
| 576p_WEB-DL | 15.30 | 2.7501 | 3 | 0.2 GB/d | high |
| 720p_WEB-DL | 16.90 | 2.6291 | 243 | 18.8 GB/d | high |
| unknown_DVDRip | 16.89 | 2.4150 | 61 | 5.2 GB/d | high |
| 720p_WEBRip | 14.14 | 2.2874 | 14 | 0.9 GB/d | medium |
| 480p_Other | 13.20 | 1.7223 | 21 | 3.2 GB/d | medium |
| 720p_BluRay | 31.33 | 1.6936 | 59 | 12.7 GB/d | medium |
| 1080p_HDTV | 23.40 | 1.4903 | 59 | 11.4 GB/d | medium |
| 1080p_WEB | 21.40 | 1.4548 | 491 | 81.6 GB/d | medium |
| unknown_WEB-DL | 16.83 | 1.4415 | 12 | 2.0 GB/d | medium |
| unknown_WEB | 12.29 | 1.1898 | 9 | 1.7 GB/d | medium |
| 2160p_HDTV | 31.00 | 1.1016 | 11 | 4.0 GB/d | medium |
| unknown_WEBRip | 16.00 | 1.0243 | 3 | 0.5 GB/d | medium |
| 1080p_Other | 12.31 | 1.0158 | 211 | 35.3 GB/d | medium |
| 1080p_WEBRip | 9.78 | 0.9912 | 869 | 106.8 GB/d | medium |
| unknown_BluRay | 31.25 | 0.9655 | 421 | 156.2 GB/d | medium |
| 2160p_WEB | 18.62 | 0.8329 | 347 | 72.2 GB/d | medium |
| 1080p_Remux | 18.71 | 0.8141 | 1840 | 484.2 GB/d | medium |
| 576p_Other | 10.93 | 0.7927 | 5 | 1.1 GB/d | medium |
| 1080p_BluRay | 19.25 | 0.7480 | 1333 | 365.1 GB/d | medium |
| 1080p_WEB-DL | 12.12 | 0.7089 | 1341 | 290.1 GB/d | medium |
| 720p_HDTV | 21.83 | 0.6282 | 7 | 2.9 GB/d | medium |
| unknown_Remux | 12.56 | 0.6114 | 49 | 11.4 GB/d | low |
| unknown_Other | 13.45 | 0.5095 | 778 | 232.1 GB/d | low |
| 480p_Remux | 10.80 | 0.4938 | 5 | 1.2 GB/d | low |
| 2160p_WEB-DL | 11.32 | 0.4586 | 1042 | 265.9 GB/d | low |
| 2160p_WEBRip | 10.91 | 0.4413 | 67 | 19.9 GB/d | low |
| 2160p_BluRay | 17.00 | 0.4305 | 1374 | 701.9 GB/d | low |
| 2160p_Other | 14.85 | 0.3126 | 30 | 15.8 GB/d | low |
| 2160p_Remux | 12.78 | 0.2096 | 738 | 504.7 GB/d | low |

## Top Release Groups

Release groups are ranked by median Score/GB (storage efficiency). Only groups with 3+ torrents are shown. The table shows the top 30 groups that have a tier assignment (10+ torrents), followed by untiered groups up to 30 total rows.

**Tier assignment for release groups** uses a composite ranking that combines three signals:

1. **Score rank:** Rank by median `snatched / (seeders + 1)` — how much upload each seeder gets
2. **Snatches rank:** Rank by median raw `snatched` count — total demand
3. **Score/GB rank:** Rank by median `score / size_gb` — storage efficiency

```
composite_rank = (score_rank + snatches_rank + score_per_gb_rank) / 3
```

This balances three signals: raw upload potential, total demand, and storage efficiency. Groups that release smaller files at decent scores (high score/GB) are promoted, while groups with large files at similar raw scores are demoted. Only groups with **10+ torrents** in the dataset are eligible for tier assignment (marked with `-` otherwise).

| Group | Median Score | Score/GB | Count | Est. Daily Vol | Tier |
|-------|-------------|---------|-------|---------------|------|
| WvF | 44.33 | 5.7743 | 17 | 1.6 GB/d | high |
| TABULARiA | 17.26 | 5.3994 | 16 | 0.7 GB/d | high |
| AMBER | 12.85 | 3.6444 | 17 | 0.7 GB/d | high |
| MeGusta | 10.13 | 3.6249 | 21 | 0.8 GB/d | high |
| FENiX | 13.32 | 3.5997 | 20 | 1.0 GB/d | high |
| TiPEX | 21.12 | 2.8376 | 17 | 1.5 GB/d | high |
| NoRBiT | 18.88 | 2.8202 | 44 | 4.1 GB/d | high |
| HEADER | 38.00 | 2.8164 | 39 | 6.9 GB/d | high |
| AMB3R | 31.42 | 2.7971 | 54 | 6.9 GB/d | high |
| NOGRP | 12.68 | 2.7239 | 10 | 0.6 GB/d | medium |
| SKYFiRE | 17.41 | 2.6018 | 12 | 1.0 GB/d | high |
| EPOWORKS | 38.79 | 2.5800 | 12 | 2.1 GB/d | high |
| PFa | 24.05 | 2.3186 | 10 | 1.1 GB/d | high |
| smcgill1969 | 26.06 | 2.2855 | 24 | 3.2 GB/d | high |
| BiQ | 39.00 | 2.2561 | 13 | 2.5 GB/d | high |
| WoKE | 12.35 | 2.1573 | 80 | 6.7 GB/d | high |
| URANiME | 29.20 | 2.1068 | 19 | 2.8 GB/d | high |
| PSA | 7.78 | 1.9724 | 48 | 2.6 GB/d | high |
| D4KiD | 26.19 | 1.9145 | 18 | 2.6 GB/d | high |
| CBFM | 17.69 | 1.8555 | 39 | 4.2 GB/d | high |
| MiSERABLE | 39.17 | 1.7868 | 28 | 7.0 GB/d | high |
| SAUERKRAUT | 25.83 | 1.7207 | 11 | 1.9 GB/d | high |
| TRIPEL | 29.20 | 1.7091 | 23 | 4.2 GB/d | high |
| WATCHABLE | 29.54 | 1.6391 | 56 | 11.4 GB/d | high |
| iVy | 10.19 | 1.6086 | 200 | 16.4 GB/d | medium |
| BORDURE | 26.02 | 1.6083 | 44 | 10.2 GB/d | high |
| SYLiX | 17.63 | 1.5792 | 16 | 2.2 GB/d | high |
| ZAHARA | 39.12 | 1.5657 | 18 | 4.6 GB/d | high |
| PRAWN | 37.60 | 1.5612 | 10 | 2.4 GB/d | high |
| Scene | 15.40 | 1.5183 | 44 | 4.6 GB/d | high |

## Tier Assignment

### How tiers are assigned

For each attribute dimension (category, resolution, source, etc.), we take all median Score/GB values and compute percentile thresholds:

- **High tier:** Median Score/GB >= 75th percentile (top 25%)
- **Medium tier:** Median Score/GB >= 25th percentile (middle 50%)
- **Low tier:** Median Score/GB < 25th percentile (bottom 25%)

### How tiers map to filters

- **High tier filter** (priority 4, 5s delay): Uses an **allowlist** — only grabs torrents from high-tier release groups. Includes Movies + TV categories, high + medium tier resolutions and sources. Fastest grab speed.
- **Medium tier filter** (priority 3, 30s delay): Uses a **blocklist** — grabs from any group except low-tier ones. Includes medium tier resolutions/sources only.
- **Low tier filter** (priority 2, 60s delay): Uses a **blocklist** — same exclusions as medium. Includes all resolutions and sources. The theoretical budget model allocates all storage to high and medium, but in practice those tiers are supply-constrained and can't fill the disk. The low tier's rate limit (1/hr) and size cap are tuned via staged simulation to fill the gap without causing blackout days.
- **Opportunistic filter** (priority 1, 65s delay): Targets small efficient torrents (<=15GB, 1080p/720p) from non-low-tier groups. Currently disabled as the low tier fills its role.

**Note on size ranges:** All tiers cap at 30GB. This prevents large 30-60GB BluRay/Remux content from consuming disproportionate storage — each 60GB torrent displaces 3-7 high-tier torrents (median 8-9 GB). In practice, the high tier's median torrent size is 9.6 GB, so most high-tier matches are well under the cap.

### Torrent classification

Each torrent is classified into an overall tier by checking its attributes against the tier maps. Each matching attribute scores points:

- Category, resolution, source, size bucket: **1 point** each for their tier
- Release group: **2 points** (double weight — group is the strongest predictor)

The tier with the most points wins. On a tie, higher tier wins (high > medium > low).

## Storage Budget

### Model

The storage budget determines how many torrents can be grabbed per day without exceeding the seedbox capacity.

```
max_daily_intake = (storage_tb * 1024 GB) / max_seed_days
                 = (4.0 * 1024) / 10
                 = 409.6 GB/day
```

This assumes the worst case: every torrent sits for the full 10 days before being deleted. At any moment, the disk holds up to 10 days x 409.6 GB/day = 4096 GB = 4.0 TB.

### Staged simulation calibration

Rather than relying on theoretical daily volume estimates, we measure each tier's actual storage contribution by running the FIFO simulation in stages:

1. **High tier only** — simulate with just the high-tier filter to measure its real steady-state disk utilization
2. **High + Medium** — add the medium filter and measure combined utilization
3. **Remaining budget** — subtract the high+medium utilization from the target to determine how much the low tier needs to contribute
4. **Calibrate low tier** — sweep the low tier's autobrr-enforceable knobs (max\_downloads/hour and max\_size) to find the combination that brings total utilization closest to the target with zero blackout days

This empirical approach accounts for real-world effects that theoretical estimates miss: bursty torrent arrival patterns, rate limit interactions, FIFO ordering, and the 10-day expiry cycle. The resulting rate limits are directly enforceable in autobrr — no simulation-only tricks like storage ceilings are needed.

### Rate limit calculation

**High and medium tiers** use a burst-factor formula to convert their daily GB allocation into an hourly download cap:

```
torrents_per_day  = allocated_gb / median_torrent_size_gb
downloads_per_hour = max(1, round(torrents_per_day / 24 * 8))
```

The `* 8` burst factor allows grabbing multiple torrents in a short window (e.g., when a batch of new freeleech torrents drops during peak evening hours) while still respecting the daily average.

**Low tier** rate limit and size cap are determined empirically by the staged simulation calibration. The budget model allocates 0 to low tier (high+medium theoretically consume everything), but those tiers are supply-constrained in practice. The calibration sweep finds the rate/size combination that fills the actual gap.

### Parameters

| Parameter | Value |
|-----------|-------|
| Storage capacity | 4.0 TB |
| Max seed days (hard delete) | 10 days |
| Max daily intake | 409.6 GB/day |

### Per-Tier Budget Allocation

This table shows the **theoretical** budget allocation from the fill-from-top model. The low tier may show 0 allocation here because the model assigns all budget to high and medium based on their theoretical daily volume. In practice, the low tier's rate limit and size cap are determined by the staged simulation calibration (see below), and the actual per-tier throughput is shown in the simulation's Per-Filter Breakdown.

| Tier | Enabled | Budget GB/day | Median Size | DL/hour Rate Limit |
|------|---------|--------------|-------------|--------------------|
| high | yes | 137.0 | 9.6 GB | 5 |
| medium | yes | 272.6 | 22.9 GB | 4 |
| low | yes | *(calibrated)* | 16.5 GB | 1 |
| opportunistic | no | 0.0 | 9.3 GB | 0 |

## Generated Filters

These filters are generated in `autobrr-filters/generated/{source}/` and can be imported directly into autobrr. Each filter corresponds to a tier.

### Excluded from all filters

The following release name patterns are excluded across all tiers (collections, packs, and other non-individual releases that consume disproportionate storage for their upload return):

```
*Olympics*,*Collection*,*Mega*,*Filmography*
```

### Resolution and source restrictions

The **high and medium** tier filters exclude certain resolutions and sources to focus on the best racing opportunities:

Resolutions excluded from high/medium: 480p, 576p, unknown

**Note:** 480p ranks medium by Score/GB but is excluded from high/medium because autobrr resolution matching is unreliable for SD content and the daily volume is negligible. Similarly, 576p and unknown resolutions cannot be reliably matched.

Sources excluded from high/medium: DVDRip, HDTV, Other

**Note:** DVDRip and HDTV rank high by Score/GB but are excluded from high/medium because their daily volume is very low and they are not competitive for racing. "Other" source is excluded because it cannot be reliably matched in autobrr filters.

The **low tier** includes all resolutions (except `unknown`) and all sources (except `Other`), but uses the same blocklist as medium to exclude low-performing release groups. Its rate limit and size cap are tuned via staged simulation to fill the storage gap that high and medium tiers leave due to supply constraints.

### Tier: HIGH (priority 4)

**Status: ENABLED** — 137.0 GB/day, ~14.2 torrents/day

| Setting | Value |
|---------|-------|
| Priority | 4 |
| Delay | 5s |
| Size range | 1GB - 30GB |
| Rate limit | 5 downloads/hour |
| Resolutions | 1080p, 720p |
| Sources | WEB, WEB-DL, WEBRip |
| Strategy | **Allowlist** — only grab from these groups |
| Groups | AMB3R, AMBER, BORDURE, BiQ, BiTOR, CBFM, CG, D4KiD, EDITH, EPOWORKS, FENiX, FULLBRUTALiTY, GAZER, GITA, GUACAMOLE, HDT, HEADER, HiggsBoson, InChY, KRaLiMaRKo, MeGusta, MiSERABLE, NoRBiT, PFa, PRAWN, PSA, SAUERKRAUT, SKYFiRE, SLOT, STC, SYLiX, Scene, TABULARiA, TRIPEL, TRiToN, TiPEX, UNDERTAKERS, URANiME, Unkn0wn, WATCHABLE, WAYNE, WoKE, WvF, ZAHARA, ZAX, smcgill1969 |

### Tier: MEDIUM (priority 3)

**Status: ENABLED** — 272.6 GB/day, ~11.9 torrents/day

| Setting | Value |
|---------|-------|
| Priority | 3 |
| Delay | 30s |
| Size range | 1GB - 30GB |
| Rate limit | 4 downloads/hour |
| Resolutions | 1080p |
| Sources | WEB, WEB-DL, WEBRip |
| Strategy | **Blocklist** — grab from anyone except these groups |
| Groups excluded | 2026, 4KDVS, ATELiER, Audio, B0MBARDiERS, BAKED, BEN, BETTY, BLoz, BTN, CiNEPHiLES, DUPLEX, Dooky, FELIX, FGT, GuyZo, HD, HDH, HONE, KRATOS, MALUS, MIDDLE, MONUMENT, MTeam, MiMiR, Mixed, OFT, ORBiT, OldT, PTer, PandaMoon, PiRAMiDHEAD, RFX, SPHD, SiCFoI, TMT, TheFarm, TrollHD, VD0N, Vialle, WOU, WeWillRockU, ZoroSenpai, deef, edge2020, playWEB, seedpool |

### Tier: LOW (priority 2)

**Status: ENABLED** — ~185.6 GB/day, ~12.0 torrents/day (measured from simulation)

**Purpose:** Fill the storage gap that high and medium tiers leave due to supply constraints. Accepts all resolutions (including 2160p), all sources (including BluRay and Remux), and files up to 30GB. Uses the same release group blocklist as medium tier. Rate limit (1/hr) and size cap are tuned via staged simulation — not derived from the budget model, which allocates 0 to this tier.

| Setting | Value |
|---------|-------|
| Priority | 2 |
| Delay | 60s |
| Size range | 1GB - 30GB |
| Rate limit | 1 downloads/hour |
| Resolutions | 1080p, 2160p, 480p, 576p, 720p |
| Sources | BluRay, DVDRip, HDTV, Remux, WEB, WEB-DL, WEBRip |
| Strategy | **Blocklist** — grab from anyone except these groups |
| Groups excluded | 2026, 4KDVS, ATELiER, Audio, B0MBARDiERS, BAKED, BEN, BETTY, BLoz, BTN, CiNEPHiLES, DUPLEX, Dooky, FELIX, FGT, GuyZo, HD, HDH, HONE, KRATOS, MALUS, MIDDLE, MONUMENT, MTeam, MiMiR, Mixed, OFT, ORBiT, OldT, PTer, PandaMoon, PiRAMiDHEAD, RFX, SPHD, SiCFoI, TMT, TheFarm, TrollHD, VD0N, Vialle, WOU, WeWillRockU, ZoroSenpai, deef, edge2020, playWEB, seedpool |

### Tier: OPPORTUNISTIC (priority 1)

**Status: DISABLED** — storage budget is fully consumed by higher tiers. Enable this filter if high-tier volume drops or you increase storage.

**Purpose:** Fill remaining storage budget with small, efficient torrents that deliver high upload per GB. Targets 720p/1080p content <=15GB from any non-low-tier group.

| Setting | Value |
|---------|-------|
| Priority | 1 |
| Delay | 65s |
| Size range | 1GB - 15GB |
| Rate limit | 0 downloads/hour |
| Resolutions | 1080p, 720p |
| Sources | WEB, WEB-DL, WEBRip |
| Strategy | **Blocklist** — grab from anyone except these groups |
| Groups excluded | 2026, 4KDVS, ATELiER, Audio, B0MBARDiERS, BAKED, BEN, BETTY, BLoz, BTN, CiNEPHiLES, DUPLEX, Dooky, FELIX, FGT, GuyZo, HD, HDH, HONE, KRATOS, MALUS, MIDDLE, MONUMENT, MTeam, MiMiR, Mixed, OFT, ORBiT, OldT, PTer, PandaMoon, PiRAMiDHEAD, RFX, SPHD, SiCFoI, TMT, TheFarm, TrollHD, VD0N, Vialle, WOU, WeWillRockU, ZoroSenpai, deef, edge2020, playWEB, seedpool |

## Filter Simulation

### Overview

To validate the generated filters, we replay all 11864 torrents from the dataset chronologically, simulating what autobrr would do if these filters had been active during the data collection period. The simulation tests the filters against the **full dataset** (including foreign-language and collection torrents) to verify that exclusion patterns correctly reject them.

### How the simulation works

**1. Setup**

- All torrents are sorted chronologically by their upload timestamp.
- Only filters with `enabled: true` are loaded. Disabled filters (e.g., low and opportunistic tiers when budget is consumed by higher tiers) are skipped entirely.
- Enabled filters are sorted by priority descending (highest priority = first to match).
- A virtual disk starts empty with a 4096 GB capacity (4.0 TB).

**2. Day-by-day processing**

For each calendar day in the dataset:

1. **Expire old torrents:** At the start of each day, any torrent that has been on disk for 10 or more full days is deleted. The grab timestamp is truncated to midnight, so a torrent grabbed at any time on day 1 expires at the start of day 11. This models the tracker's minimum seed requirement of 10 days.
2. **Process torrents hour by hour:** Each day is split into 24 one-hour windows. Torrents are assigned to the hour they were uploaded.
3. **Within each hour**, torrents are processed in **FIFO order** (earliest upload first), matching real autobrr behavior where torrents are grabbed in announcement order.

**3. Per-torrent matching**

For each torrent in the hour, filters are tried in priority order (highest first). A torrent matches a filter if **all** of these pass:

- **Size:** torrent size is within the filter's `min_size`–`max_size` range
- **Resolution:** torrent resolution is in the filter's resolution list
- **Source:** torrent source is in the filter's source list
- **Category:** torrent category matches at least one `match_categories` pattern (e.g., `Movies*` matches `movies`)
- **Name exclusions:** torrent name does NOT match any `except_releases` glob pattern (e.g., `*Collection*`)
- **Release group allowlist** (high tier): torrent group must be in `match_release_groups`
- **Release group blocklist** (other tiers): torrent group must NOT be in `except_release_groups`

**4. Rate limit enforcement**

Each filter has a `max_downloads` per hour limit. If a torrent matches a filter but that filter has already grabbed `max_downloads` torrents in the current hour, the simulation tries the next lower-priority filter. If no filter can accept the torrent (all matched filters are at their hourly limit), it is counted as **rate limited**.

**5. Storage enforcement**

If a torrent matches a filter and passes the rate limit, the simulation checks whether adding it would exceed the 4096 GB disk capacity. If so, the torrent is counted as **storage full** and skipped. Otherwise, it is grabbed: added to the virtual disk, and the filter's hourly counter is incremented.

**Note on low-tier budget control:** The theoretical budget model allocates all storage to high and medium tiers, but in practice they are supply-constrained and achieve ~55% utilization. The low tier's rate limit (1/hr) and size cap are tuned via staged simulation to fill the remaining ~42% without causing blackout days. No artificial storage ceiling is used — the rate limit and size cap alone are sufficient and are directly enforceable in autobrr.

**6. Skip classification**

Every torrent that is not grabbed is classified into exactly one skip reason:

- **No match:** The torrent did not pass any enabled filter's criteria (wrong resolution, source, size, category, excluded by name pattern, or blocked release group).
- **Rate limited:** The torrent matched at least one filter, but all matching filters had already hit their hourly download limit.
- **Storage full:** The torrent matched a filter with available rate limit capacity, but adding it would exceed disk capacity.

**7. Steady-state metrics**

After the first 10 days (the ramp-up period where the disk is filling from empty), the simulation reaches steady state — new torrents are being grabbed at roughly the same rate as old ones expire. The steady-state utilization percentage is the primary measure of whether the filters are well-calibrated to the storage budget.

### Summary

| Metric | Value |
|--------|-------|
| Simulation period | 91 days |
| Torrents seen | 11864 |
| Torrents grabbed | 2590 (21.8%) |
| Total GB grabbed | 35857.0 GB |
| Steady-state avg disk usage | 3974.2 GB (97.0% of 4096 GB) |
| Steady-state utilization range | 89.2% – 100.0% |
| Blackout days (0 grabs, post-ramp-up) | 0 |

### Verdict

**PASS** — Steady-state disk usage averages 3974 GB (97.0%), which is within the target range of 3.4–4.0 TB. The filters are grabbing enough content to keep the seedbox well-utilized.

### Skip Reasons

Torrents that were not grabbed and why:

| Reason | Count | % of Seen |
|--------|-------|-----------|
| No Match | 8212 | 69.2% |
| Rate Limited | 953 | 8.0% |
| Storage Full | 109 | 0.9% |

### Per-Filter Breakdown

| Filter | Torrents | Total GB | Median Size | Avg GB/day |
|--------|----------|----------|-------------|------------|
| fl-freeleech-high-priority | 448 | 4805.9 GB | 9.1 GB | 52.8 GB/d |
| fl-freeleech-medium-priority | 1050 | 14161.7 GB | 13.0 GB | 155.6 GB/d |
| fl-freeleech-low-priority | 1092 | 16889.4 GB | 16.5 GB | 185.6 GB/d |

### Daily Log

| Day | Date | Available | Grabbed | GB In | GB Expired | Disk Usage | Util % |
|-----|------|-----------|---------|-------|------------|------------|--------|
| 1 | 2025-11-20 | 28 | 7 | 122.7 | 0.0 | 122.7 GB | 3.0% |
| 2 | 2025-11-21 | 94 | 23 | 340.9 | 0.0 | 463.6 GB | 11.3% |
| 3 | 2025-11-22 | 126 | 26 | 400.2 | 0.0 | 863.8 GB | 21.1% |
| 4 | 2025-11-23 | 125 | 32 | 471.8 | 0.0 | 1335.6 GB | 32.6% |
| 5 | 2025-11-24 | 90 | 24 | 348.9 | 0.0 | 1684.5 GB | 41.1% |
| 6 | 2025-11-25 | 128 | 35 | 461.8 | 0.0 | 2146.4 GB | 52.4% |
| 7 | 2025-11-26 | 113 | 22 | 354.7 | 0.0 | 2501.1 GB | 61.1% |
| 8 | 2025-11-27 | 111 | 27 | 373.0 | 0.0 | 2874.1 GB | 70.2% |
| 9 | 2025-11-28 | 141 | 40 | 472.3 | 0.0 | 3346.4 GB | 81.7% |
| 10 | 2025-11-29 | 180 | 48 | 556.7 | 0.0 | 3903.1 GB | 95.3% |
| 11 | 2025-11-30 | 100 | 16 | 211.7 | 122.7 | 3992.1 GB | 97.5% |
| 12 | 2025-12-01 | 139 | 27 | 349.8 | 340.9 | 4001.1 GB | 97.7% |
| 13 | 2025-12-02 | 134 | 28 | 356.9 | 400.2 | 3957.8 GB | 96.6% |
| 14 | 2025-12-03 | 177 | 31 | 428.5 | 471.8 | 3914.5 GB | 95.6% |
| 15 | 2025-12-04 | 104 | 22 | 332.9 | 348.9 | 3898.5 GB | 95.2% |
| 16 | 2025-12-05 | 124 | 31 | 468.9 | 461.8 | 3905.5 GB | 95.3% |
| 17 | 2025-12-06 | 141 | 28 | 446.2 | 354.7 | 3997.0 GB | 97.6% |
| 18 | 2025-12-07 | 148 | 22 | 328.0 | 373.0 | 3952.0 GB | 96.5% |
| 19 | 2025-12-08 | 128 | 21 | 312.1 | 472.3 | 3791.8 GB | 92.6% |
| 20 | 2025-12-09 | 147 | 31 | 422.1 | 556.7 | 3657.2 GB | 89.3% |
| 21 | 2025-12-10 | 170 | 43 | 550.1 | 211.7 | 3995.5 GB | 97.5% |
| 22 | 2025-12-11 | 141 | 37 | 448.7 | 349.8 | 4094.3 GB | 100.0% |
| 23 | 2025-12-12 | 149 | 24 | 355.2 | 356.9 | 4092.6 GB | 99.9% |
| 24 | 2025-12-13 | 119 | 28 | 414.2 | 428.5 | 4078.3 GB | 99.6% |
| 25 | 2025-12-14 | 129 | 10 | 103.8 | 332.9 | 3849.2 GB | 94.0% |
| 26 | 2025-12-15 | 159 | 38 | 434.9 | 468.9 | 3815.2 GB | 93.1% |
| 27 | 2025-12-16 | 147 | 32 | 374.7 | 446.2 | 3743.7 GB | 91.4% |
| 28 | 2025-12-17 | 126 | 32 | 503.0 | 328.0 | 3918.7 GB | 95.7% |
| 29 | 2025-12-18 | 126 | 32 | 483.6 | 312.1 | 4090.1 GB | 99.9% |
| 30 | 2025-12-19 | 93 | 26 | 382.0 | 422.1 | 4050.1 GB | 98.9% |
| 31 | 2025-12-20 | 108 | 23 | 304.8 | 550.1 | 3804.9 GB | 92.9% |
| 32 | 2025-12-21 | 103 | 37 | 481.5 | 448.7 | 3837.7 GB | 93.7% |
| 33 | 2025-12-22 | 131 | 35 | 355.7 | 355.2 | 3838.2 GB | 93.7% |
| 34 | 2025-12-23 | 174 | 31 | 430.5 | 414.2 | 3854.6 GB | 94.1% |
| 35 | 2025-12-24 | 176 | 29 | 344.6 | 103.8 | 4095.3 GB | 100.0% |
| 36 | 2025-12-25 | 109 | 24 | 389.4 | 434.9 | 4049.8 GB | 98.9% |
| 37 | 2025-12-26 | 158 | 30 | 412.5 | 374.7 | 4087.6 GB | 99.8% |
| 38 | 2025-12-27 | 123 | 34 | 494.5 | 503.0 | 4079.1 GB | 99.6% |
| 39 | 2025-12-28 | 129 | 28 | 426.2 | 483.6 | 4021.8 GB | 98.2% |
| 40 | 2025-12-29 | 110 | 20 | 302.5 | 382.0 | 3942.3 GB | 96.2% |
| 41 | 2025-12-30 | 149 | 32 | 429.6 | 304.8 | 4067.1 GB | 99.3% |
| 42 | 2025-12-31 | 158 | 42 | 504.8 | 481.5 | 4090.3 GB | 99.9% |
| 43 | 2026-01-01 | 113 | 25 | 356.9 | 355.7 | 4091.5 GB | 99.9% |
| 44 | 2026-01-02 | 132 | 29 | 429.8 | 430.5 | 4090.8 GB | 99.9% |
| 45 | 2026-01-03 | 105 | 24 | 328.4 | 344.6 | 4074.6 GB | 99.5% |
| 46 | 2026-01-04 | 77 | 20 | 301.2 | 389.4 | 3986.4 GB | 97.3% |
| 47 | 2026-01-05 | 97 | 29 | 349.4 | 412.5 | 3923.4 GB | 95.8% |
| 48 | 2026-01-06 | 123 | 42 | 666.1 | 494.5 | 4095.0 GB | 100.0% |
| 49 | 2026-01-07 | 114 | 26 | 359.0 | 426.2 | 4027.7 GB | 98.3% |
| 50 | 2026-01-08 | 147 | 28 | 365.5 | 302.5 | 4090.7 GB | 99.9% |
| 51 | 2026-01-09 | 139 | 33 | 434.8 | 429.6 | 4095.9 GB | 100.0% |
| 52 | 2026-01-10 | 127 | 30 | 454.7 | 504.8 | 4045.8 GB | 98.8% |
| 53 | 2026-01-11 | 134 | 27 | 405.0 | 356.9 | 4093.8 GB | 99.9% |
| 54 | 2026-01-12 | 136 | 34 | 415.3 | 429.8 | 4079.4 GB | 99.6% |
| 55 | 2026-01-13 | 130 | 27 | 338.7 | 328.4 | 4089.7 GB | 99.8% |
| 56 | 2026-01-14 | 152 | 21 | 302.1 | 301.2 | 4090.6 GB | 99.9% |
| 57 | 2026-01-15 | 100 | 21 | 313.8 | 349.4 | 4055.0 GB | 99.0% |
| 58 | 2026-01-16 | 181 | 42 | 496.2 | 666.1 | 3885.1 GB | 94.9% |
| 59 | 2026-01-17 | 113 | 24 | 364.8 | 359.0 | 3891.0 GB | 95.0% |
| 60 | 2026-01-18 | 111 | 22 | 314.1 | 365.5 | 3839.6 GB | 93.7% |
| 61 | 2026-01-19 | 101 | 28 | 393.3 | 434.8 | 3798.1 GB | 92.7% |
| 62 | 2026-01-20 | 137 | 39 | 461.4 | 454.7 | 3804.9 GB | 92.9% |
| 63 | 2026-01-21 | 142 | 30 | 469.8 | 405.0 | 3869.7 GB | 94.5% |
| 64 | 2026-01-22 | 126 | 39 | 584.4 | 415.3 | 4038.7 GB | 98.6% |
| 65 | 2026-01-23 | 102 | 22 | 287.1 | 338.7 | 3987.1 GB | 97.3% |
| 66 | 2026-01-24 | 134 | 39 | 410.9 | 302.1 | 4095.8 GB | 100.0% |
| 67 | 2026-01-25 | 168 | 25 | 314.0 | 313.8 | 4096.0 GB | 100.0% |
| 68 | 2026-01-26 | 144 | 34 | 469.3 | 496.2 | 4069.1 GB | 99.3% |
| 69 | 2026-01-27 | 115 | 24 | 391.2 | 364.8 | 4095.4 GB | 100.0% |
| 70 | 2026-01-28 | 211 | 24 | 314.7 | 314.1 | 4096.0 GB | 100.0% |
| 71 | 2026-01-29 | 147 | 30 | 379.0 | 393.3 | 4081.6 GB | 99.6% |
| 72 | 2026-01-30 | 126 | 31 | 466.7 | 461.4 | 4086.8 GB | 99.8% |
| 73 | 2026-01-31 | 121 | 15 | 232.6 | 469.8 | 3849.7 GB | 94.0% |
| 74 | 2026-02-01 | 111 | 30 | 439.8 | 584.4 | 3705.1 GB | 90.5% |
| 75 | 2026-02-02 | 139 | 32 | 475.6 | 287.1 | 3893.6 GB | 95.1% |
| 76 | 2026-02-03 | 124 | 28 | 385.8 | 410.9 | 3868.5 GB | 94.4% |
| 77 | 2026-02-04 | 138 | 21 | 339.0 | 314.0 | 3893.5 GB | 95.1% |
| 78 | 2026-02-05 | 125 | 32 | 447.7 | 469.3 | 3871.9 GB | 94.5% |
| 79 | 2026-02-06 | 132 | 38 | 487.3 | 391.2 | 3968.1 GB | 96.9% |
| 80 | 2026-02-07 | 105 | 22 | 353.6 | 314.7 | 4007.0 GB | 97.8% |
| 81 | 2026-02-08 | 142 | 22 | 277.8 | 379.0 | 3905.8 GB | 95.4% |
| 82 | 2026-02-09 | 123 | 18 | 213.7 | 466.7 | 3652.8 GB | 89.2% |
| 83 | 2026-02-10 | 191 | 40 | 581.9 | 232.6 | 4002.1 GB | 97.7% |
| 84 | 2026-02-11 | 146 | 34 | 522.6 | 439.8 | 4084.9 GB | 99.7% |
| 85 | 2026-02-12 | 127 | 22 | 332.6 | 475.6 | 3941.9 GB | 96.2% |
| 86 | 2026-02-13 | 156 | 32 | 529.7 | 385.8 | 4085.9 GB | 99.8% |
| 87 | 2026-02-14 | 107 | 23 | 336.8 | 339.0 | 4083.7 GB | 99.7% |
| 88 | 2026-02-15 | 124 | 24 | 393.9 | 447.7 | 4029.9 GB | 98.4% |
| 89 | 2026-02-16 | 97 | 24 | 341.1 | 487.3 | 3883.8 GB | 94.8% |
| 90 | 2026-02-17 | 163 | 35 | 425.9 | 353.6 | 3956.1 GB | 96.6% |
| 91 | 2026-02-18 | 144 | 21 | 315.0 | 277.8 | 3993.3 GB | 97.5% |

### Storage Pressure Days

Days where torrents were skipped due to storage being full:

| Date | Skipped (Storage) | Skipped (Rate) | Disk Usage |
|------|-------------------|----------------|------------|
| 2025-12-11 | 7 | 7 | 4094.3 GB |
| 2025-12-12 | 1 | 7 | 4092.6 GB |
| 2025-12-13 | 1 | 6 | 4078.3 GB |
| 2025-12-18 | 1 | 14 | 4090.1 GB |
| 2025-12-24 | 8 | 11 | 4095.3 GB |
| 2025-12-26 | 11 | 5 | 4087.6 GB |
| 2025-12-31 | 1 | 24 | 4090.3 GB |
| 2026-01-01 | 3 | 7 | 4091.5 GB |
| 2026-01-06 | 5 | 14 | 4095.0 GB |
| 2026-01-08 | 8 | 35 | 4090.7 GB |
| 2026-01-09 | 3 | 10 | 4095.9 GB |
| 2026-01-11 | 3 | 17 | 4093.8 GB |
| 2026-01-13 | 4 | 11 | 4089.7 GB |
| 2026-01-14 | 4 | 3 | 4090.6 GB |
| 2026-01-24 | 13 | 21 | 4095.8 GB |
| 2026-01-25 | 16 | 10 | 4096.0 GB |
| 2026-01-27 | 1 | 19 | 4095.4 GB |
| 2026-01-28 | 13 | 17 | 4096.0 GB |
| 2026-01-30 | 1 | 5 | 4086.8 GB |
| 2026-02-11 | 5 | 7 | 4084.9 GB |

## Configuration Reference

These values can be set via environment variables, a `.env` file, or edited at the top of `analyze_and_generate_filters.py`:

| Variable | Current Value | Description |
|----------|--------------|-------------|
| `STORAGE_TB` | 4.0 | Seedbox storage capacity in TB. Changing this scales all rate limits. |
| `MIN_TORRENT_AGE_DAYS` | 3 | Exclude torrents younger than this from analysis (still accumulating snatches). |
| `MAX_SEED_DAYS` | 10 | Hard delete after this many days. Used for storage budget calculation. |
| `BURST_FACTOR` | 8 | Multiplier for hourly rate limits. Higher = more burst capacity during peak hours. |
| `TARGET_UTILIZATION_PCT` | 85.0 | Target disk utilization %. Simulation verdict uses this as the PASS threshold. |

To regenerate with different storage:

```bash
python3 analyze_and_generate_filters.py freeleech --storage 10
```