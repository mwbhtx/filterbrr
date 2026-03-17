# Simulator Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the dashboard so Datasets tab owns data acquisition (scrape + history), Simulator tab is the workspace (dataset selector, generate filters, edit filters with release group slider, run simulation), and analysis results are persisted per-dataset for use in the filter form.

**Architecture:** The analysis script writes an `analysis_results.json` alongside generated filters, containing release group rankings. The backend serves this per-dataset. The Simulator tab has a top-level dataset selector that drives everything: filter generation, simulation, and the release group slider in the filter form. Scrape controls move to the Datasets tab.

**Tech Stack:** Python/FastAPI backend, React/TypeScript/Tailwind frontend, existing analysis pipeline.

---

### Task 1: Persist Analysis Results JSON

The analysis script currently prints rankings to console and a markdown report. We need it to also write a machine-readable JSON that the UI can consume.

**Files:**
- Modify: `analyze_and_generate_filters.py` — add JSON output after analysis
- Modify: `dashboard/backend/main.py` — new endpoint to serve analysis results
- Create: `dashboard/backend/analysis_service.py` — load/serve analysis JSON

**Step 1: Add analysis JSON output to the analysis script**

In `analyze_and_generate_filters.py`, after `assign_tiers()` completes and before filter generation, write the release group rankings to `autobrr-filters/generated/{source}/analysis_results.json`:

```python
def write_analysis_results(source: str, all_results: dict, tier_map: dict):
    """Write analysis results JSON for UI consumption."""
    output_dir = BASE_DIR / "autobrr-filters" / "generated" / source
    output_dir.mkdir(parents=True, exist_ok=True)

    # Build release group rankings
    rg_results = all_results.get("release_group", [])
    rg_tiers = tier_map.get("release_group", {})

    release_groups = []
    for entry in rg_results:
        value = entry["value"]
        release_groups.append({
            "name": value,
            "score": round(entry["median"], 2),
            "score_per_gb": round(entry["median_spg"], 2),
            "count": entry["count"],
            "daily_gb": round(entry["daily_gb"], 1),
            "tier": rg_tiers.get(value, "unqualified"),
        })

    data = {
        "source": source,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        "release_groups": release_groups,
    }

    path = output_dir / "analysis_results.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  Wrote: {path}")
```

Call this in `main()` right after `assign_tiers()` returns, before the `if args.report_only` branch.

**Step 2: Create analysis_service.py**

```python
# dashboard/backend/analysis_service.py
from __future__ import annotations
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

def get_analysis_results(source: str) -> dict | None:
    """Load analysis_results.json for a source category."""
    path = PROJECT_ROOT / "autobrr-filters" / "generated" / source / "analysis_results.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)
```

**Step 3: Add API endpoint**

In `main.py`:
```python
from analysis_service import get_analysis_results

@app.get("/api/analysis/{source}")
def api_get_analysis(source: str):
    result = get_analysis_results(source)
    if result is None:
        raise HTTPException(404, "No analysis results found. Run Generate Filters first.")
    return result
```

**Step 4: Verify manually**

Run the analysis script: `python3 analyze_and_generate_filters.py freeleech`
Confirm `autobrr-filters/generated/freeleech/analysis_results.json` exists and contains release group data.

---

### Task 2: Move Scrape to Datasets Tab

Move the scrape controls from PipelinePanel into DatasetsPage. Remove PipelinePanel's scrape section.

**Files:**
- Modify: `dashboard/frontend/src/components/DatasetsPage.tsx` — add scrape controls
- Modify: `dashboard/frontend/src/components/PipelinePanel.tsx` — remove scrape section (will be replaced entirely in Task 3)

**Step 1: Add scrape controls to DatasetsPage**

Add scrape state and UI to DatasetsPage. Reuse the existing JobRunner pattern from PipelinePanel. Add a collapsible "New Scrape" section at the top of the datasets page with category selector, days, start page, delay inputs, and a "Run Scrape" button. When scrape completes, auto-refresh the dataset list.

Import the JobRunner component (extract it to its own file or copy inline). The scrape form should include:
- Category dropdown (freeleech/movies/tv)
- Days input (default 30)
- Start page input (default 1)
- Delay input (default 1.0)
- "Run Scrape" button
- Job output log

**Step 2: Remove scrape section from PipelinePanel**

Remove all scrape-related state, handlers, and UI from PipelinePanel. This component will be replaced entirely in Task 3.

---

### Task 3: Replace PipelinePanel with Dataset Selector + Generate Filters

Remove PipelinePanel entirely. Replace it with a compact top bar in the simulator that has the domain/dataset selector and a "Generate Filters" button.

**Files:**
- Delete logic from: `dashboard/frontend/src/components/PipelinePanel.tsx` — replace with new component
- Modify: `dashboard/frontend/src/App.tsx` — replace PipelinePanel usage with new SimulatorToolbar

**Step 1: Create SimulatorToolbar component**

Replace PipelinePanel with a new SimulatorToolbar that contains:
- Source/category selector (freeleech/movies/tv) — left side
- Dataset dropdown (populated from datasets list, filtered by selected category) — next to source
- "Generate Filters" button — triggers analysis+generation against selected dataset
- Job output log (collapsible, only shown when running)

The component receives: `datasets`, `selectedDataset`, `onDatasetChange`, `storageTb`, `onDataChanged` as props.

When "Generate Filters" is clicked:
1. Determine `source` from the selected dataset's category
2. Call `api.startAnalyze({ source, storage_tb, dataset_path: selectedDataset })`
3. Show job output
4. On complete, call `onDataChanged()` to refresh filters

