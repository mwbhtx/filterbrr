from __future__ import annotations

import csv
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Pattern: torrents_data_{category}_{YYYY-MM-DD_HHMM}.csv
_TS_PATTERN = re.compile(
    r"^torrents_data_(?P<category>\w+?)_(?P<ts>\d{4}-\d{2}-\d{2}_\d{4})\.csv$"
)
# Legacy: torrents_data_{category}.csv (no timestamp)
_LEGACY_PATTERN = re.compile(
    r"^torrents_data_(?P<category>\w+)\.csv$"
)


def _read_csv_metadata(csv_path: Path) -> dict:
    """Read torrent count and date range from a CSV without loading it all into memory."""
    count = 0
    min_date = None
    max_date = None
    try:
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                count += 1
                d = row.get("date", "")
                if d:
                    if min_date is None or d < min_date:
                        min_date = d
                    if max_date is None or d > max_date:
                        max_date = d
    except Exception:
        pass
    return {"torrent_count": count, "min_date": min_date, "max_date": max_date}


def list_datasets() -> list[dict]:
    """Find all torrents_data_*.csv files in the project root with metadata."""
    datasets = []
    for csv_file in sorted(PROJECT_ROOT.glob("torrents_data_*.csv"), reverse=True):
        name = csv_file.name

        # Try timestamped pattern first
        m = _TS_PATTERN.match(name)
        if m:
            category = m.group("category")
            scraped_at = m.group("ts").replace("_", " ")  # "2026-03-17 1430"
        else:
            # Legacy pattern
            m = _LEGACY_PATTERN.match(name)
            if m:
                category = m.group("category")
                scraped_at = None
            else:
                continue

        meta = _read_csv_metadata(csv_file)

        datasets.append({
            "name": csv_file.stem,
            "filename": csv_file.name,
            "path": str(csv_file),
            "size_mb": round(csv_file.stat().st_size / (1024 * 1024), 1),
            "category": category,
            "tracker_type": "TorrentLeech",
            "scraped_at": scraped_at,
            "torrent_count": meta["torrent_count"],
            "min_date": meta["min_date"],
            "max_date": meta["max_date"],
        })
    return datasets


def delete_dataset(filename: str) -> bool:
    """Delete a dataset CSV by filename. Returns True if deleted."""
    # Sanitize: only allow files matching our patterns in project root
    path = PROJECT_ROOT / filename
    if not path.exists():
        return False
    if not (_TS_PATTERN.match(filename) or _LEGACY_PATTERN.match(filename)):
        return False
    path.unlink()
    return True
