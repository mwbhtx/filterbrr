from __future__ import annotations

import os
import shutil
import subprocess
import threading
import uuid
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

@dataclass
class Job:
    id: str
    command: str
    status: str = "running"  # running, completed, failed
    output_lines: list[str] = field(default_factory=list)
    return_code: Optional[int] = None

# In-memory job store (single user, local only)
_jobs: dict[str, Job] = {}


def _unbuffered_env() -> dict:
    """Return a copy of the current env with PYTHONUNBUFFERED=1."""
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    return env


def _run_job(job: Job, cmd: list[str], cwd: Path):
    """Run a command in a subprocess, capturing output line by line."""
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=_unbuffered_env(),
        )
        for line in proc.stdout:
            job.output_lines.append(line.rstrip("\n"))
        proc.wait()
        job.return_code = proc.returncode
        job.status = "completed" if proc.returncode == 0 else "failed"
    except Exception as e:
        job.output_lines.append(f"ERROR: {e}")
        job.status = "failed"
        job.return_code = -1


def _run_chained_job(job: Job, commands: list[list[str]], cwd: Path,
                     env: Optional[dict] = None):
    """Run multiple commands in sequence, stopping on first failure."""
    if env is None:
        env = _unbuffered_env()
    try:
        for cmd in commands:
            job.output_lines.append(f">>> {' '.join(cmd)}")
            proc = subprocess.Popen(
                cmd,
                cwd=str(cwd),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                env=env,
            )
            for line in proc.stdout:
                job.output_lines.append(line.rstrip("\n"))
            proc.wait()
            if proc.returncode != 0:
                job.return_code = proc.returncode
                job.status = "failed"
                return
        job.return_code = 0
        job.status = "completed"
    except Exception as e:
        job.output_lines.append(f"ERROR: {e}")
        job.status = "failed"
        job.return_code = -1


def start_scrape(category: str, days: int = 30, start_page: int = 1,
                 delay: float = 1.0, tracker_id: Optional[str] = None) -> Job:
    scrape_cmd = [sys.executable, "-u", "scraper.py", category, "--days", str(days), "--start-page", str(start_page), "--delay", str(delay)]
    parse_cmd = [sys.executable, "-u", "parse_and_analyze.py", category]
    job = Job(id=uuid.uuid4().hex[:12], command=f"scrape+parse {category}")
    _jobs[job.id] = job

    env = _unbuffered_env()
    if tracker_id:
        from settings_service import get_tracker
        tracker = get_tracker(tracker_id)
        if tracker:
            if tracker.username:
                env["TL_USERNAME"] = tracker.username
            if tracker.password:
                env["TL_PASSWORD"] = tracker.password

    threading.Thread(
        target=_run_chained_job,
        args=(job, [scrape_cmd, parse_cmd], PROJECT_ROOT, env),
        daemon=True,
    ).start()
    return job


def _run_analyze_job(job: Job, cmd: list[str], source: str):
    """Run analyze, then move generated filters to temp/ directory."""
    generated_dir = PROJECT_ROOT / "autobrr-filters" / "generated" / source
    temp_dir = PROJECT_ROOT / "autobrr-filters" / "temp"

    # Run the analyze script (writes to generated/<source>/)
    _run_job(job, cmd, PROJECT_ROOT)

    if job.status != "completed":
        return

    # Move generated tier filters to temp/
    temp_dir.mkdir(parents=True, exist_ok=True)
    # Clear old temp filters
    for old in temp_dir.glob("*.json"):
        old.unlink()

    if generated_dir.exists():
        for f in sorted(generated_dir.glob("tier-*.json")):
            dest = temp_dir / f.name
            shutil.copy2(str(f), str(dest))
            job.output_lines.append(f"  Copied to temp: {dest.name}")


def start_analyze(source: str, storage_tb: Optional[float] = None,
                  dataset_path: Optional[str] = None,
                  seed_days: Optional[int] = None) -> Job:
    cmd = [sys.executable, "-u", "analyze_and_generate_filters.py", source]
    if storage_tb is not None:
        cmd.extend(["--storage", str(storage_tb)])
    if dataset_path:
        cmd.extend(["--dataset", dataset_path])
    if seed_days is not None:
        cmd.extend(["--seed-days", str(seed_days)])
    job = Job(id=uuid.uuid4().hex[:12], command=" ".join(cmd))
    _jobs[job.id] = job
    threading.Thread(target=_run_analyze_job, args=(job, cmd, source), daemon=True).start()
    return job


def start_report_only(source: str, storage_tb: Optional[float] = None,
                      dataset_path: Optional[str] = None,
                      seed_days: Optional[int] = None) -> Job:
    """Re-generate the markdown report using existing saved filters (no filter generation)."""
    cmd = [sys.executable, "-u", "analyze_and_generate_filters.py", source, "--report-only"]
    if storage_tb is not None:
        cmd.extend(["--storage", str(storage_tb)])
    if dataset_path:
        cmd.extend(["--dataset", dataset_path])
    if seed_days is not None:
        cmd.extend(["--seed-days", str(seed_days)])
    job = Job(id=uuid.uuid4().hex[:12], command=" ".join(cmd))
    _jobs[job.id] = job
    threading.Thread(target=_run_job, args=(job, cmd, PROJECT_ROOT), daemon=True).start()
    return job


def get_job(job_id: str) -> Optional[Job]:
    return _jobs.get(job_id)
