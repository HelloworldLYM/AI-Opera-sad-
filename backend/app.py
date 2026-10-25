from __future__ import annotations

import base64
import json
import os
import shutil
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.services.blender_service import find_blender_executable, render_glb_with_blender
from backend.services.ai_agent_service import (
    answer_with_rag,
    deepseek_config,
    generate_narration,
    generate_visit_report,
    recommend_face,
    run_agent,
)
from backend.services.culture_knowledge_service import answer_query, list_faces, search_faces
from backend.services.cultural_graph_service import (
    build_cultural_graph,
    explain_graph_context,
    search_graph,
)
from backend.services.creative_face_design_service import generate_creative_face_design
from backend.services.detail_map_service import generate_detail_normal_map
from backend.services.face_reconstruction_service import reconstruct_face_to_obj
from backend.services.gaussian_gallery_service import (
    create_scene_manifest,
    get_3dgs_status,
    get_scene,
    list_classic_scenes,
    list_scenes,
)
from backend.services.job_store import create_job, get_job, get_job_summary, list_jobs, update_job
from backend.services.multimodal_retrieval_service import clip_config, multimodal_search
from backend.services.multiview_quality_service import (
    DEFAULT_PROFILE,
    build_multiview_capture_manifest,
    get_reconstruction_profile,
    get_reconstruction_profiles,
    selected_image_paths_from_manifest,
)
from backend.services.opera_media_service import get_opera_media, list_opera_media
from backend.services.print_service import (
    cancel_demo_print_job,
    create_demo_print_job,
    get_demo_print_job,
    get_print_capability,
    list_demo_printers,
    preflight_obj,
)
from backend.services.rag_knowledge_base import resolve_emotion_face_mapping, search_documents
from backend.services.segmentation_service import sam_config, segment_occlusion
from backend.services.uv_service import generate_uv_for_texture
from backend.services.vision_quality_service import visual_quality_report, vlm_config


PROJECT_ROOT = Path(__file__).resolve().parents[1]
JOBS_ROOT = PROJECT_ROOT / "backend" / "jobs"
GENERATED_MASKS_ROOT = PROJECT_ROOT / "public" / "generated_masks"
MOCK_STEP_DELAY = float(os.environ.get("HQ_MASK_MOCK_STEP_DELAY", "0.26"))
MOCK_STEP_DELAYS = [
    float(item)
    for item in os.environ.get("HQ_MASK_MOCK_STEP_DELAYS", "0.16,0.31,0.47,0.24,0.36").split(",")
    if item.strip()
] or [MOCK_STEP_DELAY]
MAX_ACTIVE_JOBS = max(1, int(os.environ.get("HQ_MASK_MAX_ACTIVE_JOBS", "1")))
MAX_JOB_RETRIES = max(0, int(os.environ.get("HQ_MASK_MAX_RETRIES", "0")))
_job_slots = threading.BoundedSemaphore(MAX_ACTIVE_JOBS)
_active_jobs = 0
_active_jobs_lock = threading.Lock()


class HqMaskJobRequest(BaseModel):
    sessionId: str = "session_001"
    textureKey: str = "guanyu"
    reconstructionProfile: str = DEFAULT_PROFILE
    faceImageBase64: str | None = None
    faceImagesBase64: list[str] | None = None
    captureFrames: list[dict[str, Any]] | None = None
    landmarks468: list[Any] | None = None
    fallbackObjText: str | None = None
    timestamp: float | int | None = None


class PersonalFaceObjRequest(BaseModel):
    sessionId: str = "session_001"
    textureKey: str = "guanyu"
    reconstructionProfile: str = DEFAULT_PROFILE
    faceImageBase64: str | None = None
    faceImagesBase64: list[str] | None = None
    captureFrames: list[dict[str, Any]] | None = None
    landmarks468: list[Any] | None = None
    fallbackObjText: str | None = None
    timestamp: float | int | None = None


class CultureQueryRequest(BaseModel):
    query: str = ""
    limit: int = 8


class AiAskRequest(BaseModel):
    query: str = ""
    currentFaceKey: str | None = None


