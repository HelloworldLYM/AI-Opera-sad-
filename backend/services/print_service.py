from __future__ import annotations

import copy
import threading
import time
import uuid
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OBJ_URL = "/generated_masks/autodl_user_001/personal_face.obj"
DEFAULT_OBJ_PATH = PROJECT_ROOT / "public" / "generated_masks" / "autodl_user_001" / "personal_face.obj"

_PRINTER = {
    "printerId": "ai-opera-demo-fdm-01",
    "name": "AI-Opera 展示打印机",
    "model": "FDM 文创打印工作站",
    "status": "ready",
    "mode": "demo",
    "connection": "simulated",
    "buildVolumeMm": {"width": 220, "depth": 220, "height": 250},
    "supportedMaterials": ["pla", "petg"],
}

_QUALITY = {
    "draft": {"label": "快速打样", "layerHeightMm": 0.28, "timeFactor": 0.72},
    "standard": {"label": "标准展示", "layerHeightMm": 0.20, "timeFactor": 1.0},
    "detail": {"label": "精细纹样", "layerHeightMm": 0.12, "timeFactor": 1.48},
}

_MATERIAL = {
    "pla": {"label": "PLA 哑光", "gramsFactor": 1.0},
    "petg": {"label": "PETG 耐久", "gramsFactor": 1.08},
}

_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.RLock()


