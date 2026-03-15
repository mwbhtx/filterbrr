# Simulation Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local web dashboard (FastAPI + React) for creating/editing autobrr filters and running FIFO disk simulations against torrent CSV data.

**Architecture:** Python FastAPI backend that extracts and reuses the existing simulation engine from `analyze_and_generate_filters.py`. React (Vite + TypeScript) frontend with form-based filter editing and chart-based result visualization. All state is file-based (JSON filters on disk, CSV datasets).

**Tech Stack:** Python 3.9+, FastAPI, uvicorn, Pydantic; Node 22, React 18, Vite, TypeScript, Recharts, TailwindCSS

---

### Task 1: Initialize Backend Project

**Files:**
- Create: `dashboard/backend/requirements.txt`
- Create: `dashboard/backend/main.py`

**Step 1: Create requirements.txt**

```
fastapi>=0.104.0
uvicorn>=0.24.0
pydantic>=2.0.0
python-dotenv>=1.0.0
```

**Step 2: Create minimal FastAPI app**

Create `dashboard/backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Torrent Filter Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

**Step 3: Install dependencies and verify**

Run: `cd dashboard/backend && pip install -r requirements.txt`
Run: `python -m uvicorn main:app --port 8000 &`
Run: `curl http://localhost:8000/api/health`
Expected: `{"status":"ok"}`
Kill the server after verification.

**Step 4: Commit**

```bash
git add dashboard/backend/
git commit -m "feat: initialize FastAPI backend with health endpoint"
```

---

### Task 2: Extract Simulation Engine into Backend Module

**Files:**
- Create: `dashboard/backend/simulation.py`

Extract the core functions from `analyze_and_generate_filters.py` (root of repo) into `dashboard/backend/simulation.py`. This is a copy-and-adapt, not an import, because the original script is CLI-oriented with globals.

**Step 1: Create simulation.py**

Copy these functions from `analyze_and_generate_filters.py` into `dashboard/backend/simulation.py`, adapting them to accept parameters instead of using module globals:

- `_parse_size_str(s: str) -> float` (lines 1438-1447) — copy as-is
- `_match_category_pattern(category: str, pattern: str) -> bool` (lines 1450-1454) — copy as-is
- `_match_except_releases(name: str, patterns: str) -> bool` (lines 1457-1464) — copy as-is
- `_torrent_matches_filter(torrent: dict, filt_data: dict) -> bool` (lines 1467-1511) — copy as-is
- `score_torrents(torrents: list[dict]) -> list[dict]` (lines 128-133) — copy as-is
- `load_csv(csv_path: str) -> list[dict]` — adapt from lines 75-121: change to accept an absolute file path instead of a source_key. Remove the SOURCES dict lookup. Keep the `NOW` reference date as a parameter with default.
- `run_simulation(torrents, filter_jsons, storage_tb, max_seed_days) -> dict` — adapt from lines 1514-1715: add `max_seed_days` as a parameter instead of using the global `MAX_SEED_DAYS`.

Important adaptations:
- `load_csv` signature: `def load_csv(csv_path: str, now: datetime | None = None) -> list[dict]`
  - If `now` is None, use `datetime.utcnow()`
  - Don't call `sys.exit()` — raise `FileNotFoundError` instead
- `run_simulation` signature: `def run_simulation(torrents: list[dict], filter_jsons: list[dict], storage_tb: float, max_seed_days: int = 10) -> dict`
  - Replace all references to the global `MAX_SEED_DAYS` with the `max_seed_days` parameter

**Step 2: Verify the module imports cleanly**

Run: `cd dashboard/backend && python -c "from simulation import load_csv, run_simulation, score_torrents; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add dashboard/backend/simulation.py
git commit -m "feat: extract simulation engine from analyze script"
```

---

### Task 3: Pydantic Models

**Files:**
- Create: `dashboard/backend/models.py`

**Step 1: Create models.py**

```python
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
    release_profile_duplicate: str | None = None
    match_release_groups: str = ""
    except_release_groups: str = ""


class Filter(BaseModel):
    name: str
    version: str = "1.0"
    data: FilterData


class SimulationRequest(BaseModel):
    dataset_path: str
    filter_ids: list[str]
    storage_tb: float = 4.0
    max_seed_days: int = 10


class FilterStats(BaseModel):
    count: int
    gb: float
    median_size: float


class DailyStat(BaseModel):
    day: int
    date: str
    grabbed: int
    grabbed_gb: float
    expired_gb: float
    disk_usage_gb: float
    utilization_pct: float
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


class AppConfig(BaseModel):
    storage_tb: float
    max_seed_days: int
    min_torrent_age_days: int
    burst_factor: int
    target_utilization_pct: float
```

**Step 2: Verify models import**

Run: `cd dashboard/backend && python -c "from models import Filter, SimulationRequest, SimulationResult; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add dashboard/backend/models.py
git commit -m "feat: add Pydantic models for filters, simulation, config"
```

---

### Task 4: Filter CRUD Endpoints

