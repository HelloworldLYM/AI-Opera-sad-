from __future__ import annotations

import base64
import io
import json
import math
import os
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from backend.services.culture_knowledge_service import list_faces

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FACE_DIR = PROJECT_ROOT / "public" / "legacy" / "faces"

COLOR_TERMS: dict[str, list[str]] = {
    "红": ["红", "red", "忠义", "忠勇", "正直", "关羽", "姜维"],
    "黑": ["黑", "black", "刚烈", "威猛", "公正", "粗豪", "张飞"],
    "黄": ["黄", "金黄", "yellow", "骁勇", "凶猛", "典韦", "宇文成都"],
    "绿": ["绿", "green", "草莽", "侠气", "猛烈", "程咬金", "倪荣"],
    "蓝": ["蓝", "blue", "刚强", "绿林", "心计", "窦尔敦"],
    "白": ["白", "white", "冷峻", "威严", "僧", "法海"],
    "金": ["金", "银", "神怪", "神力", "佛", "天将", "巨灵神"],
}


def clip_config() -> dict[str, Any]:
    service_url = os.environ.get("AI_CLIP_SERVICE_URL", "").strip()
    return {
        "configured": bool(service_url),
        "serviceUrl": service_url,
        "provider": os.environ.get("AI_CLIP_PROVIDER", "external-clip").strip() or "external-clip",
        "timeoutSeconds": float(os.environ.get("AI_CLIP_TIMEOUT_SECONDS", "35")),
        "localFallback": "clip-lite-color-text-retrieval",
    }


def _decode_image(image_base64: str | None) -> Image.Image | None:
    if not image_base64:
        return None
    data = image_base64.strip()
    if "," in data and data.lower().startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=False)
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        return None


def _image_histogram(image: Image.Image | None, bins: int = 4) -> np.ndarray:
    if image is None:
        return np.zeros(bins * bins * bins, dtype=np.float32)
    thumb = image.copy()
    thumb.thumbnail((128, 128))
    arr = np.asarray(thumb.convert("RGB"), dtype=np.float32)
    quantized = np.clip((arr / 256.0 * bins).astype(np.int32), 0, bins - 1)
    index = quantized[:, :, 0] * bins * bins + quantized[:, :, 1] * bins + quantized[:, :, 2]
    hist = np.bincount(index.reshape(-1), minlength=bins * bins * bins).astype(np.float32)
    total = float(hist.sum())
    return hist / total if total > 0 else hist


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= 1e-8:
        return 0.0
    return float(np.dot(a, b) / denom)


def _face_image_path(face: dict[str, Any]) -> Path:
    return FACE_DIR / f"{face.get('title', face.get('key', ''))}.png"


@lru_cache(maxsize=1)
def _catalog() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for face in list_faces():
        image_path = _face_image_path(face)
        image = Image.open(image_path).convert("RGB") if image_path.is_file() else None
        items.append({
            "face": face,
            "imagePath": str(image_path),
            "histogram": _image_histogram(image),
            "text": _face_text(face),
        })
    return items


def _face_text(face: dict[str, Any]) -> str:
    values = [
        str(face.get("key", "")),
        str(face.get("title", "")),
        str(face.get("role", "")),
        str(face.get("story", "")),
    ]
    for key in ("aliases", "colors", "meanings", "opera"):
        values.extend(str(item) for item in face.get(key, []))
    return " ".join(values).lower()


def _semantic_score(query: str, face: dict[str, Any]) -> float:
    query_text = query.lower().replace("，", " ").replace("、", " ")
    if not query_text.strip():
        return 0.0
    face_text = _face_text(face)
    score = 0.0
    terms = [term for term in query_text.split() if term]
    if not terms:
        terms = [query_text]
    for term in terms:
        if term in str(face.get("title", "")).lower():
            score += 2.5
        elif term in face_text:
            score += 1.0
    for color, synonyms in COLOR_TERMS.items():
        if any(term.lower() in query_text for term in synonyms) and color in face.get("colors", []):
            score += 2.2
    for meaning in face.get("meanings", []):
        if str(meaning) in query:
            score += 1.8
    for opera in face.get("opera", []):
        if str(opera) in query:
            score += 2.0
    return min(1.0, 1.0 - math.exp(-score / 3.2))


def _compact_face(face: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": face.get("key"),
        "title": face.get("title"),
        "role": face.get("role"),
        "colors": face.get("colors", []),
        "meanings": face.get("meanings", []),
        "opera": face.get("opera", []),
        "story": face.get("story"),
        "image": f"faces/{face.get('title')}.png",
    }


def _call_external_clip(payload: dict[str, Any]) -> dict[str, Any] | None:
    config = clip_config()
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
        return {"error": str(exc), "provider": config["provider"]}


def multimodal_search(
    *,
    query: str = "",
    image_base64: str | None = None,
    current_face_key: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    limit = max(1, min(int(limit or 5), 12))
    payload = {
        "query": query,
        "imageBase64": image_base64,
        "currentFaceKey": current_face_key,
        "limit": limit,
        "catalog": [_compact_face(item["face"]) for item in _catalog()],
    }
    external = _call_external_clip(payload)
    if external and not external.get("error"):
        return {
            "provider": clip_config()["provider"],
            "usedExternalClip": True,
            "query": query,
            "results": external.get("results", []),
            "raw": external,
        }

    query_image = _decode_image(image_base64)
    query_hist = _image_histogram(query_image)
    has_image = bool(query_image)
    scored: list[tuple[float, dict[str, Any], dict[str, float]]] = []
    normalized_current = (current_face_key or "").strip().lower()

    for item in _catalog():
        face = item["face"]
        text_score = _semantic_score(query, face)
        image_score = _cosine(query_hist, item["histogram"]) if has_image else 0.0
        current_penalty = 0.08 if normalized_current and normalized_current == str(face.get("key", "")).lower() else 0.0
        score = text_score * (0.7 if has_image else 1.0) + image_score * (0.5 if query.strip() else 1.0) - current_penalty
        if not query.strip() and not has_image:
            score = 0.35 - current_penalty
        scored.append((score, face, {"text": round(text_score, 4), "image": round(image_score, 4)}))

    scored.sort(key=lambda item: (-item[0], item[1].get("title", "")))
    results = []
    for score, face, parts in scored[:limit]:
        reasons = []
        if parts["text"] > 0.08:
            reasons.append("语义与角色/颜色/寓意匹配")
        if parts["image"] > 0.08:
            reasons.append("画面颜色分布相近")
        if not reasons:
            reasons.append("作为展陈序列补充推荐")
        results.append({
            "score": round(float(score), 4),
            "scoreParts": parts,
            "face": _compact_face(face),
            "reason": "；".join(reasons),
        })

    return {
        "provider": "local-clip-lite",
        "usedExternalClip": False,
        "externalError": external.get("error") if isinstance(external, dict) else None,
        "query": query,
        "hasImageQuery": has_image,
        "results": results,
        "note": "未配置 AI_CLIP_SERVICE_URL 时，本功能使用脸谱图像颜色直方图 + 文化语义做 CLIP-compatible 检索；接入 CLIP 服务后会自动升级为真实图文 embedding 检索。",
    }
