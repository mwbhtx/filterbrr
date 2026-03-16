from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from filters import list_filters, get_filter, save_filter, update_filter, delete_filter, promote_filter, promote_all_temp_filters, clear_temp_filters, delete_temp_filter
from datasets import list_datasets
from models import SimulationRequest, ScrapeRequest, AnalyzeRequest
from simulation import load_csv, score_torrents, run_simulation
from pipeline import start_scrape, start_analyze, start_report_only, get_job
from settings_service import AutobrrSettings, get_settings, update_settings
import httpx
from autobrr_service import test_connection
from sync_service import get_sync_status, pull_filter, pull_all, push_filter, push_all

app = FastAPI(title="Torrent Filter Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _load_env_config() -> dict:
    """Read .env config values."""
    env_path = PROJECT_ROOT / ".env"
    config = {}
    if env_path.exists():
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if "#" in value:
                    value = value[:value.index("#")].strip()
                config[key] = value
    return config


# Health
@app.get("/api/health")
def health():
    return {"status": "ok"}


# Filters
@app.get("/api/filters")
def api_list_filters():
    return list_filters()


@app.get("/api/filters/{filter_id:path}")
def api_get_filter(filter_id: str):
    f = get_filter(filter_id)
    if f is None:
        raise HTTPException(404, "Filter not found")
    return f


@app.post("/api/filters")
def api_create_filter(body: dict):
    return save_filter(body)


@app.put("/api/filters/{filter_id:path}")
def api_update_filter(filter_id: str, body: dict):
    result = update_filter(filter_id, body)
    if result is None:
        raise HTTPException(404, "Filter not found or is generated (read-only)")
    return result


@app.delete("/api/filters/{filter_id:path}")
def api_delete_filter(filter_id: str):
    if not delete_filter(filter_id):
        raise HTTPException(404, "Filter not found or is generated (read-only)")
    return {"deleted": True}


@app.post("/api/filters/{filter_id:path}/promote")
def api_promote_filter(filter_id: str):
    result = promote_filter(filter_id)
    if result is None:
        raise HTTPException(404, "Filter not found or is not a temp filter")
    return result


@app.post("/api/pipeline/clear-temp")
def api_clear_temp_filters():
    clear_temp_filters()
    return {"cleared": True}


@app.post("/api/pipeline/save-all-temp")
def api_save_all_temp():
    saved = promote_all_temp_filters()
    return {"saved": len(saved)}


# Datasets
@app.get("/api/datasets")
def api_list_datasets():
    return list_datasets()


# Config
@app.get("/api/config")
def api_get_config():
    env = _load_env_config()
    return {
        "storage_tb": float(env.get("STORAGE_TB", "4")),
        "max_seed_days": int(env.get("MAX_SEED_DAYS", "10")),
        "min_torrent_age_days": int(env.get("MIN_TORRENT_AGE_DAYS", "3")),
        "burst_factor": int(env.get("BURST_FACTOR", "8")),
        "target_utilization_pct": float(env.get("TARGET_UTILIZATION_PCT", "85")),
    }


# Simulation
@app.post("/api/simulation/run")
def api_run_simulation(req: SimulationRequest):
    torrents = load_csv(req.dataset_path)
    torrents = score_torrents(torrents)

    filter_jsons = []
    if req.filters_inline:
        for f in req.filters_inline:
            filter_jsons.append(f.model_dump())
    else:
        for fid in req.filter_ids:
            f = get_filter(fid)
            if f is None:
                raise HTTPException(404, f"Filter not found: {fid}")
            filter_jsons.append({k: v for k, v in f.items() if not k.startswith("_")})

    result = run_simulation(torrents, filter_jsons, req.storage_tb, req.max_seed_days, req.avg_ratio)
    return result


# Pipeline - Scrape + Parse (chained: scraper.py then parse_and_analyze.py)
@app.post("/api/pipeline/scrape")
def api_scrape(req: ScrapeRequest):
    job = start_scrape(req.category, req.days, req.start_page, req.delay)
    return {"job_id": job.id}


# Pipeline - Analyze & Generate Filters
@app.post("/api/pipeline/analyze")
def api_analyze(req: AnalyzeRequest):
    job = start_analyze(req.source, req.storage_tb)
    return {"job_id": job.id}


# Pipeline - Regenerate Report Only (uses existing filters)
@app.post("/api/pipeline/report-only")
def api_report_only(req: AnalyzeRequest):
    job = start_report_only(req.source, req.storage_tb)
    return {"job_id": job.id}


# Pipeline - Job status
@app.get("/api/pipeline/jobs/{job_id}")
def api_job_status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return {
        "id": job.id,
        "command": job.command,
        "status": job.status,
        "output": job.output_lines,
        "return_code": job.return_code,
    }


# Settings
def _mask_settings(s: AutobrrSettings) -> dict:
    masked = s.model_dump()
    if masked["autobrr_api_key"]:
        key = masked["autobrr_api_key"]
        masked["autobrr_api_key"] = key[:4] + "****" + key[-4:] if len(key) > 8 else "****"
    return masked


@app.get("/api/settings")
def api_get_settings():
    return _mask_settings(get_settings())


@app.put("/api/settings")
def api_update_settings(body: AutobrrSettings):
    if "****" in body.autobrr_api_key:
        old = get_settings()
        body.autobrr_api_key = old.autobrr_api_key
    return _mask_settings(update_settings(body))


# Autobrr Sync
@app.get("/api/autobrr/status")
def api_autobrr_status_saved():
    """Test connection using saved credentials."""
    return test_connection()


@app.post("/api/autobrr/status")
def api_autobrr_status_test(body: AutobrrSettings):
    """Test connection using provided credentials (from settings form)."""
    return test_connection(url=body.autobrr_url, api_key=body.autobrr_api_key)


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
    except (ValueError, httpx.HTTPError) as e:
        raise HTTPException(400, str(e))