**Files:**
- Create: `dashboard/backend/filters.py`
- Modify: `dashboard/backend/main.py`

**Step 1: Create filters.py**

This module manages reading/writing filter JSON files from two directories:
- `autobrr-filters/generated/` — read-only (generated by the analysis script)
- `autobrr-filters/saved/` — read-write (user-created filters)

```python
import json
import uuid
from pathlib import Path

# Root of the torrent-performance-analysis project (two levels up from dashboard/backend/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
GENERATED_DIR = PROJECT_ROOT / "autobrr-filters" / "generated"
SAVED_DIR = PROJECT_ROOT / "autobrr-filters" / "saved"


def _ensure_dirs():
    SAVED_DIR.mkdir(parents=True, exist_ok=True)


def _filter_id_from_path(path: Path) -> str:
    """Generate a stable ID from the filter's relative path."""
    rel = path.relative_to(PROJECT_ROOT / "autobrr-filters")
    return str(rel).replace("/", "__").replace("\\", "__").removesuffix(".json")


def _path_from_id(filter_id: str) -> Path:
    """Convert a filter ID back to a file path."""
    rel = filter_id.replace("__", "/") + ".json"
    return PROJECT_ROOT / "autobrr-filters" / rel


def list_filters() -> list[dict]:
    """List all filters (generated + saved) with their IDs and source."""
    _ensure_dirs()
    filters = []

    for directory, source in [(GENERATED_DIR, "generated"), (SAVED_DIR, "saved")]:
        if not directory.exists():
            continue
        for json_file in sorted(directory.rglob("*.json")):
            try:
                with open(json_file, encoding="utf-8") as f:
                    data = json.load(f)
                data["_id"] = _filter_id_from_path(json_file)
                data["_source"] = source
                filters.append(data)
            except (json.JSONDecodeError, IOError):
                continue

    return filters


def get_filter(filter_id: str) -> dict | None:
    path = _path_from_id(filter_id)
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data["_id"] = filter_id
    data["_source"] = "saved" if "saved" in str(path) else "generated"
    return data


def save_filter(filter_data: dict) -> dict:
    """Save a new filter. Returns the filter with its assigned ID."""
    _ensure_dirs()
    name = filter_data.get("name", f"filter-{uuid.uuid4().hex[:8]}")
    # Sanitize name for filename
    safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in name)
    path = SAVED_DIR / f"{safe_name}.json"

    # Strip internal fields before writing
    to_write = {k: v for k, v in filter_data.items() if not k.startswith("_")}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(to_write, f, indent=4)

    to_write["_id"] = _filter_id_from_path(path)
    to_write["_source"] = "saved"
    return to_write


def update_filter(filter_id: str, filter_data: dict) -> dict | None:
    """Update an existing saved filter."""
    path = _path_from_id(filter_id)
    if not path.exists() or "saved" not in str(path):
        return None
    to_write = {k: v for k, v in filter_data.items() if not k.startswith("_")}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(to_write, f, indent=4)
    to_write["_id"] = filter_id
    to_write["_source"] = "saved"
    return to_write


def delete_filter(filter_id: str) -> bool:
    """Delete a saved filter. Returns False if not found or is generated."""
    path = _path_from_id(filter_id)
    if not path.exists() or "saved" not in str(path):
        return False
    path.unlink()
    return True
```

**Step 2: Add filter routes to main.py**

Add these routes to `dashboard/backend/main.py`:

```python
from fastapi import HTTPException
from filters import list_filters, get_filter, save_filter, update_filter, delete_filter


@app.get("/api/filters")
def api_list_filters():
    return list_filters()


@app.get("/api/filters/{filter_id:path}")
def api_get_filter(filter_id: str):
    f = get_filter(filter_id)
    if f is None:
        raise HTTPException(404, "Filter not found")
    return f


@app.post("/api/filters")
def api_create_filter(body: dict):
    return save_filter(body)


@app.put("/api/filters/{filter_id:path}")
def api_update_filter(filter_id: str, body: dict):
    result = update_filter(filter_id, body)
    if result is None:
        raise HTTPException(404, "Filter not found or is generated (read-only)")
    return result


@app.delete("/api/filters/{filter_id:path}")
def api_delete_filter(filter_id: str):
    if not delete_filter(filter_id):
        raise HTTPException(404, "Filter not found or is generated (read-only)")
    return {"deleted": True}
```

**Step 3: Test filter endpoints manually**

Run: `cd dashboard/backend && python -m uvicorn main:app --port 8000 &`
Run: `curl http://localhost:8000/api/filters | python -m json.tool | head -20`
Expected: JSON array containing the 4 generated freeleech filters
Kill the server.

**Step 4: Commit**

```bash
git add dashboard/backend/filters.py dashboard/backend/main.py
git commit -m "feat: add filter CRUD endpoints"
```

---

### Task 5: Dataset and Config Endpoints

**Files:**
- Create: `dashboard/backend/datasets.py`
- Modify: `dashboard/backend/main.py`

**Step 1: Create datasets.py**

