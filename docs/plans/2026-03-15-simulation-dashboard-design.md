# Simulation Dashboard Design

**Date:** 2026-03-15
**Status:** Validated

## Purpose

A local web dashboard for building, testing, and validating autobrr filters against real torrent data. Users can load CSV datasets, select or create filters, run FIFO disk simulations, and see per-filter and system-wide performance metrics — all reusing the existing Python analysis and simulation logic.

## Architecture

**Stack:** FastAPI (Python backend) + React (Vite + TypeScript frontend)

- Backend reuses existing simulation engine (`run_simulation`, `_torrent_matches_filter`, scoring, tier logic) from `analyze_and_generate_filters.py`
- All state is file-based — filters as JSON on disk, CSV datasets on disk, no database
- Runs locally only, single user, no auth

**Project structure:**
```
dashboard/
├── backend/
│   ├── main.py              # FastAPI app, API routes
│   ├── simulation.py        # Simulation engine (extracted/adapted from analyze_and_generate_filters.py)
│   ├── filters.py           # Filter CRUD — read/write JSON files
│   ├── datasets.py          # CSV discovery and loading
│   └── models.py            # Pydantic models for filters, simulation config, results
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── FilterManager.tsx    # Browse, create, edit filters
│   │   │   └── SimulationRunner.tsx # Configure and run simulations, view results
│   │   ├── components/
│   │   │   ├── FilterForm.tsx       # Form for creating/editing a filter
│   │   │   ├── FilterList.tsx       # Sidebar list of all filters
│   │   │   ├── MetricsBar.tsx       # Key metrics display
│   │   │   ├── FilterBreakdown.tsx  # Per-filter results table
│   │   │   ├── TimeSeriesChart.tsx  # Reusable chart component
│   │   │   └── DatasetPicker.tsx    # File selector for CSV datasets
│   │   ├── api/
│   │   │   └── client.ts           # API client (fetch wrapper)
│   │   └── types/
│   │       └── index.ts            # TypeScript types matching backend models
│   ├── index.html
│   └── package.json
└── README.md
```

## Views

### Filter Manager

**Layout:**
- Left sidebar: list of all filters (from `autobrr-filters/generated/` and `autobrr-filters/saved/`), grouped by source folder. Each shows name, priority, enabled/disabled badge. Click to select.
- Main area: filter detail/edit form when selected, or "Create Filter" form for new ones.

**Filter form fields** (matching existing filter JSON structure):
- **Name** — text input
- **Priority** — number (higher = matched first in simulation)
- **Delay** — seconds (informational in simulation context, but stored for autobrr export)
- **Size range** — min/max with unit (MB/GB), e.g. "1GB" to "30GB"
- **Max downloads** — number + unit (HOUR/DAY)
- **Resolutions** — multi-select checkboxes: 2160p, 1080p, 720p, 480p, 576p
- **Sources** — multi-select checkboxes: WEB-DL, WEB, WEBRip, BluRay, Remux, HDTV, DVDRip
- **Categories** — text input with glob pattern support (e.g. "Movies*,TV*")
- **Release groups** — text area, comma-separated. Toggle between:
  - Allowlist mode (`match_release_groups`) — only these groups match
  - Blocklist mode (`except_release_groups`) — all groups except these match
- **Exclude patterns** — comma-separated globs for `except_releases` (e.g. `*Olympics*,*Collection*`)
- **Freeleech** — checkbox (default on)
- **Enabled** — toggle

**Actions:**
- Save (writes JSON to `autobrr-filters/saved/`)
- Delete (saved filters only, not generated)
- Duplicate (copy a filter as starting point for a new one)

### Simulation Runner

**Setup section:**
- **Dataset file picker** — select any CSV file from the project directory (torrents_data_freeleech.csv, etc.)
- **Storage (TB)** — number input, defaults from .env
- **Max seed days** — number input, defaults from .env
- **Filter selector** — checklist of all available filters showing name, priority, enabled state. Each has a toggle to include/exclude from simulation. Allows running any subset (e.g. high + medium while building low).
- **"Run Simulation" button**

**Results section:**

**Key Metrics Bar** (top-line numbers, always visible):
- Torrents seen / grabbed (grab rate %)
- Total GB grabbed
- Steady-state disk utilization % (with pass/fail badge against target utilization from .env)
- Blackout days (post-ramp-up days with zero grabs)
- Skip breakdown: no match / rate limited / storage full

**Per-Filter Breakdown Table:**
- Columns: filter name, torrents grabbed, total GB, median size, GB/day
- One row per active filter in the simulation
- Shows each filter's individual contribution to the overall result

**Time-Series Charts:**
- **Disk utilization % over time** — line chart, the primary validation visual. Shows ramp-up period then steady state. Horizontal reference line at target utilization (85%).
- **Daily grabs over time** — bar chart showing torrent count grabbed per day
- **Daily GB in vs expired** — dual line chart showing intake vs expiry, reveals whether the system is in balance

## API Endpoints

```
GET  /api/filters                     # List all filters (generated + saved)
GET  /api/filters/{id}                # Get single filter
POST /api/filters                     # Create new filter (saved to autobrr-filters/saved/)
PUT  /api/filters/{id}                # Update filter
DELETE /api/filters/{id}              # Delete filter (saved only)

GET  /api/datasets                    # List available CSV files
GET  /api/config                      # Get default config (.env values: storage_tb, max_seed_days, etc.)

POST /api/simulation/run              # Run simulation
  Body: {
    dataset_path: string,             # Path to CSV file
    filter_ids: string[],             # Which filters to include
    storage_tb: number,               # Override storage
    max_seed_days: number             # Override seed days
  }
  Returns: {
    total_seen, total_grabbed, total_grabbed_gb, grab_rate_pct,
    steady_state_avg_utilization, steady_state_avg_disk_gb,
    max_storage_gb, blackout_days,
    skip_reasons: {no_match, rate_limited, storage_full},
    per_filter_stats: {name: {count, gb, median_size, gb_per_day}},
    daily_stats: [{day, date, grabbed, grabbed_gb, expired_gb,
                   disk_usage_gb, utilization_pct, ...}],
    filters_used: string[]
  }
```

## Data Flow

1. User opens dashboard, Filter Manager loads all filters from `autobrr-filters/generated/` and `autobrr-filters/saved/`
2. User creates/edits filters in Filter Manager, saves to `autobrr-filters/saved/`
3. User switches to Simulation Runner, picks a CSV dataset and selects which filters to include
4. User adjusts storage/seed day parameters if needed
5. User clicks "Run Simulation"
6. Backend loads CSV using existing `load_csv` logic, loads selected filter JSONs, runs `run_simulation()`
7. Backend returns full simulation results
8. Frontend renders metrics bar, per-filter table, and time-series charts

## Key Design Decisions

- **Reuse existing Python logic** — the simulation engine, filter matching, scoring, and CSV parsing are extracted from `analyze_and_generate_filters.py`, not rewritten
- **File-based persistence** — no database, filters are JSON files, datasets are CSVs
- **Generated filters are read-only** — only user-created filters in `saved/` can be edited/deleted
- **Filter subsets per simulation** — users toggle which filters participate, enabling incremental filter development
- **Instant results** — full simulation runs server-side, results returned in one response
- **No auth, no deployment** — localhost-only personal tool
