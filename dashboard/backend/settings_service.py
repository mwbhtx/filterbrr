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
