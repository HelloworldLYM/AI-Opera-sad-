from __future__ import annotations

import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_OBJ = PROJECT_ROOT / "backend" / "samples" / "raw_face.obj"
DEFAULT_DDFA_V3_REPO = PROJECT_ROOT / "3DDFA-V3"
DDFA_V3_REQUIRED_ASSETS = [
    "face_model.npy",
    "large_base_net.pth",
    "net_recon.pth",
    "retinaface_resnet50_2020-07-20_old_torch.pth",
    "similarity_Lm3D_all.mat",
]
DDFA_V3_ADAPTER_CANDIDATES = [
    "export_obj_adapter.py",
    "demo_export_obj.py",
    "tools/export_obj_adapter.py",
    "tools/export_obj.py",
    "scripts/export_obj_adapter.py",
    "scripts/export_obj.py",
]


def _require_existing_dir(path_value: str, label: str, provider: str) -> Path:
    path = Path(path_value).expanduser().resolve()
    if not path.exists():
        raise RuntimeError(f"{provider} is not configured. {label} does not exist: {path}")
    if not path.is_dir():
        raise RuntimeError(f"{provider} is not configured. {label} is not a directory: {path}")
    return path


def _require_face_image(face_image_path: Path | str | None, provider: str) -> Path:
    if face_image_path is None:
        raise RuntimeError(f"{provider} requires face_image_path")

    path = Path(face_image_path).expanduser().resolve()
    if not path.exists():
        raise RuntimeError(f"{provider} face image not found: {path}")
    if not path.is_file():
        raise RuntimeError(f"{provider} face_image_path is not a file: {path}")
    return path


def _find_first_file(repo_path: Path, candidates: list[str]) -> Path | None:
    for relative_path in candidates:
        candidate = repo_path / relative_path
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def _run_adapter(command: list[str], cwd: Path, provider: str) -> None:
    try:
        result = subprocess.run(
            command,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"{provider} Python executable not found: {command[0]}") from exc
    except OSError as exc:
        raise RuntimeError(f"Could not run {provider} adapter: {exc}") from exc

    if result.returncode != 0:
        output = "\n".join(part for part in [result.stdout.strip(), result.stderr.strip()] if part)
        raise RuntimeError(f"{provider} adapter failed with exit code {result.returncode}: {output}")


def _select_exported_obj(output_dir: Path) -> Path:
    obj_files = sorted(output_dir.rglob("*.obj"))
    if not obj_files:
        raise RuntimeError(f"No OBJ file was produced in output directory: {output_dir}")

    preferred = [
        obj_path
        for obj_path in obj_files
        if "face.obj" == obj_path.name.lower()
        or "extracttex" in obj_path.name.lower()
        or "pcatex" in obj_path.name.lower()
    ]
    return preferred[0] if preferred else obj_files[0]


def _reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def _prepare_single_image_input(face_path: Path, input_dir: Path) -> Path:
    _reset_dir(input_dir)
    suffix = face_path.suffix if face_path.suffix.lower() in {".jpg", ".jpeg", ".png"} else ".jpg"
    copied_path = input_dir / f"face{suffix}"
    shutil.copyfile(face_path, copied_path)
    return copied_path


def _copy_obj(source: Path, out_obj_path: Path) -> None:
    if not source.exists():
        raise RuntimeError(f"OBJ source file not found: {source}")
    out_obj_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, out_obj_path)


def _read_obj_vertices_and_lines(obj_path: Path) -> tuple[list[str], list[tuple[float, float, float]]]:
    lines = obj_path.read_text(encoding="utf-8", errors="replace").splitlines()
    vertices: list[tuple[float, float, float]] = []
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("v "):
            continue
        parts = stripped.split()
        if len(parts) < 4:
            continue
        vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
    if not vertices:
        raise RuntimeError(f"OBJ has no vertices: {obj_path}")
    return lines, vertices


def _write_obj_with_fused_vertices(
    template_lines: list[str],
    fused_vertices: list[tuple[float, float, float]],
    out_obj_path: Path,
) -> None:
    vertex_index = 0
    out_lines: list[str] = [
        "# Fused personal face OBJ from multiple 3DDFA-V3 reconstructions",
        "# Topology and UVs are inherited from the first valid reconstruction",
    ]

    for line in template_lines:
        stripped = line.strip()
        if stripped.startswith("v "):
            if vertex_index >= len(fused_vertices):
                raise RuntimeError("Template OBJ has more vertex lines than fused vertices")
            x, y, z = fused_vertices[vertex_index]
            out_lines.append(f"v {x:.6f} {y:.6f} {z:.6f}")
            vertex_index += 1
        else:
            out_lines.append(line)

    if vertex_index != len(fused_vertices):
        raise RuntimeError("Fused vertex count does not match template OBJ")

    out_obj_path.parent.mkdir(parents=True, exist_ok=True)
    out_obj_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8", newline="\n")


