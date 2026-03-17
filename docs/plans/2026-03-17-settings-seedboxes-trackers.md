# Settings Restructure: Trackers, Seedboxes, Remove .env

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all configuration out of `.env` into the settings page — add tracker credentials (generic list, only TorrentLeech scraper implemented), seedbox profiles (name + storage TB), and wire seedbox selection into the simulator toolbar. Delete `.env` dependency entirely.

**Architecture:** The existing `.settings.json` file expands to hold trackers and seedboxes as arrays alongside the existing autobrr fields. The settings API becomes a single unified model. The frontend settings page gets three sections: Trackers, Seedboxes, Autobrr. The simulator toolbar adds a seedbox dropdown. The scrape pipeline reads tracker credentials from settings instead of env vars. `STORAGE_TB` comes from selected seedbox; `MAX_SEED_DAYS` is renamed to `avg_seed_days` and stays as a per-run simulation parameter.

**Tech Stack:** Python/FastAPI backend, React/TypeScript/Tailwind frontend, Pydantic models.

---

### Task 1: Expand Backend Settings Model

Add tracker and seedbox entities to the settings service. The settings model becomes unified with all config.

**Files:**
- Modify: `dashboard/backend/settings_service.py`
- Modify: `dashboard/backend/models.py`

**Step 1: Update settings_service.py**

Replace the current `AutobrrSettings` model with a unified `Settings` model:

```python
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field


SETTINGS_FILE = Path(__file__).resolve().parent / ".settings.json"


# Supported tracker types — only these appear in the "Add Tracker" dropdown.
# Each type can only be added once.
SUPPORTED_TRACKERS = ["TorrentLeech"]


class Tracker(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    tracker_type: str = ""  # Must be one of SUPPORTED_TRACKERS
    username: str = ""
    password: str = ""


class Seedbox(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    name: str = ""
    storage_tb: float = 4.0


class Settings(BaseModel):
    # Autobrr
    autobrr_url: str = ""
    autobrr_api_key: str = ""
    # Trackers
    trackers: list[Tracker] = Field(default_factory=list)
    # Seedboxes
    seedboxes: list[Seedbox] = Field(default_factory=list)


# Keep backward-compatible alias for autobrr-specific code
AutobrrSettings = Settings


def _load() -> dict:
    if SETTINGS_FILE.exists():
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save(data: dict) -> None:
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_settings() -> Settings:
    raw = _load()
    return Settings(**raw)


def update_settings(settings: Settings) -> Settings:
    _save(settings.model_dump())
    return settings


def get_autobrr_credentials() -> tuple[str, str]:
    """Return (url, api_key). Raises ValueError if not configured."""
    s = get_settings()
    if not s.autobrr_url or not s.autobrr_api_key:
        raise ValueError("Autobrr connection not configured")
    return s.autobrr_url.rstrip("/"), s.autobrr_api_key


def get_tracker(tracker_id: str) -> Optional[Tracker]:
    """Return a tracker by ID."""
    s = get_settings()
    for t in s.trackers:
        if t.id == tracker_id:
            return t
    return None


def get_tracker_by_type(tracker_type: str) -> Optional[Tracker]:
    """Return a tracker by type (e.g. 'TorrentLeech')."""
    s = get_settings()
    for t in s.trackers:
        if t.tracker_type == tracker_type:
            return t
    return None


def get_seedbox(seedbox_id: str) -> Optional[Seedbox]:
    """Return a seedbox by ID."""
    s = get_settings()
    for sb in s.seedboxes:
        if sb.id == seedbox_id:
            return sb
    return None
```

**Step 2: Verify imports still work**

The existing code imports `AutobrrSettings` and `get_settings` from this module. The `AutobrrSettings = Settings` alias keeps backward compatibility. Check that `main.py`, `autobrr_service.py`, and `sync_service.py` still import fine.

---

### Task 2: Update Backend API Endpoints

