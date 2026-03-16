# Autobrr Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add autobrr API integration so users can pull/push filters between the dashboard and their autobrr instance, with a settings page for connection config and a sync page showing filter status.

**Architecture:** Backend-first approach. New `autobrr_service.py` handles all autobrr API calls. New `settings_service.py` manages user settings (stored in DynamoDB, with local JSON fallback for dev). Frontend gets two new pages: Settings and Sync, using simple tab navigation added to the header.

**Tech Stack:** FastAPI, httpx (async HTTP client), boto3 (DynamoDB), React, TypeScript, TailwindCSS

---

## Task 1: Add backend dependencies

**Files:**
- Modify: `dashboard/backend/requirements.txt`

**Step 1: Add httpx and boto3 to requirements**

```
fastapi>=0.104.0
uvicorn>=0.24.0
pydantic>=2.0.0
python-dotenv>=1.0.0
httpx>=0.27.0
boto3>=1.35.0
```

**Step 2: Install dependencies**

Run: `cd dashboard/backend && pip install -r requirements.txt`
Expected: Successfully installed httpx and boto3

**Step 3: Commit**

```bash
git add dashboard/backend/requirements.txt
git commit -m "feat: add httpx and boto3 dependencies for autobrr sync"
```

---

## Task 2: Settings service (local dev with JSON file)

**Files:**
- Create: `dashboard/backend/settings_service.py`

We start with a local JSON file for settings storage. DynamoDB integration comes in a later task when we add auth. For now, settings are stored in `dashboard/backend/.settings.json`.

**Step 1: Write the settings service**

```python
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional
from pydantic import BaseModel

SETTINGS_FILE = Path(__file__).resolve().parent / ".settings.json"


class AutobrrSettings(BaseModel):
    autobrr_url: str = ""
    autobrr_api_key: str = ""


def _load() -> dict:
    if SETTINGS_FILE.exists():
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save(data: dict) -> None:
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_settings() -> AutobrrSettings:
    raw = _load()
    return AutobrrSettings(**raw)


def update_settings(settings: AutobrrSettings) -> AutobrrSettings:
    _save(settings.model_dump())
    return settings


def get_autobrr_credentials() -> tuple[str, str]:
    """Return (url, api_key). Raises ValueError if not configured."""
    s = get_settings()
    if not s.autobrr_url or not s.autobrr_api_key:
        raise ValueError("Autobrr connection not configured")
    return s.autobrr_url.rstrip("/"), s.autobrr_api_key
```

**Step 2: Add .settings.json to .gitignore**

Append to the project root `.gitignore`:
```
# Local settings (contains API keys)
dashboard/backend/.settings.json
```

**Step 3: Commit**

```bash
git add dashboard/backend/settings_service.py .gitignore
git commit -m "feat: add settings service for autobrr connection config"
```

---

## Task 3: Autobrr API service

**Files:**
- Create: `dashboard/backend/autobrr_service.py`

This module handles all HTTP communication with the autobrr API. It translates between our local filter format and autobrr's filter format.

**Step 1: Write the autobrr service**