class AiAgentRequest(BaseModel):
    message: str = ""
    currentFaceKey: str | None = None
    uiContext: dict[str, Any] | None = None


class AiEmotionFaceMapRequest(BaseModel):
    emotion: str = "neutral"
    confidence: float = 0.0
    currentFaceKey: str | None = None


class AiRecommendRequest(BaseModel):
    currentFaceKey: str | None = None
    viewedFaceKeys: list[str] | None = None
    preferenceEvents: list[dict[str, Any]] | None = None
    uiContext: dict[str, Any] | None = None
    limit: int = 5


class AiNarrationRequest(BaseModel):
    currentFaceKey: str | None = None
    uiContext: dict[str, Any] | None = None
    durationSeconds: int = 30


class AiReportRequest(BaseModel):
    currentFaceKey: str | None = None
    viewedFaceKeys: list[str] | None = None
    uiContext: dict[str, Any] | None = None
    performance: dict[str, Any] | None = None
    gestureDataset: dict[str, Any] | None = None
    generation: dict[str, Any] | None = None


class AiVisualQaRequest(BaseModel):
    imageBase64: str | None = None
    currentFaceKey: str | None = None
    uiContext: dict[str, Any] | None = None
    faceLandmarks: list[Any] | None = None
    handLandmarks: list[Any] | None = None
    prompt: str | None = None


class AiClipSearchRequest(BaseModel):
    query: str = ""
    imageBase64: str | None = None
    currentFaceKey: str | None = None
    limit: int = 5


class AiCreativeFaceRequest(BaseModel):
    prompt: str = ""
    currentFaceKey: str | None = None
    style: str = "stage-facepaint"


class AiSamSegmentRequest(BaseModel):
    imageBase64: str | None = None
    currentFaceKey: str | None = None
    uiContext: dict[str, Any] | None = None
    faceLandmarks: list[Any] | None = None
    handLandmarks: list[Any] | None = None


class DigitalSceneRequest(BaseModel):
    sceneId: str | None = None
    sceneType: str | None = None
    title: str | None = None
    status: str | None = None
    claimLevel: str | None = None
    sourceType: str | None = None
    description: str | None = None
    splatUrl: str | None = None
    pointCloudUrl: str | None = None
    previewImageUrl: str | None = None
    sourceVideoUrl: str | None = None
    cantoTitle: str | None = None
    opera: str | None = None
    performer: str | None = None
    cantoAudioUrl: str | None = None
    lyricsUrl: str | None = None
    cantoStartTime: float | int | None = None
    cantoDurationSeconds: float | int | None = None


class PrintPreflightRequest(BaseModel):
    objUrl: str = "/generated_masks/autodl_user_001/personal_face.obj"
    targetHeightMm: float = 120.0
    material: str = "pla"
    quality: str = "standard"


class PrintJobRequest(PrintPreflightRequest):
    printerId: str = "ai-opera-demo-fdm-01"
    color: str = "opera-red"