Update the settings endpoints to handle the expanded model with masking for sensitive fields. Add the `/api/config` endpoint removal and tracker credential lookup for scraping.

**Files:**
- Modify: `dashboard/backend/main.py`
- Modify: `dashboard/backend/pipeline.py`

**Step 1: Update masking in main.py**

Replace `_mask_settings` to mask both autobrr API key and tracker passwords:

```python
def _mask_settings(s: Settings) -> dict:
    masked = s.model_dump()
    # Mask autobrr API key
    if masked["autobrr_api_key"]:
        key = masked["autobrr_api_key"]
        masked["autobrr_api_key"] = key[:4] + "****" + key[-4:] if len(key) > 8 else "****"
    # Mask tracker passwords
    for tracker in masked.get("trackers", []):
        if tracker.get("password"):
            pw = tracker["password"]
            tracker["password"] = pw[:2] + "****" + pw[-2:] if len(pw) > 6 else "****"
    return masked
```

**Step 2: Update settings PUT to preserve masked values**

```python
@app.put("/api/settings")
def api_update_settings(body: Settings):
    old = get_settings()
    # Preserve masked autobrr API key
    if "****" in body.autobrr_api_key:
        body.autobrr_api_key = old.autobrr_api_key
    # Preserve masked tracker passwords
    old_trackers = {t.id: t for t in old.trackers}
    for tracker in body.trackers:
        if "****" in tracker.password:
            old_t = old_trackers.get(tracker.id)
            if old_t:
                tracker.password = old_t.password
    return _mask_settings(update_settings(body))
```

**Step 3: Update autobrr test connection endpoint**

The `api_autobrr_status_test` endpoint currently takes `AutobrrSettings` as body. Since `AutobrrSettings` is now aliased to `Settings`, update it to accept a simpler body or keep the full settings body. Simplest: create a small model just for the test endpoint:

```python
from pydantic import BaseModel

class AutobrrTestRequest(BaseModel):
    autobrr_url: str
    autobrr_api_key: str

@app.post("/api/autobrr/status")
def api_autobrr_status_test(body: AutobrrTestRequest):
    api_key = body.autobrr_api_key
    if "****" in api_key:
        saved = get_settings()
        api_key = saved.autobrr_api_key
    return test_connection(url=body.autobrr_url, api_key=api_key)
```

**Step 4: Remove `_load_env_config` and `/api/config` endpoint**

Delete the `_load_env_config()` function (lines 28-44) and the `/api/config` endpoint (lines 121-130) from `main.py`. The config values are no longer needed — `storage_tb` comes from the selected seedbox, and `avg_seed_days`/`avg_ratio` are per-run UI inputs with hardcoded defaults.

Also remove the `STORAGE_TB`/`MAX_SEED_DAYS` references from the imports at the top if any.

**Step 5: Update pipeline.py to inject tracker credentials**

Modify `start_scrape` to accept a `tracker_id` parameter and inject credentials:

```python
from settings_service import get_tracker

def start_scrape(category: str, days: int = 30, start_page: int = 1,
                 delay: float = 1.0, tracker_id: str | None = None) -> Job:
    scrape_cmd = [
        sys.executable, "-u", "scraper.py", category,
        "--days", str(days), "--start-page", str(start_page),
        "--delay", str(delay),
    ]
    parse_cmd = [sys.executable, "-u", "parse_and_analyze.py", category]
    job = Job(id=uuid.uuid4().hex[:12], command=f"scrape+parse {category}")
    _jobs[job.id] = job

    # Build env with tracker credentials
    env = _unbuffered_env()
    if tracker_id:
        tracker = get_tracker(tracker_id)
        if tracker:
            if tracker.username:
                env["TL_USERNAME"] = tracker.username
            if tracker.password:
                env["TL_PASSWORD"] = tracker.password

    threading.Thread(
        target=_run_chained_job_with_env,
        args=(job, [scrape_cmd, parse_cmd], PROJECT_ROOT, env),
        daemon=True,
    ).start()
    return job
```