```python
from __future__ import annotations

import httpx
from typing import Optional

from settings_service import get_autobrr_credentials

TIMEOUT = 10.0


def _client() -> tuple[str, dict]:
    """Return (base_url, headers) for autobrr API."""
    url, api_key = get_autobrr_credentials()
    headers = {"X-API-Token": api_key}
    return url, headers


def test_connection() -> dict:
    """Test connection to autobrr. Returns status dict."""
    try:
        base_url, headers = _client()
        with httpx.Client(timeout=TIMEOUT) as client:
            resp = client.get(f"{base_url}/api/filters", headers=headers)
            resp.raise_for_status()
            count = len(resp.json())
            return {"connected": True, "filter_count": count}
    except ValueError as e:
        return {"connected": False, "error": str(e)}
    except httpx.HTTPError as e:
        return {"connected": False, "error": str(e)}


def list_remote_filters() -> list[dict]:
    """Fetch all filters from autobrr."""
    base_url, headers = _client()
    with httpx.Client(timeout=TIMEOUT) as client:
        resp = client.get(f"{base_url}/api/filters", headers=headers)
        resp.raise_for_status()
        return resp.json()


def get_remote_filter(filter_id: int) -> dict:
    """Fetch a single filter from autobrr by its numeric ID."""
    base_url, headers = _client()
    with httpx.Client(timeout=TIMEOUT) as client:
        resp = client.get(f"{base_url}/api/filters/{filter_id}", headers=headers)
        resp.raise_for_status()
        return resp.json()


def create_remote_filter(filter_data: dict) -> dict:
    """Create a new filter in autobrr. Returns the created filter."""
    base_url, headers = _client()
    with httpx.Client(timeout=TIMEOUT) as client:
        resp = client.post(f"{base_url}/api/filters", headers=headers, json=filter_data)
        resp.raise_for_status()
        return resp.json()


def update_remote_filter(filter_id: int, filter_data: dict) -> dict:
    """Update an existing filter in autobrr."""
    base_url, headers = _client()
    with httpx.Client(timeout=TIMEOUT) as client:
        resp = client.put(
            f"{base_url}/api/filters/{filter_id}",
            headers=headers,
            json=filter_data,
        )
        resp.raise_for_status()
        return resp.json()


AUTO_PREFIX = "[AUTO] "


def local_to_remote(local_filter: dict) -> dict:
    """Convert a local filter dict to autobrr API format.

    Local format: {name, version, data: {enabled, min_size, max_size, ...}}
    Autobrr format: flat {name, enabled, min_size, max_size, ...}
    """
    data = local_filter.get("data", {})
    name = local_filter.get("name", "")
    if not name.startswith(AUTO_PREFIX):
        name = AUTO_PREFIX + name

    return {
        "name": name,
        "enabled": data.get("enabled", True),
        "priority": data.get("priority", 0),
        "min_size": data.get("min_size", ""),
        "max_size": data.get("max_size", ""),
        "delay": data.get("delay", 0),
        "max_downloads": data.get("max_downloads", 0),
        "max_downloads_unit": data.get("max_downloads_unit", "HOUR"),
        "except_releases": data.get("except_releases", ""),
        "announce_types": data.get("announce_types", []),
        "freeleech": data.get("freeleech", False),
        "resolutions": data.get("resolutions", []),
        "sources": data.get("sources", []),
        "match_categories": data.get("match_categories", ""),
        "match_release_groups": data.get("match_release_groups", ""),
        "except_release_groups": data.get("except_release_groups", ""),
    }


def remote_to_local(remote_filter: dict) -> dict:
    """Convert an autobrr filter to local format.

    Autobrr format: flat {id, name, enabled, min_size, ...}
    Local format: {name, version, data: {enabled, min_size, ...}}
    """
    name = remote_filter.get("name", "")
    # Strip [AUTO] prefix for local name
    if name.startswith(AUTO_PREFIX):
        name = name[len(AUTO_PREFIX):]

    return {
        "name": name,
        "version": "1.0",
        "data": {
            "enabled": remote_filter.get("enabled", True),
            "min_size": remote_filter.get("min_size", ""),
            "max_size": remote_filter.get("max_size", ""),
            "delay": remote_filter.get("delay", 0),
            "priority": remote_filter.get("priority", 0),
            "max_downloads": remote_filter.get("max_downloads", 0),
            "max_downloads_unit": remote_filter.get("max_downloads_unit", "HOUR"),
            "except_releases": remote_filter.get("except_releases", ""),
            "announce_types": remote_filter.get("announce_types", []),
            "freeleech": remote_filter.get("freeleech", False),
            "resolutions": remote_filter.get("resolutions", []),
            "sources": remote_filter.get("sources", []),
            "match_categories": remote_filter.get("match_categories", ""),
            "is_auto_updated": remote_filter.get("is_auto_updated", False),
            "release_profile_duplicate": None,
            "match_release_groups": remote_filter.get("match_release_groups", ""),
            "except_release_groups": remote_filter.get("except_release_groups", ""),
        },
    }
```

**Step 2: Commit**

```bash
git add dashboard/backend/autobrr_service.py
git commit -m "feat: add autobrr API service with format conversion"
```

---

## Task 4: Sync service

**Files:**
- Create: `dashboard/backend/sync_service.py`

This module contains the sync logic: diffing local vs remote filters, computing sync status, and executing pull/push operations.