app = FastAPI(title="Personalized Facepaint Mask Backend", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _model_dump(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "jobId": job["jobId"],
        "status": job["status"],
        "glbUrl": job.get("glbUrl"),
        "objUrl": job.get("objUrl"),
        "thumbnailUrl": job.get("thumbnailUrl"),
        "source": job.get("source"),
        "error": job.get("error"),
        "createdAt": job.get("createdAt"),
        "updatedAt": job.get("updatedAt"),
        "metrics": job.get("metrics"),
        "manifestUrl": job.get("manifestUrl"),
        "captureManifest": job.get("captureManifest"),
        "normalMapUrl": job.get("normalMapUrl"),
    }


def _active_job_count() -> int:
    with _active_jobs_lock:
        return _active_jobs


def _run_guarded_job(job_id: str, runner: Any) -> None:
    global _active_jobs

    acquired = _job_slots.acquire(timeout=float(os.environ.get("HQ_MASK_SLOT_TIMEOUT", "300")))
    if not acquired:
        update_job(job_id, status="failed", error="Timed out while waiting for an available worker slot.")
        return

    with _active_jobs_lock:
        _active_jobs += 1

    try:
        attempts = MAX_JOB_RETRIES + 1
        for attempt in range(1, attempts + 1):
            update_job(job_id, metrics={"attempts": attempt})
            runner(job_id)
            final_job = get_job(job_id)
            if final_job and final_job.get("status") == "done":
                return
            if attempt < attempts:
                update_job(job_id, status="retrying", error=None)
                time.sleep(min(2.0 * attempt, 6.0))
    finally:
        with _active_jobs_lock:
            _active_jobs = max(0, _active_jobs - 1)
        _job_slots.release()


def _mask_url(session_id: str, texture_key: str) -> str:
    safe_session = session_id.strip() or "session_001"
    safe_texture = texture_key.strip() or "guanyu"
    return f"/generated_masks/{safe_session}/{safe_texture}_mask.glb"


def _personal_obj_url(session_id: str) -> str:
    safe_session = session_id.strip() or "session_001"
    return f"/generated_masks/{safe_session}/personal_face.obj"


def _asset_manifest_url(session_id: str, texture_key: str) -> str:
    safe_session = session_id.strip() or "session_001"
    safe_texture = texture_key.strip() or "guanyu"
    return f"/generated_masks/{safe_session}/{safe_texture}_asset_manifest.json"


def _normal_map_url(session_id: str, texture_key: str) -> str:
    safe_session = session_id.strip() or "session_001"
    safe_texture = texture_key.strip() or "guanyu"
    return f"/generated_masks/{safe_session}/{safe_texture}_detail_normal.png"


def _mock_glb_url(session_id: str, texture_key: str) -> str:
    demo_url = f"/generated_masks/demo_{texture_key}_mask.glb"
    demo_path = PROJECT_ROOT / "public" / demo_url.lstrip("/")
    if demo_path.exists():
        return demo_url
    return _mask_url(session_id, texture_key)


def _decode_base64_image(value: str) -> bytes:
    data = value.strip()
    if "," in data and data.lower().startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        return base64.b64decode(data, validate=False)
    except Exception as exc:
        raise RuntimeError(f"faceImageBase64 could not be decoded: {exc}") from exc


def _save_real_inputs(job_id: str, payload: dict[str, Any], job_dir: Path) -> dict[str, Any]:
    face_images_base64 = payload.get("faceImagesBase64") or []
    if not face_images_base64 and payload.get("faceImageBase64"):
        face_images_base64 = [payload.get("faceImageBase64")]

    face_image_paths: list[Path] = []
    for index, face_image_base64 in enumerate(face_images_base64[:12]):
        if not face_image_base64:
            continue
        face_image_path = job_dir / f"face_{index:02d}.jpg"
        face_image_path.write_bytes(_decode_base64_image(face_image_base64))
        face_image_paths.append(face_image_path)

    capture_manifest: dict[str, Any] = {
        "profile": payload.get("reconstructionProfile") or DEFAULT_PROFILE,
        "inputFrameCount": len(face_image_paths),
        "selectedFrameCount": len(face_image_paths),
        "selectedFiles": [path.name for path in face_image_paths],
        "frames": [],
    }
    if face_image_paths:
        update_job(job_id, status="quality_screening")
        capture_manifest = build_multiview_capture_manifest(
            image_paths=face_image_paths,
            capture_metadata=payload.get("captureFrames") or [],
            job_dir=job_dir,
            profile=payload.get("reconstructionProfile") or DEFAULT_PROFILE,
            min_frames=min(3, len(face_image_paths)),
            max_frames=8,
        )
        face_image_paths = selected_image_paths_from_manifest(face_image_paths, capture_manifest)
        update_job(
            job_id,
            captureManifest={
                "profile": capture_manifest.get("profile"),
                "inputFrameCount": capture_manifest.get("inputFrameCount"),
                "selectedFrameCount": capture_manifest.get("selectedFrameCount"),
                "poseCoverage": capture_manifest.get("poseCoverage"),
                "selectedFiles": capture_manifest.get("selectedFiles"),
            },
            metrics={
                "capture": {
                    "inputFrameCount": capture_manifest.get("inputFrameCount"),
                    "selectedFrameCount": capture_manifest.get("selectedFrameCount"),
                }
            },
        )

    fallback_obj_text = payload.get("fallbackObjText")
    if fallback_obj_text:
        (job_dir / "fallback.obj").write_text(fallback_obj_text, encoding="utf-8", newline="\n")
        update_job(job_id, status="obj_received")

    return {
        "faceImagePaths": face_image_paths,
        "captureManifest": capture_manifest,
    }


def _write_asset_manifest(
    out_dir: Path,
    session_id: str,
    texture_key: str,
    source: str,
    capture_manifest: dict[str, Any],
    glb_url: str | None = None,
    obj_url: str | None = None,
    normal_map_url: str | None = None,
) -> Path:
    profile = capture_manifest.get("profile") or DEFAULT_PROFILE
    profile_details = get_reconstruction_profile(profile)
    manifest = {
        "assetType": "personalized-3d-facepaint-mask",
        "profile": profile,
        "claimLevel": profile_details.get("claimLevel"),
        "notClaiming": profile_details.get("notClaiming", []),
        "sessionId": session_id,
        "textureKey": texture_key,
        "source": source,
        "glbUrl": glb_url,
        "objUrl": obj_url,
        "normalMapUrl": normal_map_url,
        "route": {
            "capture": "multi-view short burst",
            "screening": "image quality + pose coverage",
            "shape": source,
            "texture": "semantic anchors + piecewise affine UV bake",
            "detail": "height-derived detail normal map" if normal_map_url else "not generated",
            "export": "OBJ/GLB",
        },
        "capture": {
            "inputFrameCount": capture_manifest.get("inputFrameCount", 0),
            "selectedFrameCount": capture_manifest.get("selectedFrameCount", 0),
            "poseCoverage": capture_manifest.get("poseCoverage", []),
            "selectedFiles": capture_manifest.get("selectedFiles", []),
        },
        "createdAt": time.time(),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{texture_key}_asset_manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    return path


def _run_mock_job(job_id: str) -> None:
    job = get_job(job_id)
    if job is None:
        return

    payload = job.get("payload", {})
    session_id = payload.get("sessionId") or "session_001"
    texture_key = payload.get("textureKey") or "guanyu"
    fallback_obj_text = payload.get("fallbackObjText")
    steps = [
        "face_captured",
        "obj_received" if fallback_obj_text else "reconstructing",
        "uv_mapping",
        "blender_running",
        "exporting",
    ]

    try:
        for index, status in enumerate(steps):
            update_job(job_id, status=status, source="fallback-obj" if fallback_obj_text else "mock")
            time.sleep(MOCK_STEP_DELAYS[index % len(MOCK_STEP_DELAYS)])

        update_job(
            job_id,
            status="done",
            glbUrl=_mock_glb_url(session_id, texture_key),
            thumbnailUrl=None,
            source="fallback-obj" if fallback_obj_text else "mock",
            error=None,
        )
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc))


