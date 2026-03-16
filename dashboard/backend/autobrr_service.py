from __future__ import annotations

import httpx

from settings_service import get_autobrr_credentials

TIMEOUT = 10.0


def _client() -> tuple[str, dict]:
    """Return (base_url, headers) for autobrr API."""
    url, api_key = get_autobrr_credentials()
    headers = {"X-API-Token": api_key}
    return url, headers


def test_connection(url: str | None = None, api_key: str | None = None) -> dict:
    """Test connection to autobrr. Uses provided credentials or falls back to saved."""
    try:
        if url and api_key:
            base_url = url.rstrip("/")
            headers = {"X-API-Token": api_key}
        else:
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
