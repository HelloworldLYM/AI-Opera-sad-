from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_PROFILE = "multiview-facepaint-mask-v1"
RECONSTRUCTION_PROFILES: dict[str, dict[str, Any]] = {
    DEFAULT_PROFILE: {
        "id": DEFAULT_PROFILE,
        "name": "个性化三维脸谱面罩",
        "claimLevel": "personalized-facepaint-mask-asset",
        "description": "多视角短 burst 采集，先做清晰度和姿态覆盖筛选，再用当前 provider 生成个人脸型 OBJ，最后进行脸谱 UV 烘焙和 GLB 导出。",
        "route": [
            "multi-view capture",
            "quality and pose screening",
            "3DMM-style face fitting via configured provider",
            "semantic facepaint UV bake",
            "normal/material bake",
            "OBJ/GLB export",
        ],
        "currentProvider": "3ddfa-v3",
        "futureProviders": ["deca", "emoca", "detail-normal-map"],
        "notClaiming": [
            "full high-fidelity human face reconstruction",
            "identity-grade biometric reconstruction",
            "Gaussian Splatting or NeRF rendering",
        ],
    },
}


def get_reconstruction_profiles() -> dict[str, dict[str, Any]]:
    return RECONSTRUCTION_PROFILES


def get_reconstruction_profile(profile: str | None) -> dict[str, Any]:
    return RECONSTRUCTION_PROFILES.get(profile or DEFAULT_PROFILE, RECONSTRUCTION_PROFILES[DEFAULT_PROFILE])


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number != number:
        return fallback
    return number


def _pose_bucket(yaw_deg: float | None) -> str:
    if yaw_deg is None:
        return "unknown"
    if yaw_deg <= -10:
        return "left"
    if yaw_deg >= 10:
        return "right"
    return "center"


def _image_quality(path: Path) -> dict[str, Any]:
    try:
        from PIL import Image, ImageFilter, ImageStat
    except ModuleNotFoundError:
        return {
            "width": 0,
            "height": 0,
            "brightness": 0,
            "contrast": 0,
            "edgeStrength": 0,
            "exposureScore": 0.55,
            "contrastScore": 0.55,
            "sharpnessScore": 0.55,
            "resolutionScore": 0.55,
        }

    with Image.open(path) as image:
        rgb = image.convert("RGB")
        gray = rgb.convert("L")
        width, height = rgb.size
        stat = ImageStat.Stat(gray)
        brightness = stat.mean[0]
        contrast = stat.stddev[0]
        edges = gray.filter(ImageFilter.FIND_EDGES)
        edge_stat = ImageStat.Stat(edges)
        edge_strength = edge_stat.mean[0]

    exposure_score = max(0.0, 1.0 - abs(brightness - 128.0) / 128.0)
    contrast_score = min(1.0, contrast / 58.0)
    sharpness_score = min(1.0, edge_strength / 34.0)
    resolution_score = min(1.0, min(width, height) / 480.0)
    return {
        "width": width,
        "height": height,
        "brightness": round(brightness, 3),
        "contrast": round(contrast, 3),
        "edgeStrength": round(edge_strength, 3),
        "exposureScore": round(exposure_score, 4),
        "contrastScore": round(contrast_score, 4),
        "sharpnessScore": round(sharpness_score, 4),
        "resolutionScore": round(resolution_score, 4),
    }


def _score_frame(image_quality: dict[str, Any], metadata: dict[str, Any]) -> float:
    frontend_quality = _safe_float(metadata.get("qualityScore"), 0.6)
    tracking_confidence = _safe_float(metadata.get("trackingConfidence"), 0.65)
    score = (
        image_quality["sharpnessScore"] * 0.3
        + image_quality["exposureScore"] * 0.18
        + image_quality["contrastScore"] * 0.16
        + image_quality["resolutionScore"] * 0.12
        + max(0.0, min(1.0, frontend_quality)) * 0.12
        + max(0.0, min(1.0, tracking_confidence)) * 0.12
    )
    return round(max(0.0, min(1.0, score)), 4)


def build_multiview_capture_manifest(
    image_paths: list[Path],
    capture_metadata: list[dict[str, Any]] | None,
    job_dir: Path,
    profile: str = DEFAULT_PROFILE,
    min_score: float = 0.32,
    min_frames: int = 3,
    max_frames: int = 8,
) -> dict[str, Any]:
    metadata = capture_metadata or []
    frames: list[dict[str, Any]] = []
    for index, image_path in enumerate(image_paths):
        frame_meta = metadata[index] if index < len(metadata) and isinstance(metadata[index], dict) else {}
        yaw_value = frame_meta.get("yawDeg")
        yaw_deg = _safe_float(yaw_value, 0.0) if yaw_value is not None else None
        quality = _image_quality(image_path)
        score = _score_frame(quality, frame_meta)
        frames.append(
            {
                "index": index,
                "file": image_path.name,
                "path": str(image_path),
                "selected": False,
                "score": score,
                "bucket": _pose_bucket(yaw_deg),
                "yawDeg": yaw_deg,
                "pitchDeg": _safe_float(frame_meta.get("pitchDeg"), 0.0),
                "trackingConfidence": _safe_float(frame_meta.get("trackingConfidence"), 0.0),
                "frontendQualityScore": _safe_float(frame_meta.get("qualityScore"), 0.0),
                **quality,
            }
        )

    eligible = [frame for frame in frames if frame["score"] >= min_score]
    if len(eligible) < min(min_frames, len(frames)):
        eligible = sorted(frames, key=lambda frame: frame["score"], reverse=True)

    selected: list[dict[str, Any]] = []
    for bucket in ("center", "left", "right"):
        bucket_frames = [frame for frame in eligible if frame["bucket"] == bucket]
        if bucket_frames:
            selected.append(max(bucket_frames, key=lambda frame: frame["score"]))

    for frame in sorted(eligible, key=lambda item: item["score"], reverse=True):
        if len(selected) >= max_frames:
            break
        if frame not in selected:
            selected.append(frame)

    selected = sorted(selected[:max_frames], key=lambda item: item["index"])
    selected_indices = {frame["index"] for frame in selected}
    for frame in frames:
        frame["selected"] = frame["index"] in selected_indices

    pose_coverage = sorted({frame["bucket"] for frame in selected if frame["bucket"] != "unknown"})
    manifest = {
        "profile": profile or DEFAULT_PROFILE,
        "route": "multiview-capture -> quality-screening -> 3DMM-style face fitting -> facepaint UV bake -> GLB",
        "inputFrameCount": len(frames),
        "selectedFrameCount": len(selected),
        "minScore": min_score,
        "poseCoverage": pose_coverage,
        "selectedFiles": [frame["file"] for frame in selected],
        "frames": frames,
    }
    (job_dir / "capture_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )
    return manifest


def selected_image_paths_from_manifest(image_paths: list[Path], manifest: dict[str, Any]) -> list[Path]:
    selected_indices = {
        frame["index"]
        for frame in manifest.get("frames", [])
        if frame.get("selected") and isinstance(frame.get("index"), int)
    }
    selected_paths = [
        image_path
        for index, image_path in enumerate(image_paths)
        if index in selected_indices
    ]
    return selected_paths or image_paths