def _fuse_same_topology_objs(obj_paths: list[Path], out_obj_path: Path) -> None:
    if not obj_paths:
        raise RuntimeError("No OBJ files provided for fusion")
    if len(obj_paths) == 1:
        _copy_obj(obj_paths[0], out_obj_path)
        return

    template_lines, first_vertices = _read_obj_vertices_and_lines(obj_paths[0])
    sums = [[x, y, z] for x, y, z in first_vertices]
    valid_count = 1

    for obj_path in obj_paths[1:]:
        _, vertices = _read_obj_vertices_and_lines(obj_path)
        if len(vertices) != len(sums):
            raise RuntimeError(
                "3DDFA-V3 fusion requires same-topology OBJ outputs. "
                f"{obj_path} has {len(vertices)} vertices, expected {len(sums)}."
            )
        for index, (x, y, z) in enumerate(vertices):
            sums[index][0] += x
            sums[index][1] += y
            sums[index][2] += z
        valid_count += 1

    fused_vertices = [
        (x / valid_count, y / valid_count, z / valid_count)
        for x, y, z in sums
    ]
    _write_obj_with_fused_vertices(template_lines, fused_vertices, out_obj_path)


def _write_fallback_obj(fallback_obj_text: str, out_obj_path: Path) -> None:
    text = fallback_obj_text.strip()
    if not text:
        raise RuntimeError("fallback_obj_text is empty")
    if "\nv " not in f"\n{text}":
        raise RuntimeError("fallback_obj_text does not look like OBJ text: missing vertex lines")

    out_obj_path.parent.mkdir(parents=True, exist_ok=True)
    out_obj_path.write_text(text + "\n", encoding="utf-8", newline="\n")


def _generate_mock_face_obj(out_obj_path: Path) -> None:
    rows = 18
    cols = 28
    vertices: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    faces: list[tuple[int, int, int, int]] = []

    for row in range(rows + 1):
        v = row / rows
        y = 1.15 - 2.3 * v
        width = 0.66 * math.sqrt(max(0.12, 1.0 - (y / 1.2) ** 2))

        for col in range(cols + 1):
            u = col / cols
            nx = 2.0 * u - 1.0
            x = nx * width
            z = 0.16 * (1.0 - nx * nx) * max(0.15, 1.0 - (y / 1.3) ** 2)
            vertices.append((x, y, z))
            uvs.append((u, 1.0 - v))

    def index(row: int, col: int) -> int:
        return row * (cols + 1) + col + 1

    for row in range(rows):
        for col in range(cols):
            faces.append(
                (
                    index(row, col),
                    index(row, col + 1),
                    index(row + 1, col + 1),
                    index(row + 1, col),
                )
            )

    out_obj_path.parent.mkdir(parents=True, exist_ok=True)
    with out_obj_path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("# Mock oval face mesh with basic UVs\n")
        for x, y, z in vertices:
            f.write(f"v {x:.6f} {y:.6f} {z:.6f}\n")
        for u, v in uvs:
            f.write(f"vt {u:.6f} {v:.6f}\n")
        for a, b, c, d in faces:
            f.write(f"f {a}/{a} {b}/{b} {c}/{c} {d}/{d}\n")


def _missing_3ddfa_v3_assets(repo_path: Path) -> list[str]:
    return [
        asset_name
        for asset_name in DDFA_V3_REQUIRED_ASSETS
        if not (repo_path / "assets" / asset_name).is_file()
    ]


def _3ddfa_v3_ready() -> bool:
    repo_value = os.environ.get("DDFA_V3_REPO_PATH", "").strip()
    repo_path = Path(repo_value).expanduser() if repo_value else DEFAULT_DDFA_V3_REPO
    if not repo_path.exists() or not repo_path.is_dir():
        return False
    if _missing_3ddfa_v3_assets(repo_path):
        return False
    return (repo_path / "demo.py").is_file() or _find_first_file(repo_path, DDFA_V3_ADAPTER_CANDIDATES) is not None