**Step 1: Write the sync service**

```python
from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from autobrr_service import (
    AUTO_PREFIX,
    list_remote_filters,
    get_remote_filter,
    create_remote_filter,
    update_remote_filter,
    local_to_remote,
    remote_to_local,
)
from filters import list_filters, save_filter, update_filter, get_filter, _filter_id_from_path, _path_from_id

# Sync state file (local dev — will move to DynamoDB later)
SYNC_STATE_FILE = Path(__file__).resolve().parent / ".sync_state.json"


def _load_sync_state() -> dict:
    if SYNC_STATE_FILE.exists():
        with open(SYNC_STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_sync_state(state: dict) -> None:
    with open(SYNC_STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def _set_sync_mapping(local_filter_id: str, remote_filter_id: int) -> None:
    """Store the mapping between a local filter ID and its autobrr filter ID."""
    state = _load_sync_state()
    state[local_filter_id] = {
        "remote_id": remote_filter_id,
        "last_synced": datetime.now(timezone.utc).isoformat(),
    }
    _save_sync_state(state)


def _get_sync_mapping(local_filter_id: str) -> Optional[dict]:
    state = _load_sync_state()
    return state.get(local_filter_id)


def get_sync_status() -> list[dict]:
    """Compare local and remote filters, return sync status for each.

    Returns list of dicts with:
    - name: display name (without [AUTO] prefix)
    - local_id: local filter ID (or None)
    - remote_id: autobrr filter ID (or None)
    - source: "both" | "local_only" | "remote_only"
    - last_synced: ISO timestamp or None
    - local_filter: local filter data (or None)
    - remote_filter: remote filter data converted to local format (or None)
    """
    local_filters = list_filters()
    remote_filters = list_remote_filters()

    # Index remote [AUTO] filters by name (without prefix)
    remote_by_name: dict[str, dict] = {}
    for rf in remote_filters:
        name = rf.get("name", "")
        if name.startswith(AUTO_PREFIX):
            clean_name = name[len(AUTO_PREFIX):]
            remote_by_name[clean_name] = rf

    # Index local filters by name
    local_by_name: dict[str, dict] = {}
    for lf in local_filters:
        local_by_name[lf["name"]] = lf

    sync_state = _load_sync_state()
    results = []

    # Process local filters
    seen_names = set()
    for lf in local_filters:
        name = lf["name"]
        seen_names.add(name)
        local_id = lf["_id"]
        mapping = sync_state.get(local_id)

        rf = remote_by_name.get(name)
        entry = {
            "name": name,
            "local_id": local_id,
            "remote_id": rf["id"] if rf else (mapping["remote_id"] if mapping else None),
            "source": "both" if rf else "local_only",
            "last_synced": mapping["last_synced"] if mapping else None,
            "local_filter": {k: v for k, v in lf.items() if not k.startswith("_")},
            "remote_filter": remote_to_local(rf) if rf else None,
        }
        results.append(entry)

    # Process remote-only [AUTO] filters
    for name, rf in remote_by_name.items():
        if name not in seen_names:
            results.append({
                "name": name,
                "local_id": None,
                "remote_id": rf["id"],
                "source": "remote_only",
                "last_synced": None,
                "local_filter": None,
                "remote_filter": remote_to_local(rf),
            })

    return results


def pull_filter(remote_id: int) -> dict:
    """Pull a single filter from autobrr into local storage.

    If a local filter with the same name exists, update it.
    Otherwise, create a new saved filter.
    Returns the local filter.
    """
    remote = get_remote_filter(remote_id)
    local_data = remote_to_local(remote)
    name = local_data["name"]

    # Check if local filter with same name exists
    local_filters = list_filters()
    existing = next((f for f in local_filters if f["name"] == name), None)

    if existing:
        result = update_filter(existing["_id"], local_data)
        _set_sync_mapping(existing["_id"], remote["id"])
        return result
    else:
        result = save_filter(local_data)
        _set_sync_mapping(result["_id"], remote["id"])
        return result


def pull_all() -> list[dict]:
    """Pull all [AUTO] filters from autobrr into local storage."""
    remote_filters = list_remote_filters()
    results = []
    for rf in remote_filters:
        if rf.get("name", "").startswith(AUTO_PREFIX):
            result = pull_filter(rf["id"])
            results.append(result)
    return results


def push_filter(local_filter_id: str) -> dict:
    """Push a local filter to autobrr.

    If a sync mapping exists (we know the remote ID), update it.
    If a remote filter with matching [AUTO] name exists, update it.
    Otherwise, create a new filter in autobrr.
    Returns the remote filter response.
    """
    local = get_filter(local_filter_id)
    if local is None:
        raise ValueError(f"Local filter not found: {local_filter_id}")

    remote_data = local_to_remote(local)
    expected_name = remote_data["name"]

    # Check sync state for known remote ID
    mapping = _get_sync_mapping(local_filter_id)
    if mapping:
        result = update_remote_filter(mapping["remote_id"], remote_data)
        _set_sync_mapping(local_filter_id, mapping["remote_id"])
        return result

    # Check if remote filter with same [AUTO] name exists
    remote_filters = list_remote_filters()
    existing = next((rf for rf in remote_filters if rf.get("name") == expected_name), None)

    if existing:
        result = update_remote_filter(existing["id"], remote_data)
        _set_sync_mapping(local_filter_id, existing["id"])
        return result
    else:
        result = create_remote_filter(remote_data)
        _set_sync_mapping(local_filter_id, result["id"])
        return result


def push_all() -> list[dict]:
    """Push all local filters to autobrr."""
    local_filters = list_filters()
    results = []
    for lf in local_filters:
        result = push_filter(lf["_id"])
        results.append(result)
    return results
```