def _run_real_job(job_id: str) -> None:
    job = get_job(job_id)
    if job is None:
        return

    payload = job.get("payload", {})
    session_id = payload.get("sessionId") or "session_001"
    texture_key = payload.get("textureKey") or "guanyu"
    job_dir = JOBS_ROOT / job_id
    obj_path = job_dir / "face.obj"
    out_dir = GENERATED_MASKS_ROOT / session_id
    out_obj_path = out_dir / "personal_face.obj"
    out_glb_path = out_dir / f"{texture_key}_mask.glb"

    try:
        job_dir.mkdir(parents=True, exist_ok=True)
        update_job(job_id, status="face_captured")
        input_bundle = _save_real_inputs(job_id, payload, job_dir)
        face_image_paths = input_bundle["faceImagePaths"]
        capture_manifest = input_bundle["captureManifest"]

        out_dir.mkdir(parents=True, exist_ok=True)
        if out_obj_path.is_file():
            update_job(job_id, status="reconstructing", source="cached-3ddfa-v3")
            shutil.copyfile(out_obj_path, obj_path)
            source = "cached-3ddfa-v3"
        else:
            update_job(
                job_id,
                status="multi_reconstructing" if len(face_image_paths) > 1 else "reconstructing",
            )
            source = reconstruct_face_to_obj(
                face_image_path=face_image_paths[0] if face_image_paths else None,
                out_obj_path=obj_path,
                provider=os.environ.get("HQ_MASK_FACE_PROVIDER", "3ddfa-v3"),
                fallback_obj_text=payload.get("fallbackObjText"),
                face_image_paths=face_image_paths,
            )
            if len(face_image_paths) > 1:
                update_job(job_id, status="fusing", source=source)
            shutil.copyfile(obj_path, out_obj_path)

        update_job(job_id, status="uv_mapping", source=source, objUrl=_personal_obj_url(session_id))
        uv_path = generate_uv_for_texture(texture_key=texture_key, job_dir=job_dir)

        update_job(job_id, status="normal_baking", source=source)
        normal_map_path = generate_detail_normal_map(
            texture_path=uv_path,
            out_path=out_dir / f"{texture_key}_detail_normal.png",
        )
        normal_map_url = _normal_map_url(session_id, texture_key) if normal_map_path else None
        update_job(
            job_id,
            normalMapUrl=normal_map_url,
            metrics={"detailMaps": {"normalMapGenerated": bool(normal_map_path)}},
        )

        update_job(job_id, status="blender_running", source=source)
        render_glb_with_blender(
            obj_path=obj_path,
            texture_path=uv_path,
            out_path=out_glb_path,
            thickness=float(os.environ.get("HQ_MASK_THICKNESS", "0.015")),
            bevel=float(os.environ.get("HQ_MASK_BEVEL", "0.003")),
            normal_map_path=normal_map_path,
        )

        update_job(job_id, status="exporting", source=source)
        _write_asset_manifest(
            out_dir=out_dir,
            session_id=session_id,
            texture_key=texture_key,
            source=source,
            capture_manifest=capture_manifest,
            glb_url=_mask_url(session_id, texture_key),
            obj_url=_personal_obj_url(session_id),
            normal_map_url=normal_map_url,
        )
        update_job(
            job_id,
            status="done",
            glbUrl=_mask_url(session_id, texture_key),
            objUrl=_personal_obj_url(session_id),
            thumbnailUrl=None,
            source=source,
            manifestUrl=_asset_manifest_url(session_id, texture_key),
            normalMapUrl=normal_map_url,
            error=None,
        )
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc))


