from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DIGITAL_ROOT = PROJECT_ROOT / "public" / "digital_exhibition"
SCENES_ROOT = DIGITAL_ROOT / "scenes"


def _safe_id(value: str) -> str:
    raw = value.strip().lower()
    raw = re.sub(r"[^a-z0-9\u4e00-\u9fff_-]+", "-", raw)
    raw = raw.strip("-_")
    return raw or f"scene-{int(time.time())}"


def _default_scene() -> dict[str, Any]:
    return {
        "sceneId": "demo-stage",
        "title": "AI-Opera 川剧数字展厅",
        "sceneType": "museum-gallery",
        "status": "personal-mask-gallery",
        "claimLevel": "Interactive digital museum using personalized OBJ masks with UV facepaint textures; not a classic-scene 3DGS reconstruction.",
        "description": "个性化三维脸谱模型、UV 纹样映射、GraphRAG 文化关系与沉浸式展陈空间在同一个场景中并置。",
        "viewer": {
            "type": "threejs-free-explore",
            "entryUrl": "/digital_exhibition_viewer.html?scene=demo-stage",
            "navigation": ["orbit", "walk", "zoom", "pan"],
        },
        "assets": {
            "splat": None,
            "pointCloud": None,
            "previewImage": None,
        },
        "captureRequirements": {
            "video": "4K/1080p video, slow pan, 60-180 seconds per space, avoid motion blur",
            "images": "200-800 sharp overlapping images, wide/medium/detail coverage",
            "camera": "lock exposure if possible; keep overlap above 70%; include stage floor, backdrop, side wings",
            "forbidden": ["fast whip pan", "heavy compression", "large moving crowds", "strong rolling shutter"],
        },
        "autodlPipeline": [
            "upload videos/images to AutoDL",
            "extract frames at 2-5 FPS",
            "run COLMAP feature extraction, matching and sparse reconstruction",
            "train 3D Gaussian Splatting on CUDA GPU",
            "export splat/ply and scene_manifest.json",
            "copy exported assets into public/digital_exhibition/scenes/{sceneId}",
        ],
        "createdAt": 0,
        "updatedAt": 0,
    }


def _default_classic_scene() -> dict[str, Any]:
    return {
        "sceneId": "classic-placeholder",
        "sceneType": "classic-scene-3dgs",
        "title": "经典川剧场景重建占位",
        "status": "waiting-for-source-video-and-canto",
        "claimLevel": (
            "Classic Sichuan opera scene 3DGS module placeholder; waiting for source video, "
            "singing audio and AutoDL-trained splat assets."
        ),
        "description": "该模块独立于数字展厅，用于未来导入经典川剧场景视频、对应唱段和 3DGS 重建资产。",
        "viewer": {
            "type": "threejs-3dgs-classic-scene",
            "entryUrl": "/classic_scene_3dgs.html?scene=classic-placeholder",
            "navigation": ["orbit", "walk", "audio timeline", "camera trajectory"],
        },
        "assets": {
            "splat": None,
            "pointCloud": None,
            "previewImage": None,
            "sourceVideo": None,
        },
        "canto": {
            "title": "经典唱段待导入",
            "opera": None,
            "performer": None,
            "audioUrl": None,
            "lyricsUrl": None,
            "startTime": 0,
            "durationSeconds": None,
        },
        "source": {
            "type": "classic-sichuan-opera-video",
            "description": "等待用户提供经典川剧场景视频和对应唱段。",
        },
        "createdAt": 0,
        "updatedAt": 0,
    }