**Step 2: Add .sync_state.json to .gitignore**

Append to `.gitignore`:
```
dashboard/backend/.sync_state.json
```

**Step 3: Commit**

```bash
git add dashboard/backend/sync_service.py .gitignore
git commit -m "feat: add sync service with pull/push logic and state tracking"
```

---

## Task 5: Backend API routes for settings and sync

**Files:**
- Modify: `dashboard/backend/main.py`

**Step 1: Add imports and new routes to main.py**

Add these imports at the top of `main.py` (after existing imports):

```python
from settings_service import AutobrrSettings, get_settings, update_settings
from autobrr_service import test_connection
from sync_service import get_sync_status, pull_filter, pull_all, push_filter, push_all
```

Add these route blocks after the existing Pipeline routes (before the closing of the file):

```python
# Settings
@app.get("/api/settings")
def api_get_settings():
    s = get_settings()
    # Mask the API key
    masked = s.model_dump()
    if masked["autobrr_api_key"]:
        key = masked["autobrr_api_key"]
        masked["autobrr_api_key"] = key[:4] + "****" + key[-4:] if len(key) > 8 else "****"
    return masked


@app.put("/api/settings")
def api_update_settings(body: AutobrrSettings):
    # If the key looks masked, keep the old one
    if "****" in body.autobrr_api_key:
        old = get_settings()
        body.autobrr_api_key = old.autobrr_api_key
    return update_settings(body)


# Autobrr Sync
@app.get("/api/autobrr/status")
def api_autobrr_status():
    return test_connection()


@app.get("/api/autobrr/filters")
def api_autobrr_sync_status():
    try:
        return get_sync_status()
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/autobrr/pull")
def api_autobrr_pull_all():
    try:
        results = pull_all()
        return {"pulled": len(results)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/autobrr/pull/{remote_id}")
def api_autobrr_pull_one(remote_id: int):
    try:
        result = pull_filter(remote_id)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/autobrr/push")
def api_autobrr_push_all():
    try:
        results = push_all()
        return {"pushed": len(results)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/autobrr/push/{filter_id:path}")
def api_autobrr_push_one(filter_id: str):
    try:
        result = push_filter(filter_id)
        return result
    except (ValueError, Exception) as e:
        raise HTTPException(400, str(e))
```

**Step 2: Verify the backend starts without errors**

Run: `cd dashboard/backend && python -c "from main import app; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add dashboard/backend/main.py
git commit -m "feat: add settings and autobrr sync API routes"
```

---

## Task 6: Frontend types and API client for settings and sync

**Files:**
- Modify: `dashboard/frontend/src/types/index.ts`
- Modify: `dashboard/frontend/src/api/client.ts`