def _run_personal_obj_job(job_id: str) -> None:
    job = get_job(job_id)
    if job is None:
        return

    payload = job.get("payload", {})
    session_id = payload.get("sessionId") or "session_001"
    texture_key = payload.get("textureKey") or "guanyu"
    job_dir = JOBS_ROOT / job_id
    obj_path = job_dir / "face.obj"
    out_dir = GENERATED_MASKS_ROOT / session_id
    out_obj_path = out_dir / "personal_face.obj"

    try:
        if out_obj_path.is_file():
            update_job(
                job_id,
                status="done",
                objUrl=_personal_obj_url(session_id),
                source="cached-3ddfa-v3",
                manifestUrl=_asset_manifest_url(session_id, texture_key)
                if (out_dir / f"{texture_key}_asset_manifest.json").is_file()
                else None,
                error=None,
            )
            return

        job_dir.mkdir(parents=True, exist_ok=True)
        update_job(job_id, status="face_captured")
        input_bundle = _save_real_inputs(job_id, payload, job_dir)
        face_image_paths = input_bundle["faceImagePaths"]
        capture_manifest = input_bundle["captureManifest"]

        update_job(
            job_id,
            status="multi_reconstructing" if len(face_image_paths) > 1 else "reconstructing",
        )
        source = reconstruct_face_to_obj(
            face_image_path=face_image_paths[0] if face_image_paths else None,
            out_obj_path=obj_path,
            provider=os.environ.get("HQ_MASK_FACE_PROVIDER", "3ddfa-v3"),
            fallback_obj_text=payload.get("fallbackObjText"),
            face_image_paths=face_image_paths,
        )
        if len(face_image_paths) > 1:
            update_job(job_id, status="fusing", source=source)

        out_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(obj_path, out_obj_path)
        _write_asset_manifest(
            out_dir=out_dir,
            session_id=session_id,
            texture_key=texture_key,
            source=source,
            capture_manifest=capture_manifest,
            obj_url=_personal_obj_url(session_id),
        )
        update_job(
            job_id,
            status="done",
            objUrl=_personal_obj_url(session_id),
            source=source,
            manifestUrl=_asset_manifest_url(session_id, texture_key),
            error=None,
        )
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc))


