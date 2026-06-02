from __future__ import annotations

import locale
import os
import shutil
import subprocess
from pathlib import Path

from backend.services.trimesh_service import export_glb_with_trimesh


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BLENDER_SCRIPT = PROJECT_ROOT / "backend" / "scripts" / "apply_facepaint_to_obj.py"


def _candidate_desktops() -> list[Path]:
    candidates = [
        Path.home() / "Desktop",
        PROJECT_ROOT.parent,
    ]
    user_profile = os.environ.get("USERPROFILE")
    if user_profile:
        candidates.append(Path(user_profile) / "Desktop")

    seen: set[str] = set()
    desktops: list[Path] = []
    for candidate in candidates:
        try:
            resolved = candidate.expanduser().resolve()
        except OSError:
            continue
        key = str(resolved).lower()
        if key in seen or not resolved.is_dir():
            continue
        seen.add(key)
        desktops.append(resolved)
    return desktops


def _blender_score(path: Path) -> tuple[int, int]:
    text = str(path).lower()
    score = 0
    if "5.1" in text or "51" in text:
        score += 100
    if "4.5.9" in text or "459" in text:
        score += 95
    elif "4.5" in text or "45" in text:
        score += 90
    if "blender" in text:
        score += 10
    return score, -len(path.parts)


def _walk_for_desktop_blender(desktop: Path, max_depth: int = 4) -> list[Path]:
    matches: list[Path] = []
    base_depth = len(desktop.parts)
    try:
        for root, dirs, files in os.walk(desktop):
            root_path = Path(root)
            depth = len(root_path.parts) - base_depth
            if depth > max_depth:
                dirs[:] = []
                continue
            if any(file_name.lower() == "blender.exe" for file_name in files):
                matches.append(root_path / "blender.exe")
    except OSError:
        return []
    return matches


def find_blender_executable(blender_bin: str | None = None) -> str | None:
    explicit = (blender_bin or os.environ.get("BLENDER_BIN", "")).strip()
    if explicit:
        explicit_path = Path(explicit).expanduser()
        if explicit_path.is_file():
            return str(explicit_path.resolve())
        resolved = shutil.which(explicit)
        if resolved:
            return resolved
        return None

    resolved = shutil.which("blender")
    if resolved:
        return resolved

    known_dirs = [
        "Blender 5.1",
        "Blender5.1",
        "blender-5.1",
        "blender-5.1.0-windows-x64",
        "Blender 4.5.9",
        "Blender4.5.9",
        "blender-4.5.9",
        "blender-4.5.9-windows-x64",
        "Blender 4.5",
        "Blender4.5",
        "blender-4.5",
        "blender-4.5-windows-x64",
        "Blender",
        "blender",
    ]
    matches: list[Path] = []
    program_files_roots = [
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Blender Foundation",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Blender Foundation",
    ]
    for root in program_files_roots:
        if not root.is_dir():
            continue
        for directory in known_dirs:
            candidate = root / directory / "blender.exe"
            if candidate.is_file():
                matches.append(candidate)

    for desktop in _candidate_desktops():
        direct_file = desktop / "blender.exe"
        if direct_file.is_file():
            matches.append(direct_file)
        for directory in known_dirs:
            candidate = desktop / directory / "blender.exe"
            if candidate.is_file():
                matches.append(candidate)
        matches.extend(_walk_for_desktop_blender(desktop))

    existing = [path.resolve() for path in matches if path.is_file()]
    if not existing:
        return None
    return str(sorted(existing, key=_blender_score, reverse=True)[0])


def _decode_completed_output(result: subprocess.CompletedProcess[str]) -> str:
    parts = []
    if result.stdout:
        parts.append(result.stdout.strip())
    if result.stderr:
        parts.append(result.stderr.strip())
    return "\n".join(part for part in parts if part)


def render_glb_with_blender(
    obj_path: Path | str,
    texture_path: Path | str,
    out_path: Path | str,
    blender_bin: str | None = None,
    thickness: float = 0.015,
    bevel: float = 0.003,
    normal_map_path: Path | str | None = None,
) -> Path:
    obj = Path(obj_path).expanduser().resolve()
    texture = Path(texture_path).expanduser().resolve()
    out = Path(out_path).expanduser().resolve()
    normal_map = Path(normal_map_path).expanduser().resolve() if normal_map_path else None
    blender = find_blender_executable(blender_bin)
    exporter = os.environ.get("HQ_MASK_GLB_EXPORTER", "auto").strip().lower() or "auto"

    if not obj.exists():
        raise RuntimeError(f"OBJ file not found: {obj}")
    if not texture.exists():
        raise RuntimeError(f"UV texture PNG not found: {texture}")
    if normal_map and not normal_map.exists():
        normal_map = None
    if not BLENDER_SCRIPT.exists():
        raise RuntimeError(f"Blender asset script not found: {BLENDER_SCRIPT}")

    blender_is_available = blender is not None
    if exporter == "trimesh" or (exporter == "auto" and not blender_is_available):
        return export_glb_with_trimesh(obj_path=obj, texture_path=texture, out_path=out)
    if exporter not in {"auto", "blender"}:
        raise RuntimeError(f"Unsupported HQ_MASK_GLB_EXPORTER: {exporter}")
    if not blender:
        raise RuntimeError(
            "Blender executable not found. Put Blender 5.1 on the Desktop in a folder "
            "that contains blender.exe, or set BLENDER_BIN to the full blender.exe path."
        )

    out.parent.mkdir(parents=True, exist_ok=True)
    command = [
        blender,
        "-b",
        "--python",
        str(BLENDER_SCRIPT),
        "--",
        "--obj",
        str(obj),
        "--texture",
        str(texture),
        "--out",
        str(out),
        "--thickness",
        str(thickness),
        "--bevel",
        str(bevel),
    ]
    if normal_map:
        command.extend(["--normal-map", str(normal_map)])

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
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Blender executable not found: {blender}. Set BLENDER_BIN or pass a valid blender_bin."
        ) from exc
    except OSError as exc:
        raise RuntimeError(f"Could not run Blender: {exc}") from exc

    if result.returncode != 0:
        output = _decode_completed_output(result)
        raise RuntimeError(f"Blender GLB export failed with exit code {result.returncode}: {output}")

    return out