def ensure_default_scene() -> Path:
    scene_dir = SCENES_ROOT / "demo-stage"
    path = scene_dir / "scene_manifest.json"
    if path.is_file():
        ensure_default_classic_scene()
        return path
    scene_dir.mkdir(parents=True, exist_ok=True)
    now = time.time()
    scene = _default_scene()
    scene["createdAt"] = now
    scene["updatedAt"] = now
    path.write_text(json.dumps(scene, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    ensure_default_classic_scene()
    return path


def ensure_default_classic_scene() -> Path:
    scene_dir = SCENES_ROOT / "classic-placeholder"
    path = scene_dir / "scene_manifest.json"
    if path.is_file():
        return path
    scene_dir.mkdir(parents=True, exist_ok=True)
    now = time.time()
    scene = _default_classic_scene()
    scene["createdAt"] = now
    scene["updatedAt"] = now
    path.write_text(json.dumps(scene, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    return path


def get_3dgs_status() -> dict[str, Any]:
    ensure_default_scene()
    train_url = os.environ.get("AI_3DGS_TRAIN_SERVICE_URL", "").strip()
    scene_root = os.environ.get("AI_3DGS_SCENE_ROOT", str(SCENES_ROOT)).strip()
    return {
        "localTrainingReady": os.environ.get("AI_3DGS_ALLOW_LOCAL_CUDA", "").strip() == "1",
        "localHardwareNote": "当前项目默认按无 GPU 本机处理：本机可浏览/管理场景，3DGS 训练建议放到 AutoDL CUDA 环境。",
        "externalTrainServiceConfigured": bool(train_url),
        "trainServiceUrl": train_url,
        "sceneRoot": scene_root,
        "viewerReady": True,
        "modules": {
            "museumGallery": "/digital_exhibition_viewer.html?scene=demo-stage",
            "classicScene3dgs": "/classic_scene_3dgs.html?scene=classic-placeholder",
        },
        "supportedImports": ["scene_manifest.json", "point_cloud.ply", "splat.ply", "preview.jpg", "source.mp4", "canto.mp3"],
        "recommendedPipeline": [
            "COLMAP SfM",
            "GraphDeco/Inria 3D Gaussian Splatting training",
            "web viewer free exploration",
        ],
    }


def list_scenes() -> dict[str, Any]:
    ensure_default_scene()
    scenes = []
    for manifest_path in sorted(SCENES_ROOT.glob("*/scene_manifest.json")):
        try:
            scenes.append(json.loads(manifest_path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return {"count": len(scenes), "scenes": scenes}


def list_classic_scenes() -> dict[str, Any]:
    all_scenes = list_scenes()["scenes"]
    scenes = [scene for scene in all_scenes if scene.get("sceneType") == "classic-scene-3dgs"]
    return {"count": len(scenes), "scenes": scenes}


def get_scene(scene_id: str) -> dict[str, Any]:
    ensure_default_scene()
    safe = _safe_id(scene_id or "demo-stage")
    path = SCENES_ROOT / safe / "scene_manifest.json"
    if not path.is_file():
        return _default_scene()
    return json.loads(path.read_text(encoding="utf-8"))


def create_scene_manifest(payload: dict[str, Any]) -> dict[str, Any]:
    scene_id = _safe_id(payload.get("sceneId") or payload.get("title") or "scene")
    scene_type = payload.get("sceneType") or payload.get("type") or "classic-scene-3dgs"
    scene_dir = SCENES_ROOT / scene_id
    scene_dir.mkdir(parents=True, exist_ok=True)
    now = time.time()
    scene = {
        **(_default_classic_scene() if scene_type == "classic-scene-3dgs" else _default_scene()),
        "sceneId": scene_id,
        "sceneType": scene_type,
        "title": payload.get("title") or scene_id,
        "status": payload.get("status") or "waiting-for-3dgs-assets",
        "claimLevel": payload.get("claimLevel")
        or "3DGS scene placeholder; waiting for AutoDL trained splat asset",
        "assets": {
            "splat": payload.get("splatUrl"),
            "pointCloud": payload.get("pointCloudUrl"),
            "previewImage": payload.get("previewImageUrl"),
            "sourceVideo": payload.get("sourceVideoUrl"),
        },
        "canto": {
            "title": payload.get("cantoTitle") or "经典唱段待导入",
            "opera": payload.get("opera"),
            "performer": payload.get("performer"),
            "audioUrl": payload.get("cantoAudioUrl"),
            "lyricsUrl": payload.get("lyricsUrl"),
            "startTime": payload.get("cantoStartTime") or 0,
            "durationSeconds": payload.get("cantoDurationSeconds"),
        },
        "source": {
            "type": payload.get("sourceType") or "video-or-images",
            "description": payload.get("description") or "",
        },
        "viewer": {
            "type": "threejs-3dgs-classic-scene" if scene_type == "classic-scene-3dgs" else "threejs-free-explore",
            "entryUrl": (
                f"/classic_scene_3dgs.html?scene={scene_id}"
                if scene_type == "classic-scene-3dgs"
                else f"/digital_exhibition_viewer.html?scene={scene_id}"
            ),
            "navigation": ["orbit", "walk", "audio timeline", "camera trajectory"]
            if scene_type == "classic-scene-3dgs"
            else ["orbit", "walk", "zoom", "pan"],
        },
        "createdAt": now,
        "updatedAt": now,
    }
    path = scene_dir / "scene_manifest.json"
    path.write_text(json.dumps(scene, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    return scene