**Step 1: Add new types to types/index.ts**

Append after the existing `JobStatus` interface:

```typescript
export interface AutobrrSettings {
  autobrr_url: string;
  autobrr_api_key: string;
}

export interface AutobrrConnectionStatus {
  connected: boolean;
  filter_count?: number;
  error?: string;
}

export interface SyncFilterEntry {
  name: string;
  local_id: string | null;
  remote_id: number | null;
  source: "both" | "local_only" | "remote_only";
  last_synced: string | null;
  local_filter: Omit<Filter, "_id" | "_source"> | null;
  remote_filter: Omit<Filter, "_id" | "_source"> | null;
}
```

**Step 2: Add new API methods to client.ts**

Add inside the `api` object (before the closing `}`):

```typescript
  // Settings
  getSettings: () => fetchJSON<AutobrrSettings>("/settings"),
  updateSettings: (settings: AutobrrSettings) =>
    fetchJSON<AutobrrSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  // Autobrr Sync
  getAutobrrStatus: () => fetchJSON<AutobrrConnectionStatus>("/autobrr/status"),
  getSyncStatus: () => fetchJSON<SyncFilterEntry[]>("/autobrr/filters"),
  pullAll: () => fetchJSON<{ pulled: number }>("/autobrr/pull", { method: "POST" }),
  pullFilter: (remoteId: number) =>
    fetchJSON<Filter>(`/autobrr/pull/${remoteId}`, { method: "POST" }),
  pushAll: () => fetchJSON<{ pushed: number }>("/autobrr/push", { method: "POST" }),
  pushFilter: (localId: string) =>
    fetchJSON<unknown>(`/autobrr/push/${localId}`, { method: "POST" }),
```

Also add the new types to the import in `client.ts`:
```typescript
import type {
  Filter,
  Dataset,
  AppConfig,
  SimulationRequest,
  SimulationResult,
  ScrapeRequest,
  ParseRequest,
  AnalyzeRequest,
  JobStatus,
  AutobrrSettings,
  AutobrrConnectionStatus,
  SyncFilterEntry,
} from "../types";
```

**Step 3: Commit**

```bash
git add dashboard/frontend/src/types/index.ts dashboard/frontend/src/api/client.ts
git commit -m "feat: add frontend types and API client for settings and sync"
```

---

## Task 7: Settings page component

**Files:**
- Create: `dashboard/frontend/src/components/SettingsPage.tsx`

**Step 1: Write the Settings page**