def _run_3ddfa_v3(face_image_path: Path | str | None, out_obj_path: Path) -> str:
    provider = "3ddfa-v3"
    repo_value = os.environ.get("DDFA_V3_REPO_PATH", "").strip()
    python_value = os.environ.get("DDFA_V3_PYTHON", "").strip()
    repo_path = _require_existing_dir(
        repo_value or str(DEFAULT_DDFA_V3_REPO),
        "DDFA_V3_REPO_PATH",
        provider,
    )
    missing_assets = _missing_3ddfa_v3_assets(repo_path)
    if missing_assets:
        raise RuntimeError(
            "3DDFA-V3 assets are incomplete. Missing files in "
            f"{repo_path / 'assets'}: {', '.join(missing_assets)}"
        )

    python_executable = python_value or sys.executable
    device = os.environ.get("DDFA_V3_DEVICE", "cuda").strip() or "cuda"
    detector = os.environ.get("DDFA_V3_DETECTOR", "retinaface").strip() or "retinaface"
    backbone = os.environ.get("DDFA_V3_BACKBONE", "resnet50").strip() or "resnet50"
    face_path = _require_face_image(face_image_path, provider)
    output_dir = out_obj_path.parent / "3ddfa_v3_out"
    input_dir = out_obj_path.parent / "3ddfa_v3_input"
    _reset_dir(output_dir)

    adapter = _find_first_file(
        repo_path,
        DDFA_V3_ADAPTER_CANDIDATES,
    )
    if adapter is not None:
        command = [
            python_executable,
            str(adapter),
            "--image",
            str(face_path),
            "--out-dir",
            str(output_dir),
            "--device",
            device,
            "--detector",
            detector,
            "--backbone",
            backbone,
        ]
    else:
        demo_py = repo_path / "demo.py"
        if not demo_py.exists():
            raise NotImplementedError("3DDFA-V3 demo.py was not found.")
        _prepare_single_image_input(face_path, input_dir)
        command = [
            python_executable,
            str(demo_py),
            "--inputpath",
            str(input_dir),
            "--savepath",
            str(output_dir),
            "--device",
            device,
            "--iscrop",
            "1",
            "--detector",
            detector,
            "--ldm68",
            "0",
            "--ldm106",
            "0",
            "--ldm106_2d",
            "0",
            "--ldm134",
            "0",
            "--seg_visible",
            "0",
            "--seg",
            "0",
            "--useTex",
            "1",
            "--extractTex",
            "0",
            "--backbone",
            backbone,
        ]

    _run_adapter(command, repo_path, provider)
    exported_obj = _select_exported_obj(output_dir)
    _copy_obj(exported_obj, out_obj_path)
    return provider


def _run_3ddfa_v3_multiview(face_image_paths: list[Path], out_obj_path: Path) -> str:
    if not face_image_paths:
        raise RuntimeError("3ddfa-v3 multiview reconstruction requires at least one image")
    if len(face_image_paths) == 1:
        return _run_3ddfa_v3(face_image_paths[0], out_obj_path)

    multi_dir = out_obj_path.parent / "3ddfa_v3_multiview"
    _reset_dir(multi_dir)
    frame_obj_paths: list[Path] = []

    for index, image_path in enumerate(face_image_paths):
        frame_dir = multi_dir / f"frame_{index:02d}"
        frame_obj_path = frame_dir / "face.obj"
        _run_3ddfa_v3(image_path, frame_obj_path)
        frame_obj_paths.append(frame_obj_path)

    _fuse_same_topology_objs(frame_obj_paths, out_obj_path)
    return f"3ddfa-v3-multiview-{len(frame_obj_paths)}"


def reconstruct_face_to_obj(
    face_image_path: Path | str | None,
    out_obj_path: Path | str,
    provider: str = "3ddfa-v3",
    fallback_obj_text: str | None = None,
    existing_obj_path: Path | str | None = None,
    face_image_paths: list[Path | str] | None = None,
) -> str:
    out_path = Path(out_obj_path).expanduser().resolve()
    selected_provider = (provider or "3ddfa-v3").strip().lower().replace("_", "-")
    has_fallback = bool(fallback_obj_text and fallback_obj_text.strip())
    image_inputs = [
        Path(path).expanduser().resolve()
        for path in (face_image_paths or [])
        if path
    ]
    if not image_inputs and face_image_path:
        image_inputs = [Path(face_image_path).expanduser().resolve()]

    if selected_provider == "auto":
        if image_inputs and _3ddfa_v3_ready():
            selected_provider = "3ddfa-v3"
        elif has_fallback:
            selected_provider = "fallback-obj"
        else:
            selected_provider = "mock"

    if selected_provider == "3ddfa-v3" and not image_inputs and has_fallback:
        selected_provider = "fallback-obj"

    if selected_provider == "fallback-obj":
        if not has_fallback:
            raise RuntimeError("fallback-obj provider requires fallback_obj_text")
        _write_fallback_obj(fallback_obj_text or "", out_path)
        return "fallback-obj"

    if selected_provider == "mock":
        if existing_obj_path:
            existing_path = Path(existing_obj_path).expanduser().resolve()
            _copy_obj(existing_path, out_path)
        elif SAMPLE_OBJ.exists():
            _copy_obj(SAMPLE_OBJ, out_path)
        else:
            _generate_mock_face_obj(out_path)
        return "mock"

    if selected_provider == "3ddfa-v3":
        return _run_3ddfa_v3_multiview(image_inputs, out_path)

    if selected_provider == "3ddfa-v2":
        raise RuntimeError("3DDFA-V2 is not used in this project. Use provider=3ddfa-v3.")

    raise RuntimeError(f"Unsupported face reconstruction provider: {provider}")
