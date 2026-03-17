from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
GENERATED_DIR = PROJECT_ROOT / "autobrr-filters" / "generated"
SAVED_DIR = PROJECT_ROOT / "autobrr-filters" / "saved"
TEMP_DIR = PROJECT_ROOT / "autobrr-filters" / "temp"


def _ensure_dirs():
    SAVED_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _filter_id_from_path(path: Path) -> str:
    """Generate a stable ID from the filter's relative path."""
    rel = path.relative_to(PROJECT_ROOT / "autobrr-filters")
    return str(rel).replace("/", "__").replace("\\", "__").removesuffix(".json")


def _path_from_id(filter_id: str) -> Path:
    """Convert a filter ID back to a file path."""
    rel = filter_id.replace("__", "/") + ".json"
    return PROJECT_ROOT / "autobrr-filters" / rel


def list_filters() -> list[dict]:
    """List all filters (generated + saved + temp) with their IDs and source.

    If a temp filter exists with the same filename as a generated filter,
    the generated one is hidden to avoid duplicates.
    """
    _ensure_dirs()

    # Collect temp filenames to suppress generated duplicates
    temp_names: set[str] = set()
    if TEMP_DIR.exists():
        for json_file in TEMP_DIR.rglob("*.json"):
            temp_names.add(json_file.name)

    filters = []
    for directory, source in [(GENERATED_DIR, "generated"), (SAVED_DIR, "saved"), (TEMP_DIR, "temp")]:
        if not directory.exists():
            continue
        for json_file in sorted(directory.rglob("*.json")):
            # Skip generated filters that have a temp counterpart
            if source == "generated" and json_file.name in temp_names:
                continue
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
    safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in name)
    path = SAVED_DIR / f"{safe_name}.json"
    to_write = {k: v for k, v in filter_data.items() if not k.startswith("_")}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(to_write, f, indent=4)
    to_write["_id"] = _filter_id_from_path(path)
    to_write["_source"] = "saved"
    return to_write


def update_filter(filter_id: str, filter_data: dict) -> dict | None:
    """Update an existing filter (saved, generated, or temp)."""
    path = _path_from_id(filter_id)
    if not path.exists():
        return None
    source = "saved"
    if "generated" in str(path):
        source = "generated"
    elif "temp" in str(path):
        source = "temp"
    to_write = {k: v for k, v in filter_data.items() if not k.startswith("_")}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(to_write, f, indent=4)
    to_write["_id"] = filter_id
    to_write["_source"] = source
    return to_write


def delete_filter(filter_id: str) -> bool:
    """Delete a filter (saved, generated, or temp)."""
    path = _path_from_id(filter_id)
    if not path.exists():
        return False
    path.unlink()
    return True


def promote_filter(filter_id: str) -> Optional[dict]:
    """Save a temp filter to generated/, replacing any existing filter with the same filename.
    Returns the filter dict or None if the source filter doesn't exist or isn't temp."""
    path = _path_from_id(filter_id)
    if not path.exists() or "temp" not in str(path):
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    # Find the generated subdirectory to save into
    target_dir = GENERATED_DIR
    if GENERATED_DIR.exists():
        subdirs = [d for d in GENERATED_DIR.iterdir() if d.is_dir()]
        if subdirs:
            target_dir = subdirs[0]
    target_dir.mkdir(parents=True, exist_ok=True)

    dest = target_dir / path.name
    to_write = {k: v for k, v in data.items() if not k.startswith("_")}
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(to_write, f, indent=4)
    # Remove the temp file
    path.unlink()
    to_write["_id"] = _filter_id_from_path(dest)
    to_write["_source"] = "generated"
    return to_write


def delete_temp_filter(filter_id: str) -> bool:
    """Delete a single temp filter. Returns False if not found or not temp."""
    path = _path_from_id(filter_id)
    if not path.exists() or "temp" not in str(path):
        return False
    path.unlink()
    return True


def promote_all_temp_filters() -> list[dict]:
    """Save all temp filters to generated/, replacing old ones."""
    _ensure_dirs()
    results = []
    for f in sorted(TEMP_DIR.rglob("*.json")):
        fid = _filter_id_from_path(f)
        saved = promote_filter(fid)
        if saved:
            results.append(saved)
    return results


def clear_temp_filters():
    """Remove all temp filters."""
    _ensure_dirs()
    for f in TEMP_DIR.rglob("*.json"):
        f.unlink()
