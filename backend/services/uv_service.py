from __future__ import annotations

import locale
import subprocess
import sys
from pathlib import Path

from backend.services.culture_knowledge_service import FACES


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = PROJECT_ROOT / "backend" / "scripts"
FACES_DIR = PROJECT_ROOT / "public" / "legacy" / "faces"
ANCHORS_DIR = PROJECT_ROOT / "public" / "legacy" / "anchors"
DEFAULT_TEMPLATE = PROJECT_ROOT / "public" / "legacy" / "uv_templates" / "face_uv_template.png"
DEFAULT_TEMPLATE_ANCHORS = (
    PROJECT_ROOT / "public" / "legacy" / "uv_templates" / "face_uv_template_landmarks.json"
)


TEXTURE_ALIASES = {
    str(face["key"]): [str(face["key"]), str(face["title"]), *[str(alias) for alias in face.get("aliases", [])]]
    for face in FACES
}


def _canonical_texture_key(texture_key: str) -> str:
    raw = texture_key.strip()
    stem = Path(raw).stem
    lowered = stem.lower()
    for canonical, aliases in TEXTURE_ALIASES.items():
        if lowered == canonical or stem in aliases:
            return canonical
    return stem or "guanyu"


def _decode_completed_output(result: subprocess.CompletedProcess[str]) -> str:
    parts = []
    if result.stdout:
        parts.append(result.stdout.strip())
    if result.stderr:
        parts.append(result.stderr.strip())
    return "\n".join(part for part in parts if part)


def _candidate_names(texture_key: str) -> list[str]:
    key = _canonical_texture_key(texture_key)
    names = [key]
    names.extend(TEXTURE_ALIASES.get(key, []))
    raw_stem = Path(texture_key.strip()).stem
    if raw_stem:
        names.append(raw_stem)
    deduped: list[str] = []
    for name in names:
        if name and name not in deduped:
            deduped.append(name)
    return deduped


def _find_facepaint(texture_key: str) -> Path:
    candidates = [FACES_DIR / f"{name}.png" for name in _candidate_names(texture_key)]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise RuntimeError(
        "Facepaint PNG not found for textureKey "
        f"{texture_key!r}. Tried: {', '.join(str(path) for path in candidates)}"
    )


def _find_anchors(texture_key: str) -> Path:
    candidates = [ANCHORS_DIR / f"{name}.json" for name in _candidate_names(texture_key)]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    default_anchor = ANCHORS_DIR / "guanyu.json"
    if default_anchor.exists():
        return default_anchor
    raise RuntimeError(
        "Anchors JSON not found for textureKey "
        f"{texture_key!r}. Tried: {', '.join(str(path) for path in candidates)}"
    )


def generate_uv_for_texture(
    texture_key: str,
    job_dir: Path | str,
    paint_path: Path | str | None = None,
    anchors_path: Path | str | None = None,
    template_path: Path | str | None = None,
    template_anchors_path: Path | str | None = None,
) -> Path:
    job_path = Path(job_dir).expanduser().resolve()
    job_path.mkdir(parents=True, exist_ok=True)

    paint = Path(paint_path).expanduser().resolve() if paint_path else _find_facepaint(texture_key)
    anchors = Path(anchors_path).expanduser().resolve() if anchors_path else _find_anchors(texture_key)
    template = Path(template_path).expanduser().resolve() if template_path else DEFAULT_TEMPLATE
    template_anchors = (
        Path(template_anchors_path).expanduser().resolve()
        if template_anchors_path
        else DEFAULT_TEMPLATE_ANCHORS
    )

    if not paint.exists():
        raise RuntimeError(f"Facepaint PNG file not found: {paint}")
    if not anchors.exists():
        raise RuntimeError(f"Anchors JSON file not found: {anchors}")
    if not template_anchors.exists():
        raise RuntimeError(f"Template anchors JSON file not found: {template_anchors}")

    out_path = job_path / f"{_canonical_texture_key(texture_key)}_uv.png"
    script_path = SCRIPTS_DIR / "generate_face_uv.py"
    if not script_path.exists():
        raise RuntimeError(f"UV generator script not found: {script_path}")

    command = [
        sys.executable,
        str(script_path),
        "--image",
        str(paint),
        "--anchors",
        str(anchors),
        "--template",
        str(template),
        "--template-anchors",
        str(template_anchors),
        "--out",
        str(out_path),
    ]
    try:
        result = subprocess.run(
            command,
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            encoding=locale.getpreferredencoding(False) or "utf-8",
            errors="backslashreplace",
            check=False,
        )
    except OSError as exc:
        raise RuntimeError(f"Could not run UV generator: {exc}") from exc

    if result.returncode != 0:
        output = _decode_completed_output(result)
        raise RuntimeError(f"UV generation failed with exit code {result.returncode}: {output}")

    return out_path