Add `_run_chained_job_with_env` variant (or modify `_run_chained_job` to accept an optional `env` parameter):

```python
def _run_chained_job(job: Job, commands: list[list[str]], cwd: Path,
                     env: dict | None = None):
    """Run multiple commands in sequence, stopping on first failure."""
    if env is None:
        env = _unbuffered_env()
    try:
        for cmd in commands:
            job.output_lines.append(f">>> {' '.join(cmd)}")
            proc = subprocess.Popen(
                cmd, cwd=str(cwd), stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, bufsize=1, env=env,
            )
            for line in proc.stdout:
                job.output_lines.append(line.rstrip("\n"))
            proc.wait()
            if proc.returncode != 0:
                job.return_code = proc.returncode
                job.status = "failed"
                return
        job.return_code = 0
        job.status = "completed"
    except Exception as e:
        job.output_lines.append(f"ERROR: {e}")
        job.status = "failed"
        job.return_code = -1
```

**Step 6: Update scrape API endpoint to accept tracker_id**

In `main.py`, update the scrape endpoint:

```python
@app.post("/api/pipeline/scrape")
def api_scrape(req: ScrapeRequest):
    job = start_scrape(req.category, req.days, req.start_page, req.delay,
                       tracker_id=req.tracker_id)
    return {"job_id": job.id}
```

Update `ScrapeRequest` in `models.py` to include `tracker_id`:

```python
class ScrapeRequest(BaseModel):
    category: str
    days: int = 30
    start_page: int = 1
    delay: float = 1.0
    tracker_id: str | None = None
```

---

### Task 3: Update Frontend Types and API Client

Add the new types and update the API client for the expanded settings model.

**Files:**
- Modify: `dashboard/frontend/src/types/index.ts`
- Modify: `dashboard/frontend/src/api/client.ts`

**Step 1: Add Tracker and Seedbox types, update Settings type**

In `types/index.ts`, replace `AutobrrSettings` and add new types:

```typescript
// Supported tracker types — the "Add Tracker" dropdown only shows these.
// Each type can only be added once.
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

// Keep old name for backward compat in existing code
export type AutobrrSettings = Settings;
```

Also update `ScrapeRequest` to include `tracker_id`:

```typescript
export interface ScrapeRequest {
  category: string;
  days: number;
  start_page: number;
  delay: number;
  tracker_id?: string;
}
```

Remove `AppConfig` interface — it's no longer served by the backend.

**Step 2: Update API client**

In `client.ts`, update imports and the settings/config methods:

- Remove `AppConfig` import
- Change `AutobrrSettings` import to `Settings` (or keep both via the type alias)
- Remove `getConfig` method
- Update `getSettings` and `updateSettings` to use `Settings` type
- Update `testAutobrrConnection` to send only `{ autobrr_url, autobrr_api_key }` instead of full settings

```typescript
getSettings: () => fetchJSON<Settings>("/settings"),
updateSettings: (settings: Settings) =>
  fetchJSON<Settings>("/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  }),
testAutobrrConnection: (settings: { autobrr_url: string; autobrr_api_key: string }) =>
  fetchJSON<AutobrrConnectionStatus>("/autobrr/status", {
    method: "POST",
    body: JSON.stringify(settings),
  }),
```

---

### Task 4: Rewrite Settings Page with Three Sections

Rewrite the Settings page to show Trackers, Seedboxes, and Autobrr Connection sections.

**Files:**
- Modify: `dashboard/frontend/src/components/SettingsPage.tsx`

**Step 1: Rewrite SettingsPage**

The new settings page loads the full `Settings` object and renders three sections. Each section manages its own inline add/edit forms. All changes save to the same unified settings object.