def _run_job(job_id: str) -> None:
    mode = os.environ.get("HQ_MASK_MODE", "real").strip().lower() or "real"
    if mode == "real":
        _run_real_job(job_id)
    else:
        _run_mock_job(job_id)


@app.get("/api/hq-mask/health")
def get_hq_mask_health() -> dict[str, Any]:
    ddfa_repo = Path(os.environ.get("DDFA_V3_REPO_PATH", PROJECT_ROOT / "3DDFA-V3")).resolve()
    asset_dir = ddfa_repo / "assets"
    required_assets = [
        "face_model.npy",
        "large_base_net.pth",
        "net_recon.pth",
        "retinaface_resnet50_2020-07-20_old_torch.pth",
        "similarity_Lm3D_all.mat",
    ]
    missing_assets = [name for name in required_assets if not (asset_dir / name).is_file()]
    blender_bin = find_blender_executable()
    return {
        "mode": os.environ.get("HQ_MASK_MODE", "real"),
        "faceProvider": os.environ.get("HQ_MASK_FACE_PROVIDER", "3ddfa-v3"),
        "reconstructionProfile": get_reconstruction_profile(
            os.environ.get("HQ_MASK_RECONSTRUCTION_PROFILE", DEFAULT_PROFILE)
        ),
        "ddfaV3Repo": str(ddfa_repo),
        "ddfaV3Python": os.environ.get("DDFA_V3_PYTHON") or "backend-python",
        "ddfaV3Device": os.environ.get("DDFA_V3_DEVICE", "cuda"),
        "ddfaV3Ready": ddfa_repo.is_dir() and not missing_assets,
        "missingAssets": missing_assets,
        "glbExporter": os.environ.get("HQ_MASK_GLB_EXPORTER", "auto"),
        "blenderBin": blender_bin,
        "blenderReady": blender_bin is not None,
        "jobQueue": {
            "maxActiveJobs": MAX_ACTIVE_JOBS,
            "activeJobs": _active_job_count(),
            "maxRetries": MAX_JOB_RETRIES,
        },
        "jobSummary": get_job_summary(),
    }


@app.get("/api/hq-mask/reconstruction-profiles")
def get_hq_mask_reconstruction_profiles() -> dict[str, Any]:
    profiles = get_reconstruction_profiles()
    return {
        "defaultProfile": DEFAULT_PROFILE,
        "profiles": profiles,
    }


@app.get("/api/culture/faces")
def get_culture_faces() -> dict[str, Any]:
    faces = list_faces()
    return {"count": len(faces), "faces": faces}


@app.get("/api/culture/search")
def search_culture_faces(q: str = "", limit: int = 8) -> dict[str, Any]:
    results = search_faces(q, limit=max(1, min(limit, 50)))
    return {"query": q, "count": len(results), "results": results}


@app.post("/api/culture/answer")
def answer_culture_query(payload: CultureQueryRequest) -> dict[str, Any]:
    return answer_query(payload.query)


@app.get("/api/ai/config")
def get_ai_config() -> dict[str, Any]:
    config = deepseek_config()
    return {
        "deepseekConfigured": config["configured"],
        "model": config["model"],
        "baseUrl": config["baseUrl"],
        "ragReady": True,
        "ragDocumentCount": len(search_documents("", limit=200)),
        "gestureTrainingReady": True,
        "vlm": vlm_config(),
        "clip": clip_config(),
        "sam": sam_config(),
        "digitalExhibition": get_3dgs_status(),
        "agentTools": [
            "culture_search",
            "rag_document_search",
            "rag_emotion_face_mapping",
            "graphrag_subgraph",
            "contextual_bandit_recommendation",
            "visual_quality_agent",
            "clip_multimodal_retrieval",
            "creative_face_designer",
            "sam_occlusion_segmentation",
            "3dgs_digital_gallery",
            "opera_canto_media_search",
            "system_health",
            "reconstruction_profile",
        ],
    }


