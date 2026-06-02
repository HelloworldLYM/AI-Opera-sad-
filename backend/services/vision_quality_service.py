from __future__ import annotations

import base64
import io
import json
import os
import urllib.error
import urllib.request
from typing import Any

import numpy as np
from PIL import Image, ImageStat

from backend.services.ai_agent_service import _call_deepseek, deepseek_config
from backend.services.culture_knowledge_service import list_faces


def vlm_config() -> dict[str, Any]:
    service_url = os.environ.get("AI_VLM_SERVICE_URL", "").strip()
    return {
        "configured": bool(service_url),
        "serviceUrl": service_url,
        "provider": os.environ.get("AI_VLM_PROVIDER", "external-vlm").strip() or "external-vlm",
        "timeoutSeconds": float(os.environ.get("AI_VLM_TIMEOUT_SECONDS", "35")),
        "localFallback": "image-statistics-landmark-qa",
    }


def _decode_image(image_base64: str | None) -> Image.Image | None:
    if not image_base64:
        return None
    data = image_base64.strip()
    if "," in data and data.lower().startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=False)
        image = Image.open(io.BytesIO(raw))
        return image.convert("RGB")
    except Exception:
        return None


def _dominant_palette(image: Image.Image, max_colors: int = 5) -> list[dict[str, Any]]:
    thumb = image.copy()
    thumb.thumbnail((96, 96))
    quantized = thumb.quantize(colors=max_colors, method=Image.MEDIANCUT)
    palette = quantized.getpalette() or []
    counts = quantized.getcolors(maxcolors=96 * 96) or []
    total = max(1, sum(count for count, _ in counts))
    colors: list[dict[str, Any]] = []
    for count, index in sorted(counts, reverse=True)[:max_colors]:
        offset = int(index) * 3
        rgb = palette[offset : offset + 3]
        if len(rgb) < 3:
            continue
        colors.append({
            "hex": "#{:02x}{:02x}{:02x}".format(int(rgb[0]), int(rgb[1]), int(rgb[2])),
            "rgb": [int(rgb[0]), int(rgb[1]), int(rgb[2])],
            "ratio": round(count / total, 4),
        })
    return colors


def _image_metrics(image: Image.Image | None) -> dict[str, Any]:
    if image is None:
        return {
            "available": False,
            "width": 0,
            "height": 0,
            "brightness": 0,
            "contrast": 0,
            "sharpness": 0,
            "palette": [],
        }

    gray = image.convert("L")
    stat = ImageStat.Stat(gray)
    arr = np.asarray(gray, dtype=np.float32)
    center = arr[1:-1, 1:-1] if arr.shape[0] > 2 and arr.shape[1] > 2 else np.asarray([], dtype=np.float32)
    if center.size:
        lap = (
            -4 * center
            + arr[:-2, 1:-1]
            + arr[2:, 1:-1]
            + arr[1:-1, :-2]
            + arr[1:-1, 2:]
        )
        sharpness = float(np.var(lap))
    else:
        sharpness = 0.0

    return {
        "available": True,
        "width": image.width,
        "height": image.height,
        "brightness": round(float(stat.mean[0]), 3),
        "contrast": round(float(stat.stddev[0]), 3),
        "sharpness": round(sharpness, 3),
        "palette": _dominant_palette(image),
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
                "x": float(item.get("x") if isinstance(item, dict) else item.x),
                "y": float(item.get("y") if isinstance(item, dict) else item.y),
            })
        except Exception:
            continue
    return points


def _bbox(points: list[dict[str, float]], indices: list[int] | None = None) -> dict[str, float] | None:
    selected = [points[i] for i in indices if i < len(points)] if indices else points
    if not selected:
        return None
    xs = [point["x"] for point in selected]
    ys = [point["y"] for point in selected]
    return {
        "xMin": max(0.0, min(xs)),
        "yMin": max(0.0, min(ys)),
        "xMax": min(1.0, max(xs)),
        "yMax": min(1.0, max(ys)),
    }


def _overlap_ratio(a: dict[str, float] | None, b: dict[str, float] | None) -> float:
    if not a or not b:
        return 0.0
    left = max(a["xMin"], b["xMin"])
    top = max(a["yMin"], b["yMin"])
    right = min(a["xMax"], b["xMax"])
    bottom = min(a["yMax"], b["yMax"])
    if left >= right or top >= bottom:
        return 0.0
    inter = (right - left) * (bottom - top)
    area = max((a["xMax"] - a["xMin"]) * (a["yMax"] - a["yMin"]), 1e-6)
    return round(inter / area, 4)


def _face_by_key(face_key: str | None) -> dict[str, Any] | None:
    key = (face_key or "").strip().lower()
    for face in list_faces():
        aliases = [str(alias).lower() for alias in face.get("aliases", [])]
        if key == face.get("key") or key in aliases or key == str(face.get("title", "")).lower():
            return face
    return None


def _landmark_metrics(face_landmarks: Any, hand_landmarks: Any) -> dict[str, Any]:
    face_points = _points_from_landmarks(face_landmarks)
    hands = hand_landmarks or []
    if isinstance(hands, dict):
        hands = hands.get("multiHandLandmarks") or hands.get("hands") or hands.get("landmarks") or []
    if hands and hands and isinstance(hands[0], dict) and "x" in hands[0]:
        hands = [hands]

    face_box = _bbox(face_points, [10, 152, 234, 454, 33, 263, 1]) if face_points else None
    hand_boxes = [_bbox(_points_from_landmarks(hand)) for hand in hands if _points_from_landmarks(hand)]
    occlusion = max((_overlap_ratio(face_box, hand_box) for hand_box in hand_boxes), default=0.0)
    yaw_hint = 0.0
    if len(face_points) > 454:
        left = face_points[234]
        right = face_points[454]
        nose = face_points[1]
        center_x = (left["x"] + right["x"]) * 0.5
        width = max(abs(right["x"] - left["x"]), 1e-6)
        yaw_hint = round((nose["x"] - center_x) / width, 4)

    return {
        "faceDetected": bool(face_points),
        "faceBox": face_box,
        "handBoxCount": len(hand_boxes),
        "faceHandOverlap": occlusion,
        "yawHint": yaw_hint,
    }