Key behaviors:
- **Trackers section**: List of tracker cards. Each shows tracker type + username (password masked). "Add Tracker" button shows a dropdown of `SUPPORTED_TRACKERS` — only tracker types not already configured are shown. If all supported trackers are already added, the button is disabled. Each tracker type can only exist once. Each card has edit/delete buttons.
- **Seedboxes section**: List of seedbox cards. Each shows name + storage TB. "Add Seedbox" shows inline form with name, storage_tb. Edit/delete on each.
- **Autobrr section**: Unchanged — URL, API key, test connection, save.

The save flow: each section has its own save button that saves the full settings object (so trackers save doesn't require re-entering autobrr key). When saving, masked passwords are sent back and the backend preserves the real values.

The page should use a shared card/form pattern. Each entity (tracker, seedbox) is shown as a compact card in a list. Clicking "Edit" toggles the card to an inline edit form. "Add" appends a new blank form at the bottom.

For the Autobrr section, the test connection button sends only `{ autobrr_url, autobrr_api_key }` (not the full settings).

---

### Task 5: Add Seedbox Dropdown to Simulator Toolbar

Add a seedbox selector to the SimulatorToolbar and wire it through App.tsx. Remove "Max Storage (TB)" from Simulation Setup since it comes from the seedbox.

**Files:**
- Modify: `dashboard/frontend/src/components/PipelinePanel.tsx` (SimulatorToolbar)
- Modify: `dashboard/frontend/src/App.tsx`

**Step 1: Update SimulatorToolbar props and UI**

Add seedbox props:

```typescript
interface SimulatorToolbarProps {
  datasets: Dataset[];
  selectedDataset: string;
  onDatasetChange: (path: string) => void;
  seedboxes: Seedbox[];
  selectedSeedboxId: string;
  onSeedboxChange: (id: string) => void;
  onDataChanged: () => void;
}
```

Remove `storageTb` prop — derive it from the selected seedbox internally.

Add a seedbox dropdown next to the dataset dropdown:

```tsx
<div className="flex items-center gap-3">
  <div className="flex-1 min-w-0">
    <label className="block text-xs text-gray-400 mb-1">Dataset</label>
    <select ...>{/* dataset options */}</select>
  </div>
  <div className="flex-1 min-w-0">
    <label className="block text-xs text-gray-400 mb-1">Seedbox</label>
    <select
      value={selectedSeedboxId}
      onChange={(e) => onSeedboxChange(e.target.value)}
      disabled={generating}
      className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 disabled:opacity-50"
    >
      {seedboxes.length === 0 && <option value="">No seedboxes configured</option>}
      {seedboxes.map((sb) => (
        <option key={sb.id} value={sb.id}>
          {sb.name} ({sb.storage_tb} TB)
        </option>
      ))}
    </select>
  </div>
  <div className="flex-shrink-0 self-end">
    <button ...>Generate Filters</button>
  </div>
</div>
```

The "Generate Filters" handler uses the selected seedbox's `storage_tb`:

```typescript
const selectedSb = seedboxes.find(sb => sb.id === selectedSeedboxId);
const storageTb = selectedSb?.storage_tb ?? 4;

const handleGenerate = async () => {
  setGenerating(true);
  try {
    const { job_id } = await api.startAnalyze({
      source,
      storage_tb: storageTb,
      dataset_path: selectedDataset,
    });
    setGenerateJobId(job_id);
  } catch {
    setGenerating(false);
  }
};
```

**Step 2: Update App.tsx**

- Add `selectedSeedboxId` state
- Load seedboxes from settings (they're part of the settings response, or derive from `loadData`)
- Remove `storageTb` state (now derived from selected seedbox)
- Remove `config` state and the `api.getConfig()` call from `loadData`
- Remove "Max Storage (TB)" input from Simulation Setup
- Rename `maxSeedDays` state variable to `avgSeedDays`, rename the label to "Avg. Seed Days"
- Update `handleRun` to use seedbox's `storage_tb`
- Pass seedbox props to SimulatorToolbar

State changes:
```typescript
// Remove these:
// const [config, setConfig] = useState<AppConfig | null>(null);
// const [storageTb, setStorageTb] = useState<number>(4);

// Add these:
const [seedboxes, setSeedboxes] = useState<Seedbox[]>([]);
const [selectedSeedboxId, setSelectedSeedboxId] = useState<string>("");
const [avgSeedDays, setAvgSeedDays] = useState<number>(10);

// Derived:
const selectedSeedbox = seedboxes.find(sb => sb.id === selectedSeedboxId);
const storageTb = selectedSeedbox?.storage_tb ?? 4;
```

In `loadData`, replace the config fetch with settings fetch for seedboxes:

```typescript
const [filtersData, datasetsData, settingsData] = await Promise.all([
  api.getFilters(),
  api.getDatasets(),
  api.getSettings(),
]);
// ...
setSeedboxes(settingsData.seedboxes);
if (settingsData.seedboxes.length > 0 && !selectedSeedboxId) {
  setSelectedSeedboxId(settingsData.seedboxes[0].id);
}
```

Simulation Setup grid changes from `grid-cols-3` to `grid-cols-2`:
- "Avg. Seed Days" (was "Avg. Seed Days")
- "Avg Ratio"

The "Max Storage (TB)" input is removed entirely.

---

### Task 6: Add Tracker Selection to Scrape Form

Add a tracker dropdown to the DatasetsPage scrape form so the pipeline knows which credentials to use.

**Files:**
- Modify: `dashboard/frontend/src/components/DatasetsPage.tsx`

**Step 1: Add tracker props and dropdown**

DatasetsPage needs to know about available trackers. Add a `trackers` prop:

```typescript
interface DatasetsPageProps {
  trackers: Tracker[];
  onSelectDataset?: (path: string) => void;
}
```

Add tracker state and a dropdown in the scrape form:

```typescript
const [scrapeTrackerId, setScrapeTrackerId] = useState<string>("");

// In the scrape form grid, add a tracker selector (make it grid-cols-5 or put tracker on its own row above):
<div>
  <label className="block text-xs text-gray-400 mb-1">Tracker</label>
  <select
    value={scrapeTrackerId}
    onChange={(e) => setScrapeTrackerId(e.target.value)}
    disabled={scrapeRunning}
    className={`${inputClass} disabled:opacity-50`}
  >
    {trackers.length === 0 && <option value="">No trackers configured</option>}
    {trackers.map((t) => (
      <option key={t.id} value={t.id}>{t.name}</option>
    ))}
  </select>
</div>
```

Update `handleScrape` to pass `tracker_id`:

```typescript
const handleScrape = async () => {
  setScrapeRunning(true);
  try {
    const { job_id } = await api.startScrape({
      category: scrapeCategory,
      days: scrapeDays,
      start_page: scrapeStartPage,
      delay: scrapeDelay,
      tracker_id: scrapeTrackerId || undefined,
    });
    setScrapeJobId(job_id);
  } catch {
    setScrapeRunning(false);
  }
};
```

**Step 2: Pass trackers from App.tsx**

In App.tsx, pass the trackers to DatasetsPage:

```tsx
<DatasetsPage
  trackers={seedboxes.length > 0 ? [] : []}  // Actually: use trackers from settings
  onSelectDataset={(path) => {
    setSelectedDataset(path);
    setActiveTab("simulator");
  }}
/>
```

Load trackers from settings alongside seedboxes in `loadData`:

```typescript
const [trackers, setTrackers] = useState<Tracker[]>([]);

// In loadData:
setTrackers(settingsData.trackers);
```

Pass to DatasetsPage:
```tsx
<DatasetsPage
  trackers={trackers}
  onSelectDataset={...}
/>
```

---

### Task 7: Delete .env Dependency and Clean Up

Remove all `.env` file reading from the codebase. Delete `.env.example`.

**Files:**
- Delete: `.env.example`
- Modify: `analyze_and_generate_filters.py` — remove `_load_env()`, change `STORAGE_TB`/`MAX_SEED_DAYS` to CLI-only with hardcoded defaults
- Modify: `dashboard/backend/main.py` — remove `_load_env_config` (should already be done in Task 2)

**Step 1: Update analyze_and_generate_filters.py**

Remove the `_load_env()` function and its call. Change the constants to just use hardcoded defaults (they're always overridden by CLI args from the pipeline):

```python
# Replace lines ~23-51 with:
STORAGE_TB = 4.0
MAX_SEED_DAYS = 10
BURST_FACTOR = 8
TARGET_UTILIZATION_PCT = 85.0
```

The CLI `--storage` flag already overrides `STORAGE_TB`. Add a `--seed-days` flag to override `MAX_SEED_DAYS`:

```python
parser.add_argument(
    "--seed-days", type=int, default=MAX_SEED_DAYS,
    help=f"Average seed days for storage budget (default: {MAX_SEED_DAYS})",
)
```

In `main()`, apply it:
```python
global MAX_SEED_DAYS
if args.seed_days != MAX_SEED_DAYS:
    MAX_SEED_DAYS = args.seed_days
```

**Step 2: Update pipeline.py to pass seed days**

In `start_analyze` and `start_report_only`, add `seed_days` parameter:

```python
def start_analyze(source: str, storage_tb: float | None = None,
                  dataset_path: str | None = None,
                  seed_days: int | None = None) -> Job:
    cmd = [sys.executable, "-u", "analyze_and_generate_filters.py", source]
    if storage_tb is not None:
        cmd.extend(["--storage", str(storage_tb)])
    if dataset_path:
        cmd.extend(["--dataset", dataset_path])
    if seed_days is not None:
        cmd.extend(["--seed-days", str(seed_days)])
    # ... rest unchanged
```

**Step 3: Update AnalyzeRequest model and endpoint**

In `models.py`:
```python
class AnalyzeRequest(BaseModel):
    source: str
    storage_tb: float | None = None
    dataset_path: str | None = None
    seed_days: int | None = None
```

In `main.py`:
```python
@app.post("/api/pipeline/analyze")
def api_analyze(req: AnalyzeRequest):
    job = start_analyze(req.source, req.storage_tb, req.dataset_path, req.seed_days)
    return {"job_id": job.id}
```

**Step 4: Update frontend AnalyzeRequest type and SimulatorToolbar**

In `types/index.ts`:
```typescript
export interface AnalyzeRequest {
  source: string;
  storage_tb?: number;
  dataset_path?: string;
  seed_days?: number;
}
```

In SimulatorToolbar's `handleGenerate`, pass `seed_days` from the Simulation Setup (via props from App.tsx):

The SimulatorToolbar needs `avgSeedDays` as a prop so it can pass it to the analyze call.

**Step 5: Delete .env.example**

```bash
rm .env.example
```

Do NOT delete `.env` — that's the user's local file with real credentials. Add a note that it's no longer used (or just leave it; it's already gitignored).

---

### Task 8: Verify Everything Works

Manual verification checklist:

1. Start backend and frontend
2. Settings page: add a tracker (name: TorrentLeech, username, password) — verify it saves and password is masked on reload
3. Settings page: add a seedbox (name: Racing Box, 4 TB) — verify it saves
4. Simulator tab: seedbox dropdown shows "Racing Box (4 TB)"
5. Datasets tab: tracker dropdown shows "TorrentLeech" in scrape form
6. Run a scrape — verify it authenticates using settings credentials (not .env)
7. Generate filters — verify storage_tb comes from selected seedbox
8. Run simulation — verify storage comes from seedbox, avg seed days from sim setup
9. Autobrr section still works (test connection, save)