```python
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def list_datasets() -> list[dict]:
    """Find all torrents_data_*.csv files in the project root."""
    datasets = []
    for csv_file in sorted(PROJECT_ROOT.glob("torrents_data_*.csv")):
        datasets.append({
            "name": csv_file.stem,
            "filename": csv_file.name,
            "path": str(csv_file),
            "size_mb": round(csv_file.stat().st_size / (1024 * 1024), 1),
        })
    return datasets
```

**Step 2: Add dataset and config routes to main.py**

```python
import os
from pathlib import Path
from datasets import list_datasets

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _load_env_config() -> dict:
    """Read .env config values."""
    env_path = PROJECT_ROOT / ".env"
    config = {}
    if env_path.exists():
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if "#" in value:
                    value = value[:value.index("#")].strip()
                config[key] = value
    return config


@app.get("/api/datasets")
def api_list_datasets():
    return list_datasets()


@app.get("/api/config")
def api_get_config():
    env = _load_env_config()
    return {
        "storage_tb": float(env.get("STORAGE_TB", "4")),
        "max_seed_days": int(env.get("MAX_SEED_DAYS", "10")),
        "min_torrent_age_days": int(env.get("MIN_TORRENT_AGE_DAYS", "3")),
        "burst_factor": int(env.get("BURST_FACTOR", "8")),
        "target_utilization_pct": float(env.get("TARGET_UTILIZATION_PCT", "85")),
    }
```

**Step 3: Verify endpoints**

Run: `cd dashboard/backend && python -m uvicorn main:app --port 8000 &`
Run: `curl http://localhost:8000/api/datasets | python -m json.tool`
Expected: JSON array with at least `torrents_data_freeleech` entry
Run: `curl http://localhost:8000/api/config | python -m json.tool`
Expected: `{"storage_tb": 4.0, "max_seed_days": 10, ...}`
Kill the server.

**Step 4: Commit**

```bash
git add dashboard/backend/datasets.py dashboard/backend/main.py
git commit -m "feat: add dataset listing and config endpoints"
```

---

### Task 6: Simulation Endpoint

**Files:**
- Modify: `dashboard/backend/main.py`

**Step 1: Add simulation route**

```python
from simulation import load_csv, score_torrents, run_simulation
from models import SimulationRequest
from filters import get_filter


@app.post("/api/simulation/run")
def api_run_simulation(req: SimulationRequest):
    # Load and score torrents
    torrents = load_csv(req.dataset_path)
    torrents = score_torrents(torrents)

    # Load selected filters
    filter_jsons = []
    for fid in req.filter_ids:
        f = get_filter(fid)
        if f is None:
            raise HTTPException(404, f"Filter not found: {fid}")
        # Strip internal fields
        filter_jsons.append({k: v for k, v in f.items() if not k.startswith("_")})

    # Run simulation
    result = run_simulation(torrents, filter_jsons, req.storage_tb, req.max_seed_days)
    return result
```

**Step 2: Test simulation endpoint**

Run: `cd dashboard/backend && python -m uvicorn main:app --port 8000 &`
Run the following curl (get filter IDs first from /api/filters, then run sim):
```bash
# Get filter IDs
curl -s http://localhost:8000/api/filters | python3 -c "import sys,json; [print(f['_id']) for f in json.load(sys.stdin)]"

# Run simulation with high + medium tiers
curl -X POST http://localhost:8000/api/simulation/run \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_path": "'$(pwd)/../../torrents_data_freeleech.csv'",
    "filter_ids": ["generated__freeleech__tier-4-high", "generated__freeleech__tier-3-medium"],
    "storage_tb": 4.0,
    "max_seed_days": 10
  }' | python -m json.tool | head -20
```
Expected: JSON with `total_seen`, `total_grabbed`, `daily_stats`, etc.
Kill the server.

**Step 3: Commit**

```bash
git add dashboard/backend/main.py
git commit -m "feat: add simulation run endpoint"
```

---

### Task 7: Initialize React Frontend

**Files:**
- Create: `dashboard/frontend/` (via Vite scaffolding)

**Step 1: Scaffold React project**

```bash
cd dashboard
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install recharts
npm install -D tailwindcss @tailwindcss/vite
```

**Step 2: Configure Tailwind**

Update `dashboard/frontend/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
```

Replace `dashboard/frontend/src/index.css` with:

```css
@import "tailwindcss";
```

**Step 3: Clean up scaffolded files**

- Delete `src/App.css`
- Replace `src/App.tsx` with:

```tsx
function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-semibold">Torrent Filter Simulator</h1>
      </header>
      <main className="p-6">
        <p className="text-gray-400">Dashboard loading...</p>
      </main>
    </div>
  );
}

export default App;
```

**Step 4: Verify frontend runs**

Run: `cd dashboard/frontend && npm run dev &`
Open: `http://localhost:5173`
Expected: Dark page with "Torrent Filter Simulator" header
Kill the dev server.

**Step 5: Commit**

```bash
git add dashboard/frontend/
git commit -m "feat: scaffold React frontend with Vite, Tailwind, Recharts"
```