def _inspect_demo_obj() -> dict[str, Any]:
    if not DEFAULT_OBJ_PATH.is_file():
        raise FileNotFoundError(f"OBJ 文件不存在: {DEFAULT_OBJ_URL}")
    vertex_count = 0
    face_count = 0
    uv_count = 0
    with DEFAULT_OBJ_PATH.open("r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if line.startswith("v "):
                vertex_count += 1
            elif line.startswith("vt "):
                uv_count += 1
            elif line.startswith("f "):
                face_count += max(1, len(line.split()) - 3)
    if not vertex_count or not face_count:
        raise ValueError("演示 OBJ 中没有可用顶点或面")
    return {
        "fileName": DEFAULT_OBJ_PATH.name,
        "fileSizeBytes": DEFAULT_OBJ_PATH.stat().st_size,
        "vertexCount": vertex_count,
        "triangleCount": face_count,
        "uvCount": uv_count,
    }


def get_print_capability() -> dict[str, Any]:
    return {
        "mode": "demo",
        "hardwareConnected": False,
        "demoReady": DEFAULT_OBJ_PATH.is_file(),
        "defaultObjUrl": DEFAULT_OBJ_URL,
        "disclaimer": "当前为流程演示，不会向真实打印机发送 G-code 或运动控制指令。",
    }


def list_demo_printers() -> dict[str, Any]:
    return {"mode": "demo", "hardwareConnected": False, "count": 1, "printers": [copy.deepcopy(_PRINTER)]}


def preflight_obj(
    obj_url: str | None = None,
    target_height_mm: float = 120.0,
    material: str = "pla",
    quality: str = "standard",
) -> dict[str, Any]:
    if obj_url and not str(obj_url).endswith("/generated_masks/autodl_user_001/personal_face.obj"):
        raise ValueError("当前演示仅支持项目内置的 personal_face.obj")
    mesh = _inspect_demo_obj()
    height = max(60.0, min(float(target_height_mm or 120.0), 180.0))
    quality_key = quality if quality in _QUALITY else "standard"
    material_key = material if material in _MATERIAL else "pla"
    profile = _QUALITY[quality_key]
    material_profile = _MATERIAL[material_key]
    material_grams = round((height / 120.0) ** 2.25 * 42.0 * material_profile["gramsFactor"], 1)
    estimated_minutes = round((height / 120.0) ** 1.7 * 158 * profile["timeFactor"])
    layer_count = round(height / profile["layerHeightMm"])
    return {
        "mode": "demo",
        "hardwareConnected": False,
        "readyForDemo": True,
        "readyForHardware": False,
        "objUrl": DEFAULT_OBJ_URL,
        "source": {"fileName": mesh["fileName"], "fileSizeBytes": mesh["fileSizeBytes"]},
        "mesh": mesh,
        "normalizedSizeMm": {
            "width": round(height * 0.74, 1),
            "depth": round(height * 0.31, 1),
            "height": round(height, 1),
        },
        "printEstimate": {
            "material": material_key,
            "materialLabel": material_profile["label"],
            "materialGrams": material_grams,
            "quality": quality_key,
            "qualityLabel": profile["label"],
            "layerHeightMm": profile["layerHeightMm"],
            "layerCount": layer_count,
            "estimatedMinutes": estimated_minutes,
        },
        "checks": [
            {"id": "obj", "state": "pass", "label": "OBJ 可读取", "detail": f"{mesh['vertexCount']:,} 顶点 / {mesh['triangleCount']:,} 三角面"},
            {"id": "scale", "state": "pass", "label": "成型尺寸", "detail": f"目标高度 {height:.0f} mm，适配演示平台"},
            {"id": "slicer", "state": "demo", "label": "切片器接口", "detail": "演示参数已生成，真实切片器待接入"},
        ],
        "disclaimer": "尺寸、耗材和时间为演示估算，真实打印前需接入切片器并重新校验。",
    }


def _snapshot(job: dict[str, Any]) -> dict[str, Any]:
    current = copy.deepcopy(job)
    if current["status"] in {"completed", "cancelled"}:
        return current
    elapsed = max(0.0, time.time() - current["createdAt"])
    ratio = min(elapsed / current["demoDurationSeconds"], 1.0)
    if ratio < 0.16:
        status, stage, progress = "slicing", "模拟切片", ratio / 0.16 * 18
    elif ratio < 0.30:
        status, stage, progress = "heating", "设备预热", 18 + (ratio - 0.16) / 0.14 * 10
    elif ratio < 0.96:
        status, stage, progress = "printing", "打印中", 28 + (ratio - 0.30) / 0.66 * 70
    else:
        status, stage, progress = "completed", "演示完成", 100
    current.update({
        "status": status,
        "stage": stage,
        "progress": round(progress, 1),
        "message": "模拟打印流程已完成，未向真实设备发送指令" if status == "completed" else f"正在{stage}",
        "updatedAt": time.time(),
    })
    if status == "completed":
        with _lock:
            _jobs[current["jobId"]] = copy.deepcopy(current)
    return current


def create_demo_print_job(payload: dict[str, Any]) -> dict[str, Any]:
    preflight = preflight_obj(
        obj_url=payload.get("objUrl"),
        target_height_mm=payload.get("targetHeightMm", 120),
        material=str(payload.get("material") or "pla"),
        quality=str(payload.get("quality") or "standard"),
    )
    now = time.time()
    job = {
        "jobId": f"print_{uuid.uuid4().hex[:10]}",
        "mode": "demo",
        "hardwareConnected": False,
        "printer": copy.deepcopy(_PRINTER),
        "status": "slicing",
        "stage": "模拟切片",
        "progress": 0.0,
        "message": "正在模拟切片",
        "createdAt": now,
        "updatedAt": now,
        "demoDurationSeconds": 42.0,
        "preflight": preflight,
        "request": copy.deepcopy(payload),
        "disclaimer": "这是可交互的打印流程演示，不代表真实打印机已连接。",
    }
    with _lock:
        _jobs[job["jobId"]] = copy.deepcopy(job)
    return _snapshot(job)


def get_demo_print_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
    return _snapshot(job) if job else None


def cancel_demo_print_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        job.update({"status": "cancelled", "stage": "任务已取消", "message": "演示打印任务已取消", "updatedAt": time.time()})
        _jobs[job_id] = copy.deepcopy(job)
        return copy.deepcopy(job)
