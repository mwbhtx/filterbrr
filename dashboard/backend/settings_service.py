from __future__ import annotations

import json
from pathlib import Path
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field

SETTINGS_FILE = Path(__file__).resolve().parent / ".settings.json"

SUPPORTED_TRACKERS = ["TorrentLeech"]


class Tracker(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:8])
    tracker_type: str  # must be one of SUPPORTED_TRACKERS
    username: str = ""
    password: str = ""


class Seedbox(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:8])
    name: str = ""
    storage_tb: float = 4.0


class Settings(BaseModel):
    autobrr_url: str = ""
    autobrr_api_key: str = ""
    trackers: list[Tracker] = []
    seedboxes: list[Seedbox] = []


# Backward-compat alias -- existing code imports AutobrrSettings
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
    """Return a tracker by its id, or None if not found."""
    s = get_settings()
    for t in s.trackers:
        if t.id == tracker_id:
            return t
    return None


def get_tracker_by_type(tracker_type: str) -> Optional[Tracker]:
    """Return the first tracker matching the given type, or None."""
    s = get_settings()
    for t in s.trackers:
        if t.tracker_type == tracker_type:
            return t
    return None


def get_seedbox(seedbox_id: str) -> Optional[Seedbox]:
    """Return a seedbox by its id, or None if not found."""
    s = get_settings()
    for sb in s.seedboxes:
        if sb.id == seedbox_id:
            return sb
    return None