---

### Task 8: API Client and TypeScript Types

**Files:**
- Create: `dashboard/frontend/src/types/index.ts`
- Create: `dashboard/frontend/src/api/client.ts`

**Step 1: Create types**

Create `dashboard/frontend/src/types/index.ts`:

```typescript
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
  _source: "generated" | "saved";
}

export interface Dataset {
  name: string;
  filename: string;
  path: string;
  size_mb: number;
}

export interface AppConfig {
  storage_tb: number;
  max_seed_days: number;
  min_torrent_age_days: number;
  burst_factor: number;
  target_utilization_pct: number;
}

export interface SimulationRequest {
  dataset_path: string;
  filter_ids: string[];
  storage_tb: number;
  max_seed_days: number;
}

export interface FilterStats {
  count: number;
  gb: number;
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
}
```

**Step 2: Create API client**

Create `dashboard/frontend/src/api/client.ts`:

```typescript
import type {
  Filter,
  Dataset,
  AppConfig,
  SimulationRequest,
  SimulationResult,
} from "../types";

const BASE = "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  getFilters: () => fetchJSON<Filter[]>("/filters"),
  getFilter: (id: string) => fetchJSON<Filter>(`/filters/${id}`),
  createFilter: (filter: Omit<Filter, "_id" | "_source">) =>
    fetchJSON<Filter>("/filters", {
      method: "POST",
      body: JSON.stringify(filter),
    }),
  updateFilter: (id: string, filter: Omit<Filter, "_id" | "_source">) =>
    fetchJSON<Filter>(`/filters/${id}`, {
      method: "PUT",
      body: JSON.stringify(filter),
    }),
  deleteFilter: (id: string) =>
    fetchJSON<{ deleted: boolean }>(`/filters/${id}`, { method: "DELETE" }),

  getDatasets: () => fetchJSON<Dataset[]>("/datasets"),
  getConfig: () => fetchJSON<AppConfig>("/config"),

  runSimulation: (req: SimulationRequest) =>
    fetchJSON<SimulationResult>("/simulation/run", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};
```

**Step 3: Verify types compile**

Run: `cd dashboard/frontend && npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add dashboard/frontend/src/types/ dashboard/frontend/src/api/
git commit -m "feat: add TypeScript types and API client"
```

---

### Task 9: Filter List Component

**Files:**
- Create: `dashboard/frontend/src/components/FilterList.tsx`

**Step 1: Create FilterList**

```tsx
import type { Filter } from "../types";

interface Props {
  filters: Filter[];
  selectedId: string | null;
  onSelect: (filter: Filter) => void;
  onCreateNew: () => void;
}

export function FilterList({ filters, selectedId, onSelect, onCreateNew }: Props) {
  const generated = filters.filter((f) => f._source === "generated");
  const saved = filters.filter((f) => f._source === "saved");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Filters</h2>
        <button
          onClick={onCreateNew}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {generated.length > 0 && (
          <div>
            <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide">Generated</div>
            {generated.map((f) => (
              <FilterItem key={f._id} filter={f} selected={f._id === selectedId} onSelect={onSelect} />
            ))}
          </div>
        )}
        {saved.length > 0 && (
          <div>
            <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide">Saved</div>
            {saved.map((f) => (
              <FilterItem key={f._id} filter={f} selected={f._id === selectedId} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterItem({ filter, selected, onSelect }: { filter: Filter; selected: boolean; onSelect: (f: Filter) => void }) {
  return (
    <button
      onClick={() => onSelect(filter)}
      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-800 ${
        selected ? "bg-gray-800 border-l-2 border-blue-500" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="truncate">{filter.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${filter.data.enabled ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}>
          {filter.data.enabled ? "ON" : "OFF"}
        </span>
      </div>
      <div className="text-xs text-gray-500 mt-0.5">
        Priority {filter.data.priority} · {filter.data.max_downloads}/{filter.data.max_downloads_unit.toLowerCase()}
      </div>
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/frontend/src/components/FilterList.tsx
git commit -m "feat: add FilterList sidebar component"
```

---

### Task 10: Filter Form Component

**Files:**
- Create: `dashboard/frontend/src/components/FilterForm.tsx`

**Step 1: Create FilterForm**

This is the form for creating and editing filters. All fields match the autobrr filter JSON structure.