**Step 2: Update App.tsx**

- Remove PipelinePanel import
- Add SimulatorToolbar in its place
- Pass datasets (filtered by category), selectedDataset, and handlers
- The dataset selector in SimulatorToolbar replaces the one currently in "Simulation Setup"
- Remove the dataset dropdown from the Simulation Setup section (it's now in the toolbar)

---

### Task 4: Extract JobRunner to Shared Component

JobRunner is currently defined inside PipelinePanel. Extract it so both DatasetsPage and SimulatorToolbar can use it.

**Files:**
- Create: `dashboard/frontend/src/components/JobRunner.tsx`
- Modify: `dashboard/frontend/src/components/DatasetsPage.tsx` — import JobRunner
- Modify: `dashboard/frontend/src/components/PipelinePanel.tsx` (or SimulatorToolbar) — import JobRunner

**Step 1: Extract JobRunner**

Move the `JobRunner` component and `formatElapsed` helper into their own file. Export them. No logic changes needed.

**Step 2: Update imports**

Replace inline JobRunner usage in both DatasetsPage and SimulatorToolbar with the shared import.

---

### Task 5: Add Release Group Slider to Filter Form

Add a slider to the filter form that controls which release groups are included based on their analysis score ranking.

**Files:**
- Modify: `dashboard/frontend/src/types/index.ts` — add AnalysisResults type
- Modify: `dashboard/frontend/src/api/client.ts` — add getAnalysisResults API call
- Modify: `dashboard/frontend/src/components/FilterForm.tsx` — add slider UI
- Modify: `dashboard/frontend/src/App.tsx` — fetch and pass analysis results to FilterForm

**Step 1: Add frontend types**

```typescript
export interface ReleaseGroupRanking {
  name: string;
  score: number;
  score_per_gb: number;
  count: number;
  daily_gb: number;
  tier: string; // "high" | "medium" | "low" | "unqualified"
}

export interface AnalysisResults {
  source: string;
  generated_at: string;
  release_groups: ReleaseGroupRanking[];
}
```

**Step 2: Add API call**

```typescript
getAnalysisResults: (source: string) =>
  fetchJSON<AnalysisResults>(`/analysis/${source}`),
```

**Step 3: Fetch analysis in App.tsx**

When the selected dataset changes, determine the source category and fetch analysis results. Pass them to FilterForm as an optional `analysisResults` prop.

```typescript
const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);

// When selectedDataset changes, fetch analysis for that category
useEffect(() => {
  const ds = datasets.find(d => d.path === selectedDataset);
  if (ds?.category) {
    api.getAnalysisResults(ds.category)
      .then(setAnalysisResults)
      .catch(() => setAnalysisResults(null));
  }
}, [selectedDataset, datasets]);
```

**Step 4: Add slider to FilterForm**

In the release groups section of FilterForm, add a slider when `analysisResults` is provided:

- Sort release groups by score descending (best first)
- Slider range: 0 to `release_groups.length`
- Slider position = number of groups included
- Moving slider right includes more groups (from best to worst)
- Visual: gradient bar from green (left/best) to red (right/worst)
- Below the slider: show the list of included groups with their scores, colored by tier
- When slider moves: automatically update `match_release_groups` field with the selected group names

The slider interaction:
1. Groups are sorted by score descending
2. Slider at position N means "include the top N groups"
3. Moving slider updates the comma-separated `match_release_groups` value
4. The text field below still shows the current groups and is editable (manual override)
5. If user manually edits the text, slider position updates to reflect

Color coding for the gradient:
- Green zone: high-tier groups
- Yellow zone: medium-tier groups
- Red zone: low-tier groups

**Step 5: Handle blocklist mode**

When in blocklist mode (except_release_groups), the slider works in reverse:
- Slider at position N means "block the bottom N groups"
- Moving slider right blocks more low-scoring groups
- Groups are sorted by score ascending (worst first) for the blocklist view

---

### Task 6: Wire Dataset Selection Through App

Ensure changing the dataset selector updates everything: simulation, filter generation, and analysis results.

**Files:**
- Modify: `dashboard/frontend/src/App.tsx` — centralize dataset selection

**Step 1: Centralize dataset state**

The `selectedDataset` state in App.tsx should be the single source of truth. When it changes:
1. Update the simulation setup's dataset reference
2. Re-fetch analysis results for the new dataset's category
3. SimulatorToolbar shows the current selection

**Step 2: Derive source from dataset**

Add a derived `selectedSource` computed from the selected dataset's category:
```typescript
const selectedSource = datasets.find(d => d.path === selectedDataset)?.category ?? "freeleech";
```

Pass this to SimulatorToolbar and anywhere else that needs the source category.

---

### Task 7: Clean Up Removed Code

**Files:**
- Modify: `dashboard/frontend/src/App.tsx` — remove unused PipelinePanel references
- Delete or repurpose: `dashboard/frontend/src/components/PipelinePanel.tsx`
- Modify: `dashboard/backend/models.py` — remove `min_torrent_age_days` from AppConfig if no longer needed

**Step 1: Remove dead code**

- Remove PipelinePanel import and usage from App.tsx
- Remove the duplicate dataset selector from Simulation Setup (now in toolbar)
- Clean up any unused state variables

**Step 2: Verify everything works**

- Datasets tab: can view datasets, run scrapes, delete datasets
- Simulator tab: dataset selector in toolbar, Generate Filters button works, filter form shows release group slider, simulation runs against selected dataset
- Settings tab: unchanged