```tsx
import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { AutobrrSettings, AutobrrConnectionStatus } from "../types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AutobrrSettings>({
    autobrr_url: "",
    autobrr_api_key: "",
  });
  const [status, setStatus] = useState<AutobrrConnectionStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateSettings(settings);
      setMessage({ type: "success", text: "Settings saved" });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    setMessage(null);
    try {
      const result = await api.getAutobrrStatus();
      setStatus(result);
    } catch (err: unknown) {
      setStatus({ connected: false, error: err instanceof Error ? err.message : "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <h2 className="text-base font-semibold">Autobrr Connection</h2>

      <div className="space-y-4 rounded-lg bg-gray-900 border border-gray-800 p-5">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Autobrr URL</label>
          <input
            type="text"
            value={settings.autobrr_url}
            onChange={(e) => setSettings({ ...settings, autobrr_url: e.target.value })}
            placeholder="http://localhost:7474"
            className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">API Key</label>
          <input
            type="password"
            value={settings.autobrr_api_key}
            onChange={(e) => setSettings({ ...settings, autobrr_api_key: e.target.value })}
            placeholder="Enter your autobrr API key"
            className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="rounded bg-gray-700 px-4 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>

        {message && (
          <div
            className={`text-sm px-3 py-2 rounded ${
              message.type === "success"
                ? "bg-green-900/50 border border-green-700 text-green-300"
                : "bg-red-900/50 border border-red-700 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {status && (
          <div
            className={`text-sm px-3 py-2 rounded ${
              status.connected
                ? "bg-green-900/50 border border-green-700 text-green-300"
                : "bg-red-900/50 border border-red-700 text-red-300"
            }`}
          >
            {status.connected
              ? `Connected — ${status.filter_count} filters found in autobrr`
              : `Connection failed: ${status.error}`}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/frontend/src/components/SettingsPage.tsx
git commit -m "feat: add Settings page component"
```

---

## Task 8: Sync page component

**Files:**
- Create: `dashboard/frontend/src/components/SyncPage.tsx`

**Step 1: Write the Sync page**

```tsx
import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { AutobrrConnectionStatus, SyncFilterEntry } from "../types";

export default function SyncPage() {
  const [status, setStatus] = useState<AutobrrConnectionStatus | null>(null);
  const [entries, setEntries] = useState<SyncFilterEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResult, syncResult] = await Promise.all([
        api.getAutobrrStatus(),
        api.getSyncStatus(),
      ]);
      setStatus(statusResult);
      setEntries(syncResult);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("400")) {
        setStatus({ connected: false, error: "Autobrr not configured — go to Settings" });
        setEntries([]);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load sync status");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.name)));
    }
  };

  const entryKey = (e: SyncFilterEntry) => e.name;

  const handlePullAll = async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.pullAll();
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setSyncing(false);
    }
  };

  const handlePushAll = async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.pushAll();
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setSyncing(false);
    }
  };

  const handlePullOne = async (remoteId: number) => {
    setSyncing(true);
    setError(null);
    try {
      await api.pullFilter(remoteId);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setSyncing(false);
    }
  };

  const handlePushOne = async (localId: string) => {
    setSyncing(true);
    setError(null);
    try {
      await api.pushFilter(localId);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setSyncing(false);
    }
  };

  const sourceLabel = (source: string) => {
    switch (source) {
      case "both": return "Both";
      case "local_only": return "Local Only";
      case "remote_only": return "Remote Only";
      default: return source;
    }
  };

  const sourceBadgeClass = (source: string) => {
    switch (source) {
      case "both": return "bg-green-900/50 text-green-300 border-green-700";
      case "local_only": return "bg-blue-900/50 text-blue-300 border-blue-700";
      case "remote_only": return "bg-yellow-900/50 text-yellow-300 border-yellow-700";
      default: return "bg-gray-800 text-gray-400 border-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection status banner */}
      {status && (
        <div
          className={`px-4 py-2 rounded text-sm ${
            status.connected
              ? "bg-green-900/30 border border-green-800 text-green-300"
              : "bg-red-900/30 border border-red-800 text-red-300"
          }`}
        >
          {status.connected
            ? `Connected to autobrr — ${status.filter_count} filters`
            : `Not connected: ${status.error}`}
        </div>
      )}

      {error && (
        <div className="px-4 py-2 rounded bg-red-900/50 border border-red-700 text-red-200 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-2">x</button>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePullAll}
          disabled={syncing || !status?.connected}
          className="rounded bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Pull All from Autobrr"}
        </button>
        <button
          onClick={handlePushAll}
          disabled={syncing || !status?.connected}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Push All to Autobrr"}
        </button>
        <button
          onClick={loadData}
          disabled={loading}
          className="rounded bg-gray-700 px-4 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* Filter sync table */}
      <div className="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-400 uppercase">
              <th className="px-4 py-2">
                <input
                  type="checkbox"
                  checked={selected.size === entries.length && entries.length > 0}
                  onChange={selectAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Last Synced</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  {status?.connected
                    ? "No filters found. Create filters locally or in autobrr to get started."
                    : "Connect to autobrr in Settings to see sync status."}
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entryKey(entry)} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(entryKey(entry))}
                    onChange={() => toggleSelect(entryKey(entry))}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-2 font-medium text-gray-200">{entry.name}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${sourceBadgeClass(entry.source)}`}>
                    {sourceLabel(entry.source)}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-400">
                  {entry.last_synced
                    ? new Date(entry.last_synced).toLocaleString()
                    : "Never"}
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  {entry.remote_id != null && (
                    <button
                      onClick={() => handlePullOne(entry.remote_id!)}
                      disabled={syncing}
                      className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
                      title="Pull from autobrr"
                    >
                      Pull
                    </button>
                  )}
                  {entry.local_id != null && (
                    <button
                      onClick={() => handlePushOne(entry.local_id!)}
                      disabled={syncing}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                      title="Push to autobrr"
                    >
                      Push
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/frontend/src/components/SyncPage.tsx
git commit -m "feat: add Sync page component with filter table and pull/push actions"
```

---

## Task 9: Add tab navigation to App.tsx

**Files:**
- Modify: `dashboard/frontend/src/App.tsx`

This task adds tab navigation to the header so users can switch between the Simulator, Sync, and Settings pages.

**Step 1: Add imports for new components**

At the top of `App.tsx`, add:
```typescript
import SettingsPage from "./components/SettingsPage";
import SyncPage from "./components/SyncPage";
```

**Step 2: Add tab state**

Inside the `App` function, add a new state variable after the existing state declarations (around line 59, after `const [error, setError]`):

```typescript
const [activeTab, setActiveTab] = useState<"simulator" | "sync" | "settings">("simulator");
```

**Step 3: Update the header**

Replace the existing `<header>` block (lines 246-248):

```tsx
<header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between flex-shrink-0">
  <h1 className="text-lg font-semibold">Torrent Filter Simulator</h1>
</header>
```

With:

```tsx
<header className="border-b border-gray-800 px-6 py-3 flex items-center gap-8 flex-shrink-0">
  <h1 className="text-lg font-semibold">Torrent Filter Simulator</h1>
  <nav className="flex gap-1">
    {(["simulator", "sync", "settings"] as const).map((tab) => (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
          activeTab === tab
            ? "bg-gray-800 text-white"
            : "text-gray-400 hover:text-gray-200"
        }`}
      >
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    ))}
  </nav>
</header>
```

**Step 4: Wrap existing content in tab conditional**

The existing `<div className="flex flex-1 overflow-hidden">` block (line 250 to line 431) contains the filter sidebar + filter form + simulation content. Wrap this entire block so it only shows when `activeTab === "simulator"`.

After the header closing tag, replace the content area structure:

```tsx
{activeTab === "simulator" && (
  <div className="flex flex-1 overflow-hidden">
    {/* ... existing sidebar + filter form + main content ... */}
  </div>
)}

{activeTab === "sync" && (
  <div className="flex-1 overflow-y-auto p-6">
    <SyncPage />
  </div>
)}

{activeTab === "settings" && (
  <div className="flex-1 overflow-y-auto p-6">
    <SettingsPage />
  </div>
)}
```

**Step 5: Verify the frontend compiles**

Run: `cd dashboard/frontend && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add dashboard/frontend/src/App.tsx
git commit -m "feat: add tab navigation for simulator, sync, and settings pages"
```

---

## Task 10: Manual integration test

**Files:** None (manual testing)

**Step 1: Start the dashboard**

Run: `cd dashboard && bash start.sh`

**Step 2: Verify Settings page**

1. Open `http://localhost:5173`
2. Click "Settings" tab
3. Enter autobrr URL and API key
4. Click "Save" — should show "Settings saved"
5. Click "Test Connection" — should show green connected status with filter count

**Step 3: Verify Sync page**

1. Click "Sync" tab
2. Should see the connection status banner
3. Should see a table of filters (remote-only if no local filters match)
4. Click "Pull All" — should pull [AUTO] filters from autobrr into local storage
5. Switch to "Simulator" tab — pulled filters should appear in the filter list
6. Edit a filter, switch to "Sync" tab, click "Push All" — should push changes to autobrr
7. Verify in autobrr's web UI that the filter was updated

**Step 4: Commit any fixes if needed**

---

## Summary of files created/modified

**New files:**
- `dashboard/backend/settings_service.py` — Settings storage
- `dashboard/backend/autobrr_service.py` — Autobrr API client + format conversion
- `dashboard/backend/sync_service.py` — Sync logic (diff, pull, push, state)
- `dashboard/frontend/src/components/SettingsPage.tsx` — Settings UI
- `dashboard/frontend/src/components/SyncPage.tsx` — Sync UI

**Modified files:**
- `dashboard/backend/requirements.txt` — Added httpx, boto3
- `dashboard/backend/main.py` — Added settings + sync routes
- `dashboard/frontend/src/types/index.ts` — Added sync types
- `dashboard/frontend/src/api/client.ts` — Added sync API methods
- `dashboard/frontend/src/App.tsx` — Added tab navigation
- `.gitignore` — Added settings and sync state files