```tsx
import { useState, useEffect } from "react";
import type { Filter, FilterData } from "../types";

const ALL_RESOLUTIONS = ["2160p", "1080p", "720p", "480p", "576p"];
const ALL_SOURCES = ["WEB-DL", "WEB", "WEBRip", "BluRay", "Remux", "HDTV", "DVDRip"];

function defaultFilterData(): FilterData {
  return {
    enabled: true,
    min_size: "1GB",
    max_size: "30GB",
    delay: 5,
    priority: 1,
    max_downloads: 5,
    max_downloads_unit: "HOUR",
    except_releases: "*Olympics*,*Collection*,*Mega*,*Filmography*",
    announce_types: ["NEW"],
    freeleech: true,
    resolutions: ["1080p"],
    sources: ["WEB-DL", "WEB", "WEBRip"],
    match_categories: "Movies*,TV*",
    is_auto_updated: false,
    release_profile_duplicate: null,
    match_release_groups: "",
    except_release_groups: "",
  };
}

interface Props {
  filter: Filter | null; // null = creating new
  readOnly: boolean;
  onSave: (filter: Omit<Filter, "_id" | "_source">) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

export function FilterForm({ filter, readOnly, onSave, onDelete, onDuplicate }: Props) {
  const [name, setName] = useState("");
  const [data, setData] = useState<FilterData>(defaultFilterData());
  const [groupMode, setGroupMode] = useState<"allowlist" | "blocklist">("blocklist");

  useEffect(() => {
    if (filter) {
      setName(filter.name);
      setData({ ...filter.data });
      setGroupMode(filter.data.match_release_groups ? "allowlist" : "blocklist");
    } else {
      setName("");
      setData(defaultFilterData());
      setGroupMode("blocklist");
    }
  }, [filter]);

  const updateData = (partial: Partial<FilterData>) => setData((prev) => ({ ...prev, ...partial }));

  const toggleInList = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const handleSave = () => {
    const finalData = { ...data };
    if (groupMode === "allowlist") {
      finalData.except_release_groups = "";
    } else {
      finalData.match_release_groups = "";
    }
    onSave({ name, version: filter?.version ?? "1.0", data: finalData });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{filter ? filter.name : "New Filter"}</h2>
        <div className="flex gap-2">
          {onDuplicate && (
            <button onClick={onDuplicate} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1 rounded">
              Duplicate
            </button>
          )}
          {onDelete && !readOnly && (
            <button onClick={onDelete} className="text-xs bg-red-900 hover:bg-red-800 text-red-200 px-3 py-1 rounded">
              Delete
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="text-xs text-amber-400 bg-amber-950 border border-amber-800 rounded px-3 py-2">
          Generated filter — read-only. Duplicate to create an editable copy.
        </div>
      )}

      {/* Name */}
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm disabled:opacity-50"
        />
      </Field>

      {/* Enabled + Freeleech */}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={data.enabled} onChange={(e) => updateData({ enabled: e.target.checked })} disabled={readOnly} />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={data.freeleech} onChange={(e) => updateData({ freeleech: e.target.checked })} disabled={readOnly} />
          Freeleech only
        </label>
      </div>

      {/* Priority + Delay */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Priority (higher = first)">
          <input type="number" value={data.priority} onChange={(e) => updateData({ priority: parseInt(e.target.value) || 0 })} disabled={readOnly} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm disabled:opacity-50" />
        </Field>
        <Field label="Delay (seconds)">
          <input type="number" value={data.delay} onChange={(e) => updateData({ delay: parseInt(e.target.value) || 0 })} disabled={readOnly} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm disabled:opacity-50" />
        </Field>
      </div>

      {/* Size range */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Min size">
          <input value={data.min_size} onChange={(e) => updateData({ min_size: e.target.value })} disabled={readOnly} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm disabled:opacity-50" />
        </Field>
        <Field label="Max size">
          <input value={data.max_size} onChange={(e) => updateData({ max_size: e.target.value })} disabled={readOnly} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm disabled:opacity-50" />
        </Field>
      </div>

      {/* Rate limit */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Max downloads">
          <input type="number" value={data.max_downloads} onChange={(e) => updateData({ max_downloads: parseInt(e.target.value) || 1 })} disabled={readOnly} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm disabled:opacity-50" />
        </Field>
        <Field label="Per">
          <select value={data.max_downloads_unit} onChange={(e) => updateData({ max_downloads_unit: e.target.value })} disabled={readOnly} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm disabled:opacity-50">
            <option value="HOUR">Hour</option>
            <option value="DAY">Day</option>
          </select>
        </Field>
      </div>

      {/* Resolutions */}
      <Field label="Resolutions">
        <div className="flex flex-wrap gap-2">
          {ALL_RESOLUTIONS.map((r) => (
            <label key={r} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={data.resolutions.includes(r)} onChange={() => updateData({ resolutions: toggleInList(data.resolutions, r) })} disabled={readOnly} />
              {r}
            </label>
          ))}
        </div>
      </Field>

      {/* Sources */}
      <Field label="Sources">
        <div className="flex flex-wrap gap-2">
          {ALL_SOURCES.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={data.sources.includes(s)} onChange={() => updateData({ sources: toggleInList(data.sources, s) })} disabled={readOnly} />
              {s}
            </label>
          ))}
        </div>
      </Field>

      {/* Categories */}
      <Field label="Match categories (comma-separated, glob patterns)">
        <input value={data.match_categories} onChange={(e) => updateData({ match_categories: e.target.value })} disabled={readOnly} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm disabled:opacity-50" />
      </Field>

      {/* Release groups */}
      <Field label="Release groups">
        <div className="flex gap-4 mb-2">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" name="group-mode" checked={groupMode === "allowlist"} onChange={() => setGroupMode("allowlist")} disabled={readOnly} />
            Allowlist (only match these)
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" name="group-mode" checked={groupMode === "blocklist"} onChange={() => setGroupMode("blocklist")} disabled={readOnly} />
            Blocklist (match all except these)
          </label>
        </div>
        <textarea
          value={groupMode === "allowlist" ? data.match_release_groups : data.except_release_groups}
          onChange={(e) =>
            groupMode === "allowlist"
              ? updateData({ match_release_groups: e.target.value })
              : updateData({ except_release_groups: e.target.value })
          }
          disabled={readOnly}
          rows={3}
          placeholder="Comma-separated group names..."
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono disabled:opacity-50"
        />
      </Field>

      {/* Exclude patterns */}
      <Field label="Exclude releases (comma-separated glob patterns)">
        <input value={data.except_releases} onChange={(e) => updateData({ except_releases: e.target.value })} disabled={readOnly} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm disabled:opacity-50" />
      </Field>

      {/* Save button */}
      {!readOnly && (
        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm">
          Save Filter
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/frontend/src/components/FilterForm.tsx
git commit -m "feat: add FilterForm component with all filter fields"
```

