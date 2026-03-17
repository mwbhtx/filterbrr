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
from filters import list_filters, save_filter, update_filter, get_filter

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


def _pull_remote_data(remote: dict) -> dict:
    """Pull a single remote filter dict into local storage.

    If a local filter with the same name exists, update it.
    Otherwise, create a new saved filter.
    Returns the local filter.
    """
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


def pull_filter(remote_id: int) -> dict:
    """Pull a single filter from autobrr by ID into local storage."""
    remote = get_remote_filter(remote_id)
    return _pull_remote_data(remote)


def pull_all() -> list[dict]:
    """Pull all [AUTO] filters from autobrr into local storage."""
    remote_filters = list_remote_filters()
    results = []
    for rf in remote_filters:
        if rf.get("name", "").startswith(AUTO_PREFIX):
            result = _pull_remote_data(rf)
            results.append(result)
    return results


def push_filter(local_filter_id: str) -> dict:
    """Push a local filter to autobrr.

    If a sync mapping exists (we know the remote ID), try to update it.
    If the remote ID is stale, fall through to name match or create.
    If a remote filter with matching [AUTO] name exists, update it.
    Otherwise, create a new filter in autobrr.
    Returns the remote filter response.
    """
    local = get_filter(local_filter_id)
    if local is None:
        raise ValueError(f"Local filter not found: {local_filter_id}")

    remote_data = local_to_remote(local)
    expected_name = remote_data["name"]

    def _preserve_and_update(remote_id: int) -> dict:
        """Update a remote filter, preserving its indexers and actions."""
        existing_remote = get_remote_filter(remote_id)
        remote_data["indexers"] = existing_remote.get("indexers", [])
        remote_data["actions"] = existing_remote.get("actions", [])
        result = update_remote_filter(remote_id, remote_data)
        _set_sync_mapping(local_filter_id, remote_id)
        return result

    # Check sync state for known remote ID
    mapping = _get_sync_mapping(local_filter_id)
    if mapping:
        try:
            return _preserve_and_update(mapping["remote_id"])
        except ValueError:
            # Remote filter no longer exists — clear stale mapping, fall through
            pass

    # Check if remote filter with same [AUTO] name exists
    remote_filters = list_remote_filters()
    existing = next((rf for rf in remote_filters if rf.get("name") == expected_name), None)

    if existing:
        return _preserve_and_update(existing["id"])
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