@app.post("/api/ai/ask")
def ask_ai_guide(payload: AiAskRequest) -> dict[str, Any]:
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    return answer_with_rag(query, current_face_key=payload.currentFaceKey)


@app.get("/api/ai/rag/search")
def search_ai_rag(q: str = "", currentFaceKey: str | None = None, limit: int = 8) -> dict[str, Any]:
    documents = search_documents(q, limit=max(1, min(limit, 20)), current_face_key=currentFaceKey)
    return {
        "query": q,
        "currentFaceKey": currentFaceKey,
        "count": len(documents),
        "documents": documents,
    }


@app.post("/api/ai/emotion-face-map")
def map_emotion_to_face(payload: AiEmotionFaceMapRequest) -> dict[str, Any]:
    try:
        result = resolve_emotion_face_mapping(payload.emotion)
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        **result,
        "confidence": max(0.0, min(float(payload.confidence), 1.0)),
        "currentFaceKey": payload.currentFaceKey,
    }


@app.get("/api/culture/graph")
def get_culture_graph() -> dict[str, Any]:
    return build_cultural_graph()


@app.get("/api/opera/media")
def get_opera_media_catalog() -> dict[str, Any]:
    return list_opera_media()


@app.get("/api/opera/media/{face_key}")
def get_opera_media_for_face(face_key: str) -> dict[str, Any]:
    try:
        return get_opera_media(face_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Opera media not found: {face_key}") from exc


@app.get("/api/ai/graph")
def get_ai_graph_context(q: str = "", currentFaceKey: str | None = None, limit: int = 8) -> dict[str, Any]:
    query = q.strip() or "脸谱 颜色 寓意 剧目 关系"
    result = search_graph(query, current_face_key=currentFaceKey, limit=max(1, min(limit, 16)))
    explanation = explain_graph_context(query, current_face_key=currentFaceKey)
    return {
        **result,
        "summary": explanation["summary"],
    }


@app.post("/api/ai/agent")
def run_ai_guide_agent(payload: AiAgentRequest) -> dict[str, Any]:
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    return run_agent(
        message,
        current_face_key=payload.currentFaceKey,
        ui_context=payload.uiContext or {},
        system_health=get_hq_mask_health(),
        reconstruction_profile=get_reconstruction_profile(
            os.environ.get("HQ_MASK_RECONSTRUCTION_PROFILE", DEFAULT_PROFILE)
        ),
    )


@app.post("/api/ai/narration")
def generate_ai_narration(payload: AiNarrationRequest) -> dict[str, Any]:
    return generate_narration(
        current_face_key=payload.currentFaceKey,
        ui_context=payload.uiContext or {},
        duration_seconds=payload.durationSeconds,
    )


@app.post("/api/ai/report")
def generate_ai_visit_report(payload: AiReportRequest) -> dict[str, Any]:
    return generate_visit_report(
        {
            "currentFaceKey": payload.currentFaceKey,
            "viewedFaceKeys": payload.viewedFaceKeys or [],
            "uiContext": payload.uiContext or {},
            "performance": payload.performance or {},
            "gestureDataset": payload.gestureDataset or {},
            "generation": payload.generation or {},
        }
    )


@app.post("/api/ai/recommend")
def recommend_ai_face(payload: AiRecommendRequest) -> dict[str, Any]:
    return recommend_face(
        payload.currentFaceKey,
        payload.viewedFaceKeys,
        preference_events=payload.preferenceEvents or [],
        ui_context=payload.uiContext or {},
    )


@app.post("/api/ai/visual-qa")
def run_ai_visual_quality(payload: AiVisualQaRequest) -> dict[str, Any]:
    return visual_quality_report(
        image_base64=payload.imageBase64,
        current_face_key=payload.currentFaceKey,
        ui_context=payload.uiContext or {},
        face_landmarks=payload.faceLandmarks,
        hand_landmarks=payload.handLandmarks,
        prompt=payload.prompt,
    )


@app.post("/api/ai/clip/search")
def run_ai_clip_search(payload: AiClipSearchRequest) -> dict[str, Any]:
    return multimodal_search(
        query=payload.query,
        image_base64=payload.imageBase64,
        current_face_key=payload.currentFaceKey,
        limit=payload.limit,
    )


@app.get("/api/ai/clip/search")
def run_ai_clip_search_get(q: str = "", currentFaceKey: str | None = None, limit: int = 5) -> dict[str, Any]:
    return multimodal_search(query=q, current_face_key=currentFaceKey, limit=limit)


@app.post("/api/ai/creative-face")
def run_ai_creative_face(payload: AiCreativeFaceRequest) -> dict[str, Any]:
    return generate_creative_face_design(
        prompt=payload.prompt,
        current_face_key=payload.currentFaceKey,
        style=payload.style,
    )


@app.post("/api/ai/sam/segment")
def run_ai_sam_segment(payload: AiSamSegmentRequest) -> dict[str, Any]:
    return segment_occlusion(
        image_base64=payload.imageBase64,
        current_face_key=payload.currentFaceKey,
        ui_context=payload.uiContext or {},
        face_landmarks=payload.faceLandmarks,
        hand_landmarks=payload.handLandmarks,
    )


@app.get("/api/3d-print/capability")
def get_3d_print_capability() -> dict[str, Any]:
    return get_print_capability()


@app.get("/api/3d-print/printers")
def get_3d_print_printers() -> dict[str, Any]:
    return list_demo_printers()


@app.post("/api/3d-print/preflight")
def run_3d_print_preflight(payload: PrintPreflightRequest) -> dict[str, Any]:
    try:
        return preflight_obj(
            obj_url=payload.objUrl,
            target_height_mm=payload.targetHeightMm,
            material=payload.material,
            quality=payload.quality,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/3d-print/jobs")
def create_3d_print_job(payload: PrintJobRequest) -> dict[str, Any]:
    try:
        return create_demo_print_job(_model_dump(payload))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/3d-print/jobs/{job_id}")
def get_3d_print_job(job_id: str) -> dict[str, Any]:
    job = get_demo_print_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="3D print job not found")
    return job


@app.post("/api/3d-print/jobs/{job_id}/cancel")
def cancel_3d_print_job(job_id: str) -> dict[str, Any]:
    job = cancel_demo_print_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="3D print job not found")
    return job