---

### Task 11: Filter Manager Page

**Files:**
- Create: `dashboard/frontend/src/pages/FilterManager.tsx`

**Step 1: Create FilterManager page**

```tsx
import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { Filter } from "../types";
import { FilterList } from "../components/FilterList";
import { FilterForm } from "../components/FilterForm";

export function FilterManager() {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [selected, setSelected] = useState<Filter | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFilters = useCallback(async () => {
    try {
      const data = await api.getFilters();
      setFilters(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const handleSelect = (filter: Filter) => {
    setSelected(filter);
    setCreating(false);
  };

  const handleCreateNew = () => {
    setSelected(null);
    setCreating(true);
  };

  const handleSave = async (filterData: Omit<Filter, "_id" | "_source">) => {
    try {
      if (selected && selected._source === "saved") {
        await api.updateFilter(selected._id, filterData);
      } else {
        await api.createFilter(filterData);
      }
      await loadFilters();
      setCreating(false);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      await api.deleteFilter(selected._id);
      setSelected(null);
      await loadFilters();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDuplicate = () => {
    if (!selected) return;
    setCreating(true);
    // selected stays set so FilterForm gets pre-populated, but creating=true means save creates new
    setSelected({
      ...selected,
      name: `${selected.name}-copy`,
      _id: "",
      _source: "saved",
    });
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <div className="w-72 border-r border-gray-800 flex-shrink-0">
        <FilterList
          filters={filters}
          selectedId={selected?._id ?? null}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
        />
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        {error && (
          <div className="text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2 mb-4 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}
        {(selected || creating) ? (
          <FilterForm
            filter={creating && !selected?._id ? null : selected}
            readOnly={selected?._source === "generated" && !creating}
            onSave={handleSave}
            onDelete={selected?._source === "saved" ? handleDelete : undefined}
            onDuplicate={selected ? handleDuplicate : undefined}
          />
        ) : (
          <div className="text-gray-500 text-sm">Select a filter or create a new one.</div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/frontend/src/pages/FilterManager.tsx
git commit -m "feat: add FilterManager page with CRUD operations"
```

---

### Task 12: Metrics and Chart Components

**Files:**
- Create: `dashboard/frontend/src/components/MetricsBar.tsx`
- Create: `dashboard/frontend/src/components/FilterBreakdown.tsx`
- Create: `dashboard/frontend/src/components/TimeSeriesChart.tsx`

**Step 1: Create MetricsBar**

```tsx
import type { SimulationResult } from "../types";

interface Props {
  result: SimulationResult;
  targetUtilization: number;
}

export function MetricsBar({ result, targetUtilization }: Props) {
  const pass = result.steady_state_avg_utilization >= targetUtilization && result.blackout_days === 0;
  const skips = result.skip_reasons;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Metric label="Grabbed" value={`${result.total_grabbed.toLocaleString()} / ${result.total_seen.toLocaleString()}`} sub={`${result.grab_rate_pct}% grab rate`} />
      <Metric label="Total GB" value={`${result.total_grabbed_gb.toLocaleString()} GB`} sub={`over ${result.total_days} days`} />
      <Metric
        label="Disk Utilization"
        value={`${result.steady_state_avg_utilization}%`}
        sub={`${result.steady_state_avg_disk_gb.toLocaleString()} / ${result.max_storage_gb.toLocaleString()} GB`}
        badge={pass ? "PASS" : "FAIL"}
        badgeColor={pass ? "green" : "red"}
      />
      <Metric label="Blackout Days" value={String(result.blackout_days)} sub={`no-match: ${skips.no_match ?? 0} · rate: ${skips.rate_limited ?? 0} · full: ${skips.storage_full ?? 0}`} />
    </div>
  );
}

function Metric({ label, value, sub, badge, badgeColor }: {
  label: string; value: string; sub: string; badge?: string; badgeColor?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">{value}</span>
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
            badgeColor === "green" ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"
          }`}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}
