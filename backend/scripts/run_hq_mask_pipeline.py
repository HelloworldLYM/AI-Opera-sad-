from __future__ import annotations

import argparse
import locale
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Optional


SCRIPT_DIR = Path(__file__).resolve().parent
WORK_DIR = Path.cwd().resolve()
DEFAULT_TEMPLATE = Path("public/legacy/uv_templates/face_uv_template.png")
DEFAULT_TEMPLATE_ANCHORS = Path("public/legacy/uv_templates/face_uv_template_landmarks.json")
DEFAULT_UV_DIR = Path("public/legacy/faces_uv")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a high quality GLB mask from OBJ, flat facepaint PNG, and anchors JSON."
    )
    parser.add_argument("--obj", required=True, type=Path, help="Input OBJ face mesh path")
    parser.add_argument(
        "--obj-text-file",
        type=Path,
        help="Optional exported OBJ text file used when --obj does not exist",
    )
    parser.add_argument("--paint", required=True, type=Path, help="Input flat facepaint PNG path")
    parser.add_argument("--anchors", required=True, type=Path, help="Input facepaint anchors JSON path")
    parser.add_argument("--texture-key", required=True, help="Texture key used for the UV output filename")
    parser.add_argument("--out", required=True, type=Path, help="Output GLB path")
    parser.add_argument("--template", default=DEFAULT_TEMPLATE, type=Path, help="Optional UV template PNG path")
    parser.add_argument(
        "--template-anchors",
        default=DEFAULT_TEMPLATE_ANCHORS,
        type=Path,
        help="UV template anchors JSON path",
    )
    parser.add_argument(
        "--blender-bin",
        default=os.environ.get("BLENDER_BIN", "blender"),
        help="Blender executable path, or set BLENDER_BIN",
    )
    parser.add_argument("--thickness", default=0.015, type=float, help="Mask shell thickness")
    parser.add_argument("--bevel", default=0.003, type=float, help="Mask edge bevel width")
    return parser.parse_args(argv)


