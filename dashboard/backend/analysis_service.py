from __future__ import annotations
import json
from pathlib import Path
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

def get_analysis_results(source: str) -> Optional[dict]:
    """Load analysis_results.json for a source category."""
    path = PROJECT_ROOT / "autobrr-filters" / "generated" / source / "analysis_results.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)