```

**Step 2: Create FilterBreakdown**

```tsx
import type { SimulationResult } from "../types";

interface Props {
  result: SimulationResult;
}

export function FilterBreakdown({ result }: Props) {
  const totalDays = Math.max(1, result.total_days);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300">Per-Filter Breakdown</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase">
            <th className="px-4 py-2">Filter</th>
            <th className="px-4 py-2 text-right">Torrents</th>
            <th className="px-4 py-2 text-right">Total GB</th>
            <th className="px-4 py-2 text-right">Median Size</th>
            <th className="px-4 py-2 text-right">GB/Day</th>
          </tr>
        </thead>
        <tbody>
          {result.filters_used.map((name) => {
            const stats = result.per_filter_stats[name];
            if (!stats) return null;
            return (
              <tr key={name} className="border-t border-gray-800 hover:bg-gray-800/50">
                <td className="px-4 py-2 font-mono text-xs">{name}</td>
                <td className="px-4 py-2 text-right">{stats.count}</td>
                <td className="px-4 py-2 text-right">{stats.gb.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{stats.median_size} GB</td>
                <td className="px-4 py-2 text-right">{(stats.gb / totalDays).toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 3: Create TimeSeriesChart**

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar } from "recharts";
import type { DailyStat } from "../types";

interface UtilizationChartProps {
  dailyStats: DailyStat[];
  targetPct: number;
}

export function UtilizationChart({ dailyStats, targetPct }: UtilizationChartProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Disk Utilization Over Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={dailyStats}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }} labelStyle={{ color: "#9CA3AF" }} />
          <ReferenceLine y={targetPct} stroke="#F59E0B" strokeDasharray="5 5" label={{ value: `Target ${targetPct}%`, fill: "#F59E0B", fontSize: 11 }} />
          <Line type="monotone" dataKey="utilization_pct" stroke="#3B82F6" strokeWidth={2} dot={false} name="Utilization %" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface DailyGrabsChartProps {
  dailyStats: DailyStat[];
}

export function DailyGrabsChart({ dailyStats }: DailyGrabsChartProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Daily Grabs</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={dailyStats}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} />
          <Tooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }} labelStyle={{ color: "#9CA3AF" }} />
          <Bar dataKey="grabbed" fill="#3B82F6" name="Torrents grabbed" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface GBFlowChartProps {
  dailyStats: DailyStat[];
}

export function GBFlowChart({ dailyStats }: GBFlowChartProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Daily GB In vs Expired</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={dailyStats}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={(v) => `${v}GB`} />
          <Tooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }} labelStyle={{ color: "#9CA3AF" }} />
          <Line type="monotone" dataKey="grabbed_gb" stroke="#10B981" strokeWidth={2} dot={false} name="GB In" />
          <Line type="monotone" dataKey="expired_gb" stroke="#EF4444" strokeWidth={2} dot={false} name="GB Expired" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add dashboard/frontend/src/components/MetricsBar.tsx dashboard/frontend/src/components/FilterBreakdown.tsx dashboard/frontend/src/components/TimeSeriesChart.tsx
git commit -m "feat: add MetricsBar, FilterBreakdown, and chart components"
```

---

### Task 13: Simulation Runner Page

**Files:**
- Create: `dashboard/frontend/src/pages/SimulationRunner.tsx`

**Step 1: Create SimulationRunner page**

```tsx
import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Filter, Dataset, AppConfig, SimulationResult } from "../types";
import { MetricsBar } from "../components/MetricsBar";
import { FilterBreakdown } from "../components/FilterBreakdown";
import { UtilizationChart, DailyGrabsChart, GBFlowChart } from "../components/TimeSeriesChart";

export function SimulationRunner() {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [selectedFilterIds, setSelectedFilterIds] = useState<Set<string>>(new Set());
  const [storageTb, setStorageTb] = useState(4);
  const [maxSeedDays, setMaxSeedDays] = useState(10);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getFilters(), api.getDatasets(), api.getConfig()]).then(
      ([f, d, c]) => {
        setFilters(f);
        setDatasets(d);
        setConfig(c);
        setStorageTb(c.storage_tb);
        setMaxSeedDays(c.max_seed_days);
        if (d.length > 0) setSelectedDataset(d[0].path);
        // Pre-select all enabled filters
        const enabled = new Set(f.filter((x) => x.data.enabled).map((x) => x._id));
        setSelectedFilterIds(enabled);
      }
    );
  }, []);

  const toggleFilter = (id: string) => {
    setSelectedFilterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runSimulation = async () => {
    if (!selectedDataset || selectedFilterIds.size === 0) return;
    setRunning(true);
    setError(null);
    try {
      const res = await api.runSimulation({
        dataset_path: selectedDataset,
        filter_ids: Array.from(selectedFilterIds),
        storage_tb: storageTb,
        max_seed_days: maxSeedDays,
      });
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Setup Section */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Simulation Setup</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Dataset</label>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            >
              {datasets.map((d) => (
                <option key={d.path} value={d.path}>
                  {d.filename} ({d.size_mb} MB)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Storage (TB)</label>
            <input
              type="number"
              step="0.5"
              value={storageTb}
              onChange={(e) => setStorageTb(parseFloat(e.target.value) || 0)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Max seed days</label>
            <input
              type="number"
              value={maxSeedDays}
              onChange={(e) => setMaxSeedDays(parseInt(e.target.value) || 1)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Filter selection */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Filters to include</label>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filters
              .sort((a, b) => b.data.priority - a.data.priority)
              .map((f) => (
                <label key={f._id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-800">
                  <input
                    type="checkbox"
                    checked={selectedFilterIds.has(f._id)}
                    onChange={() => toggleFilter(f._id)}
                  />
                  <span className="flex-1">{f.name}</span>
                  <span className="text-xs text-gray-500">P{f.data.priority}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${f._source === "generated" ? "bg-gray-700 text-gray-400" : "bg-blue-900 text-blue-300"}`}>
                    {f._source}
                  </span>
                </label>
              ))}
          </div>
        </div>

        <button
          onClick={runSimulation}
          disabled={running || !selectedDataset || selectedFilterIds.size === 0}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2 rounded text-sm font-medium"
        >
          {running ? "Running..." : "Run Simulation"}
        </button>
      </div>

      {error && (
        <div className="text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Results Section */}
      {result && (
        <>
          <MetricsBar result={result} targetUtilization={config?.target_utilization_pct ?? 85} />
          <FilterBreakdown result={result} />
          <UtilizationChart dailyStats={result.daily_stats} targetPct={config?.target_utilization_pct ?? 85} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DailyGrabsChart dailyStats={result.daily_stats} />
            <GBFlowChart dailyStats={result.daily_stats} />
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/frontend/src/pages/SimulationRunner.tsx
git commit -m "feat: add SimulationRunner page with setup form and results display"
```

---

### Task 14: Wire Up App Routing

**Files:**
- Modify: `dashboard/frontend/src/App.tsx`

**Step 1: Update App.tsx with tab navigation**

```tsx
import { useState } from "react";
import { FilterManager } from "./pages/FilterManager";
import { SimulationRunner } from "./pages/SimulationRunner";

type Tab = "simulation" | "filters";

function App() {
  const [tab, setTab] = useState<Tab>("simulation");

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Torrent Filter Simulator</h1>
        <nav className="flex gap-1">
          <TabButton label="Simulation" active={tab === "simulation"} onClick={() => setTab("simulation")} />
          <TabButton label="Filters" active={tab === "filters"} onClick={() => setTab("filters")} />
        </nav>
      </header>
      <main className={tab === "filters" ? "" : "p-6"}>
        {tab === "simulation" && <SimulationRunner />}
        {tab === "filters" && <FilterManager />}
      </main>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded text-sm ${
        active ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

export default App;
```

**Step 2: Verify the app compiles**

Run: `cd dashboard/frontend && npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add dashboard/frontend/src/App.tsx
git commit -m "feat: wire up tab navigation between Simulation and Filters views"
```

---

### Task 15: End-to-End Smoke Test

**Step 1: Start backend**

```bash
cd dashboard/backend && pip install -r requirements.txt && python -m uvicorn main:app --port 8000 --reload &
```

**Step 2: Start frontend**

```bash
cd dashboard/frontend && npm install && npm run dev &
```

**Step 3: Manual verification checklist**

Open `http://localhost:5173` and verify:

1. Simulation tab loads, dataset dropdown shows `torrents_data_freeleech.csv`
2. Filters checklist shows the 4 generated tier filters
3. Storage defaults to 4.0 TB, seed days to 10
4. Select high + medium filters, click "Run Simulation"
5. Results appear: metrics bar, per-filter table, 3 charts
6. Disk utilization chart shows ramp-up then steady state
7. Switch to Filters tab — sidebar shows 4 generated filters
8. Click a generated filter — form shows all fields, read-only badge visible
9. Click "Duplicate" — form becomes editable with "-copy" suffix
10. Modify a field and click "Save" — filter appears under "Saved" in sidebar
11. Switch back to Simulation — new saved filter appears in filter checklist

**Step 4: Fix any issues found**

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address smoke test issues"
```

---

### Task 16: Startup Script

**Files:**
- Create: `dashboard/start.sh`

**Step 1: Create startup script**

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting backend..."
cd "$SCRIPT_DIR/backend"
pip install -q -r requirements.txt
python -m uvicorn main:app --port 8000 --reload &
BACKEND_PID=$!

echo "Starting frontend..."
cd "$SCRIPT_DIR/frontend"
npm install --silent
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Dashboard running at http://localhost:5173"
echo "Backend API at http://localhost:8000"
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
```

**Step 2: Make executable**

```bash
chmod +x dashboard/start.sh
```

**Step 3: Commit**

```bash
git add dashboard/start.sh
git commit -m "feat: add dashboard startup script"
```