def _score_checks(image: dict[str, Any], landmarks: dict[str, Any]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    if not image["available"]:
        checks.append({"name": "画面输入", "level": "warning", "message": "未收到截图，已仅根据 UI 状态给出判断。"})
    else:
        brightness = image["brightness"]
        contrast = image["contrast"]
        sharpness = image["sharpness"]
        checks.append({
            "name": "曝光",
            "level": "pass" if 65 <= brightness <= 205 else "warning",
            "message": f"平均亮度 {brightness}，{'适合识别' if 65 <= brightness <= 205 else '建议补光或降低背光'}。",
        })
        checks.append({
            "name": "对比度",
            "level": "pass" if contrast >= 28 else "warning",
            "message": f"灰度对比度 {contrast}，{'纹样边界较清晰' if contrast >= 28 else '脸谱纹样可能偏糊'}。",
        })
        checks.append({
            "name": "清晰度",
            "level": "pass" if sharpness >= 55 else "warning",
            "message": f"边缘清晰度 {sharpness}，{'可用于展示质检' if sharpness >= 55 else '建议稳定摄像头或缩短运动幅度'}。",
        })

    if landmarks["faceDetected"]:
        overlap = landmarks["faceHandOverlap"]
        checks.append({
            "name": "遮挡",
            "level": "warning" if overlap > 0.28 else "pass",
            "message": f"手脸重叠约 {round(overlap * 100, 1)}%，{'需要 SAM/遮挡层介入' if overlap > 0.28 else '当前遮挡较轻'}。",
        })
        yaw = abs(landmarks["yawHint"])
        checks.append({
            "name": "头部朝向",
            "level": "warning" if yaw > 0.36 else "pass",
            "message": f"侧脸偏移指标 {landmarks['yawHint']}，{'建议回到正脸以稳定贴合' if yaw > 0.36 else '适合实时贴合'}。",
        })
    else:
        checks.append({"name": "人脸定位", "level": "warning", "message": "未收到 468 点人脸关键点，无法判断贴合稳定性。"})
    return checks


def _local_summary(face: dict[str, Any] | None, image: dict[str, Any], landmarks: dict[str, Any], checks: list[dict[str, Any]]) -> str:
    warnings = [item for item in checks if item.get("level") != "pass"]
    title = face.get("title", "当前脸谱") if face else "当前脸谱"
    if not warnings:
        return f"视觉质检通过：{title}当前画面曝光、清晰度、遮挡和头部朝向均适合实时展示。"
    warning_text = "；".join(item["message"] for item in warnings[:3])
    return f"视觉质检发现 {len(warnings)} 项需要注意：{warning_text}"


def _call_external_vlm(payload: dict[str, Any]) -> dict[str, Any] | None:
    config = vlm_config()
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


def visual_quality_report(
    *,
    image_base64: str | None = None,
    current_face_key: str | None = None,
    ui_context: dict[str, Any] | None = None,
    face_landmarks: Any = None,
    hand_landmarks: Any = None,
    prompt: str | None = None,
) -> dict[str, Any]:
    face = _face_by_key(current_face_key)
    image = _decode_image(image_base64)
    image_metrics = _image_metrics(image)
    landmark_metrics = _landmark_metrics(face_landmarks, hand_landmarks)
    checks = _score_checks(image_metrics, landmark_metrics)
    payload = {
        "prompt": prompt or "请对当前 AI 川剧脸谱实时画面做视觉质检。",
        "currentFaceKey": current_face_key,
        "uiContext": ui_context or {},
        "imageBase64": image_base64,
        "localMetrics": {
            "image": image_metrics,
            "landmarks": landmark_metrics,
            "checks": checks,
        },
    }
    external = _call_external_vlm(payload)
    if external and not external.get("error"):
        return {
            "provider": vlm_config()["provider"],
            "usedExternalVlm": True,
            "summary": external.get("summary") or external.get("answer") or "",
            "checks": external.get("checks") or checks,
            "metrics": payload["localMetrics"],
            "raw": external,
        }

    summary = _local_summary(face, image_metrics, landmark_metrics, checks)
    if deepseek_config()["configured"]:
        try:
            llm = _call_deepseek([
                {
                    "role": "system",
                    "content": (
                        "你是 AI-Opera 的视觉质检 Agent。你看不到原图，只能根据图像统计、"
                        "关键点遮挡指标和 UI 状态做谨慎判断。不要声称完成真实 VLM 看图。"
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "face": face,
                        "metrics": payload["localMetrics"],
                        "prompt": prompt,
                    }, ensure_ascii=False),
                },
            ], temperature=0.18, max_tokens=650)
            summary = llm["content"].strip() or summary
        except Exception:
            pass

    return {
        "provider": "local-visual-qa",
        "usedExternalVlm": False,
        "externalError": external.get("error") if isinstance(external, dict) else None,
        "summary": summary,
        "checks": checks,
        "metrics": payload["localMetrics"],
        "note": "未配置 AI_VLM_SERVICE_URL 时，本功能使用图像统计与关键点启发式质检；接入 VLM 服务后会自动升级为看图质检。",
    }