@app.get("/api/3dgs/status")
def get_3dgs_capability() -> dict[str, Any]:
    return get_3dgs_status()


@app.get("/api/3dgs/scenes")
def get_3dgs_scenes() -> dict[str, Any]:
    return list_scenes()


@app.get("/api/3dgs/classic-scenes")
def get_3dgs_classic_scenes() -> dict[str, Any]:
    return list_classic_scenes()


@app.get("/api/3dgs/scenes/{scene_id}")
def get_3dgs_scene(scene_id: str) -> dict[str, Any]:
    return get_scene(scene_id)


@app.post("/api/3dgs/scenes")
def create_3dgs_scene(payload: DigitalSceneRequest) -> dict[str, Any]:
    return create_scene_manifest(_model_dump(payload))


@app.post("/api/hq-mask/jobs")
def create_hq_mask_job(payload: HqMaskJobRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    job = create_job(_model_dump(payload))
    background_tasks.add_task(_run_guarded_job, job["jobId"], _run_job)
    return {"jobId": job["jobId"], "status": job["status"]}


@app.get("/api/hq-mask/jobs/{job_id}")
def get_hq_mask_job(job_id: str) -> dict[str, Any]:
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return _public_job(job)


@app.get("/api/hq-mask/jobs")
def list_hq_mask_jobs(limit: int = 50) -> dict[str, Any]:
    return {
        "summary": get_job_summary(),
        "jobs": [_public_job(job) for job in list_jobs(limit)],
    }


@app.post("/api/personal-face/jobs")
def create_personal_face_job(
    payload: PersonalFaceObjRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    job = create_job(_model_dump(payload))
    background_tasks.add_task(_run_guarded_job, job["jobId"], _run_personal_obj_job)
    return {"jobId": job["jobId"], "status": job["status"]}


@app.get("/api/personal-face/jobs/{job_id}")
def get_personal_face_job(job_id: str) -> dict[str, Any]:
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return _public_job(job)
