from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


def sam_config() -> dict[str, Any]:
    service_url = os.environ.get("AI_SAM_SERVICE_URL", "").strip()
    return {
        "configured": bool(service_url),
        "serviceUrl": service_url,
        "provider": os.environ.get("AI_SAM_PROVIDER", "sam2-external").strip() or "sam2-external",
        "timeoutSeconds": float(os.environ.get("AI_SAM_TIMEOUT_SECONDS", "45")),
        "localFallback": "landmark-prompted-occlusion-polygons",
    }


def _points_from_landmarks(landmarks: Any) -> list[dict[str, float]]:
    if not landmarks:
        return []
    if isinstance(landmarks, dict):
        landmarks = landmarks.get("landmarks") or landmarks.get("points") or []
    points = []
    for item in landmarks:
        try:
            points.append({
                "x": max(0.0, min(1.0, float(item.get("x") if isinstance(item, dict) else item.x))),
                "y": max(0.0, min(1.0, float(item.get("y") if isinstance(item, dict) else item.y))),
            })
        except Exception:
            continue
    return points


def _convex_hull(points: list[dict[str, float]]) -> list[dict[str, float]]:
    pts = sorted(points, key=lambda item: (item["x"], item["y"]))
    if len(pts) < 3:
        return pts

    def cross(o: dict[str, float], a: dict[str, float], b: dict[str, float]) -> float:
        return (a["x"] - o["x"]) * (b["y"] - o["y"]) - (a["y"] - o["y"]) * (b["x"] - o["x"])

    lower: list[dict[str, float]] = []
    for point in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)

    upper: list[dict[str, float]] = []
    for point in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)

    return lower[:-1] + upper[:-1]


def _expand_polygon(points: list[dict[str, float]], factor: float = 1.18) -> list[dict[str, float]]:
    if not points:
        return []
    cx = sum(point["x"] for point in points) / len(points)
    cy = sum(point["y"] for point in points) / len(points)
    expanded = []
    for point in points:
        expanded.append({
            "x": max(0.0, min(1.0, cx + (point["x"] - cx) * factor)),
            "y": max(0.0, min(1.0, cy + (point["y"] - cy) * factor)),
        })
    return expanded


def _bbox(points: list[dict[str, float]]) -> dict[str, float] | None:
    if not points:
        return None
    xs = [point["x"] for point in points]
    ys = [point["y"] for point in points]
    return {"xMin": min(xs), "yMin": min(ys), "xMax": max(xs), "yMax": max(ys)}


def _overlap(a: dict[str, float] | None, b: dict[str, float] | None) -> float:
    if not a or not b:
        return 0.0
    left = max(a["xMin"], b["xMin"])
    top = max(a["yMin"], b["yMin"])
    right = min(a["xMax"], b["xMax"])
    bottom = min(a["yMax"], b["yMax"])
    if left >= right or top >= bottom:
        return 0.0
    inter = (right - left) * (bottom - top)
    face_area = max((a["xMax"] - a["xMin"]) * (a["yMax"] - a["yMin"]), 1e-6)
    return round(inter / face_area, 4)


def _normalize_hands(hand_landmarks: Any) -> list[list[dict[str, float]]]:
    hands = hand_landmarks or []
    if isinstance(hands, dict):
        hands = hands.get("multiHandLandmarks") or hands.get("hands") or hands.get("landmarks") or []
    if hands and isinstance(hands, list) and hands and isinstance(hands[0], dict) and "x" in hands[0]:
        hands = [hands]
    return [_points_from_landmarks(hand) for hand in hands if _points_from_landmarks(hand)]


def _call_external_sam(payload: dict[str, Any]) -> dict[str, Any] | None:
    config = sam_config()
    if not config["configured"]:
        return None
    request = urllib.request.Request(
        config["serviceUrl"],
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=config["timeoutSeconds"]) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        return {"provider": config["provider"], "error": str(exc)}


def segment_occlusion(
    *,
    image_base64: str | None = None,
    face_landmarks: Any = None,
    hand_landmarks: Any = None,
    current_face_key: str | None = None,
    ui_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    face_points = _points_from_landmarks(face_landmarks)
    face_indices = [10, 152, 234, 454, 33, 263, 1]
    face_box = _bbox([face_points[index] for index in face_indices if index < len(face_points)])
    hands = _normalize_hands(hand_landmarks)
    hints = []
    for hand in hands:
        if not hand:
            continue
        wrist = hand[0] if len(hand) > 0 else hand[0]
        fingertips = [hand[index] for index in [4, 8, 12, 16, 20] if index < len(hand)]
        hints.append({"positivePoints": [wrist, *fingertips], "box": _bbox(hand)})

    payload = {
        "imageBase64": image_base64,
        "currentFaceKey": current_face_key,
        "uiContext": ui_context or {},
        "prompts": hints,
        "faceBox": face_box,
    }
    external = _call_external_sam(payload)
    if external and not external.get("error"):
        return {
            "provider": sam_config()["provider"],
            "usedExternalSam": True,
            "segments": external.get("segments", []),
            "raw": external,
        }

    segments = []
    max_overlap = 0.0
    for index, hand in enumerate(hands):
        hull = _expand_polygon(_convex_hull(hand), 1.22)
        hand_box = _bbox(hull)
        overlap = _overlap(face_box, hand_box)
        max_overlap = max(max_overlap, overlap)
        if len(hull) >= 3:
            segments.append({
                "id": f"hand_{index}",
                "class": "hand_occluder",
                "polygon": hull,
                "box": hand_box,
                "confidence": round(0.62 + min(overlap, 0.32), 4),
                "source": "mediapipe-hull-expanded",
            })

    return {
        "provider": "local-sam-fallback",
        "usedExternalSam": False,
        "externalError": external.get("error") if isinstance(external, dict) else None,
        "segments": segments,
        "faceBox": face_box,
        "occlusionRatio": round(max_overlap, 4),
        "quality": {
            "readyForRealtimeOcclusion": bool(segments),
            "needsExternalSam": max_overlap > 0.3,
            "promptCount": len(hints),
        },
        "note": "未配置 AI_SAM_SERVICE_URL 时，系统使用手部关键点凸包和时序平滑做遮挡；配置 SAM/SAM2 服务后可返回像素级 mask。",
    }