def resolve_input_file(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.exists():
        fail(f"{label} file not found: {resolved}")
    if not resolved.is_file():
        fail(f"{label} path is not a file: {resolved}")
    return resolved


def resolve_output_file(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    try:
        resolved.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        fail(f"Could not create {label} directory {resolved.parent}: {exc}")
    return resolved


def create_temp_job_dir() -> Path:
    jobs_dir = WORK_DIR / "backend" / "jobs"
    temp_dir = jobs_dir / f"hq_mask_pipeline_{uuid.uuid4().hex[:10]}"
    try:
        temp_dir.mkdir(parents=True, exist_ok=False)
    except OSError as exc:
        fail(f"Could not create temporary job directory {temp_dir}: {exc}")
    return temp_dir


def cleanup_temp_job_dir(temp_dir: Path) -> None:
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except OSError:
        pass


def normalize_texture_key(texture_key: str) -> str:
    normalized = texture_key.strip()
    if not normalized:
        fail("--texture-key cannot be empty")
    if "/" in normalized or "\\" in normalized:
        fail("--texture-key must be a filename-safe key, not a path")
    return normalized


def prepare_obj_path(args: argparse.Namespace, temp_dir: Optional[Path] = None) -> Path:
    obj_path = args.obj.expanduser().resolve()
    if obj_path.exists():
        if not obj_path.is_file():
            fail(f"OBJ path is not a file: {obj_path}")
        return obj_path

    if args.obj_text_file is None:
        fail(
            f"OBJ file not found: {obj_path}. "
            "If you only have exported OBJ text, pass --obj-text-file."
        )

    if temp_dir is None:
        fail("Internal error: temporary directory is required for --obj-text-file")

    obj_text_path = resolve_input_file(args.obj_text_file, "OBJ text")
    temp_obj_path = temp_dir / obj_path.name
    try:
        obj_text = obj_text_path.read_text(encoding="utf-8")
        temp_obj_path.write_text(obj_text, encoding="utf-8", newline="\n")
    except UnicodeDecodeError as exc:
        fail(f"OBJ text file must be UTF-8 text: {obj_text_path}: {exc}")
    except OSError as exc:
        fail(f"Could not create temporary OBJ from {obj_text_path}: {exc}")

    print(f"OBJ input missing, using temporary OBJ from text: {temp_obj_path}")
    return temp_obj_path


def format_command(command: list[str]) -> str:
    return subprocess.list2cmdline([str(part) for part in command])


def safe_print(text: str, stream = sys.stdout) -> None:
    encoding = getattr(stream, "encoding", None) or "utf-8"
    safe_text = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(safe_text, file=stream)


def print_captured_output(result: subprocess.CompletedProcess[str]) -> None:
    if result.stdout:
        safe_print(result.stdout.rstrip())
    if result.stderr:
        safe_print(result.stderr.rstrip(), stream=sys.stderr)


def run_command(command: list[str], step_name: str, blender_step: bool = False) -> None:
    printable = format_command(command)
    print(f"Running: {step_name}")
    print(f"Command: {printable}")

    try:
        result = subprocess.run(
            [str(part) for part in command],
            cwd=str(WORK_DIR),
            capture_output=True,
            text=True,
            encoding=locale.getpreferredencoding(False) or "utf-8",
            errors="backslashreplace",
            check=False,
        )
    except FileNotFoundError:
        if blender_step:
            fail(
                f"Blender executable not found: {command[0]}. "
                "Set --blender-bin to the full Blender executable path, or set BLENDER_BIN."
            )
        fail(f"Executable not found while running {step_name}: {command[0]}")
    except OSError as exc:
        fail(f"Could not run {step_name}: {exc}")

    print_captured_output(result)
    if result.returncode != 0:
        fail(f"{step_name} failed with exit code {result.returncode}")


def generate_uv(
    paint_path: Path,
    anchors_path: Path,
    template_path: Path,
    template_anchors_path: Path,
    uv_out_path: Path,
) -> None:
    script_path = SCRIPT_DIR / "generate_face_uv.py"
    if not script_path.exists():
        fail(f"UV generation script not found: {script_path}")

    command = [
        sys.executable,
        str(script_path),
        "--image",
        str(paint_path),
        "--anchors",
        str(anchors_path),
        "--template",
        str(template_path),
        "--template-anchors",
        str(template_anchors_path),
        "--out",
        str(uv_out_path),
    ]
    run_command(command, "Generate UV facepaint")


def generate_glb(
    blender_bin: str,
    obj_path: Path,
    uv_texture_path: Path,
    out_path: Path,
    thickness: float,
    bevel: float,
) -> None:
    script_path = SCRIPT_DIR / "apply_facepaint_to_obj.py"
    if not script_path.exists():
        fail(f"Blender asset script not found: {script_path}")

    command = [
        blender_bin,
        "-b",
        "--python",
        str(script_path),
        "--",
        "--obj",
        str(obj_path),
        "--texture",
        str(uv_texture_path),
        "--out",
        str(out_path),
        "--thickness",
        str(thickness),
        "--bevel",
        str(bevel),
    ]
    run_command(command, "Generate GLB mask", blender_step=True)


def main() -> None:
    start_time = time.perf_counter()
    args = parse_args()
    texture_key = normalize_texture_key(args.texture_key)

    paint_path = resolve_input_file(args.paint, "Facepaint PNG")
    anchors_path = resolve_input_file(args.anchors, "Anchors JSON")
    template_anchors_path = resolve_input_file(args.template_anchors, "Template anchors JSON")
    template_path = args.template.expanduser().resolve()
    out_path = resolve_output_file(args.out, "GLB output")
    uv_out_path = resolve_output_file(DEFAULT_UV_DIR / f"{texture_key}_uv.png", "UV output")

    if not template_path.exists():
        print(f"UV template PNG not found, using generator fallback canvas: {template_path}")

    def run_with_obj(obj_path: Path) -> None:
        generate_uv(
            paint_path=paint_path,
            anchors_path=anchors_path,
            template_path=template_path,
            template_anchors_path=template_anchors_path,
            uv_out_path=uv_out_path,
        )
        generate_glb(
            blender_bin=args.blender_bin,
            obj_path=obj_path,
            uv_texture_path=uv_out_path,
            out_path=out_path,
            thickness=args.thickness,
            bevel=args.bevel,
        )

    if args.obj.expanduser().resolve().exists():
        run_with_obj(prepare_obj_path(args))
    else:
        if args.obj_text_file is None:
            prepare_obj_path(args)

        temp_dir = create_temp_job_dir()
        try:
            obj_path = prepare_obj_path(args, temp_dir)
            run_with_obj(obj_path)
        finally:
            cleanup_temp_job_dir(temp_dir)

    elapsed = time.perf_counter() - start_time
    print(f"UV output: {uv_out_path}")
    print(f"GLB output: {out_path}")
    print(f"Total time: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
