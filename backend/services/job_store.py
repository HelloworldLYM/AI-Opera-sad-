from __future__ import annotations

import copy
import threading
import time
import uuid
from typing import Any

_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.RLock()
_TERMINAL_STATUSES = {"done", "failed", "cancelled"}


def _now() -> float:
    return time.time()


def _empty_metrics(created_at: float) -> dict[str, Any]:
    return {
        "createdAt": created_at,
        "startedAt": None,
        "endedAt": None,
        "durationMs": None,
        "activeStage": "queued",
        "activeStageStartedAt": created_at,
        "stageTimingsMs": {},
        "events": [
            {
                "status": "queued",
                "timestamp": created_at,
                "elapsedMs": 0,
            }
        ],
        "attempts": 0,
    }


def _close_active_stage(job: dict[str, Any], now: float) -> None:
    metrics = job.setdefault("metrics", _empty_metrics(job.get("createdAt", now)))
    active_stage = metrics.get("activeStage")
    active_started_at = metrics.get("activeStageStartedAt")
    if not active_stage or active_started_at is None:
        return

    elapsed_ms = max(0.0, (now - float(active_started_at)) * 1000.0)
    timings = metrics.setdefault("stageTimingsMs", {})
    timings[active_stage] = round(float(timings.get(active_stage, 0.0)) + elapsed_ms, 2)


def _record_status_transition(job: dict[str, Any], next_status: str, now: float) -> None:
    metrics = job.setdefault("metrics", _empty_metrics(job.get("createdAt", now)))
    previous_status = job.get("status")
    if next_status == previous_status:
        return

    _close_active_stage(job, now)
    created_at = float(job.get("createdAt", now))
    metrics.setdefault("events", []).append(
        {
            "status": next_status,
            "timestamp": now,
            "elapsedMs": round((now - created_at) * 1000.0, 2),
        }
    )

    if metrics.get("startedAt") is None and next_status not in {"queued", "waiting_for_slot"}:
        metrics["startedAt"] = now

    if next_status in _TERMINAL_STATUSES:
        metrics["endedAt"] = now
        metrics["durationMs"] = round((now - created_at) * 1000.0, 2)
        metrics["activeStage"] = None
        metrics["activeStageStartedAt"] = None
    else:
        metrics["activeStage"] = next_status
        metrics["activeStageStartedAt"] = now


def create_job(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = f"job_{uuid.uuid4().hex}"
    created_at = _now()
    job = {
        "jobId": job_id,
        "status": "queued",
        "payload": copy.deepcopy(payload),
        "glbUrl": None,
        "thumbnailUrl": None,
        "source": "mock",
        "error": None,
        "createdAt": created_at,
        "updatedAt": created_at,
        "metrics": _empty_metrics(created_at),
    }

    with _lock:
        _jobs[job_id] = job

    return copy.deepcopy(job)


def update_job(job_id: str, **kwargs: Any) -> dict[str, Any]:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise KeyError(f"Job not found: {job_id}")

        now = _now()
        if "status" in kwargs:
            _record_status_transition(job, str(kwargs["status"]), now)

        metrics_patch = kwargs.pop("metrics", None)
        if isinstance(metrics_patch, dict):
            metrics = job.setdefault("metrics", _empty_metrics(job.get("createdAt", now)))
            for key, value in metrics_patch.items():
                if key == "stageTimingsMs" and isinstance(value, dict):
                    metrics.setdefault("stageTimingsMs", {}).update(value)
                elif key == "events" and isinstance(value, list):
                    metrics.setdefault("events", []).extend(value)
                else:
                    metrics[key] = value

        job.update(kwargs)
        job["updatedAt"] = now
        return copy.deepcopy(job)


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return None
        return copy.deepcopy(job)


def list_jobs(limit: int = 50) -> list[dict[str, Any]]:
    with _lock:
        jobs = sorted(_jobs.values(), key=lambda item: item.get("createdAt", 0), reverse=True)
        return copy.deepcopy(jobs[: max(1, min(limit, 500))])


def get_job_summary() -> dict[str, Any]:
    with _lock:
        jobs = list(_jobs.values())

    total = len(jobs)
    by_status: dict[str, int] = {}
    durations: list[float] = []
    for job in jobs:
        status = str(job.get("status", "unknown"))
        by_status[status] = by_status.get(status, 0) + 1
        duration_ms = job.get("metrics", {}).get("durationMs")
        if isinstance(duration_ms, (int, float)):
            durations.append(float(duration_ms))

    avg_duration_ms = round(sum(durations) / len(durations), 2) if durations else None
    success_count = by_status.get("done", 0)
    failed_count = by_status.get("failed", 0)
    completed_count = success_count + failed_count
    success_rate = round(success_count / completed_count, 4) if completed_count else None

    return {
        "totalJobs": total,
        "byStatus": by_status,
        "completedJobs": completed_count,
        "successRate": success_rate,
        "avgDurationMs": avg_duration_ms,
    }
