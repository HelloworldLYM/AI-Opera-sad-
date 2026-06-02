from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

cv2 = None
np = None


REQUIRED_ANCHORS = [
    "left_eye",
    "right_eye",
    "nose_tip",
    "mouth_left",
    "mouth_right",
    "chin",
    "forehead",
    "left_cheek",
    "right_cheek",
]


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def ensure_image_libs() -> None:
    global cv2, np
    if cv2 is not None and np is not None:
        return
    try:
        import cv2 as cv2_module
        import numpy as np_module
    except ModuleNotFoundError as exc:
        fail(
            "Missing Python dependency: "
            f"{exc.name}. Please install opencv-python and numpy before generating UV PNGs."
        )
    cv2 = cv2_module
    np = np_module


def load_json(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        fail(f"JSON file not found: {path}")
    except json.JSONDecodeError as exc:
        fail(f"Invalid JSON in {path}: {exc}")
    except OSError as exc:
        fail(f"Could not read JSON file {path}: {exc}")


def validate_anchors(anchors: dict) -> None:
    missing = [name for name in REQUIRED_ANCHORS if name not in anchors]
    if missing:
        fail(f"Missing required anchors: {', '.join(missing)}")

    for name in REQUIRED_ANCHORS:
        value = anchors[name]
        if (
            not isinstance(value, (list, tuple))
            or len(value) != 2
            or not all(isinstance(v, (int, float)) for v in value)
        ):
            fail(f"Anchor '{name}' must be a two-number array, got: {value!r}")


def anchors_to_points(anchors: dict) -> np.ndarray:
    return np.array([anchors[name] for name in REQUIRED_ANCHORS], dtype=np.float32)


def read_image(path: Path) -> np.ndarray:
    if not path.exists():
        fail(f"Input image not found: {path}")

    ensure_image_libs()
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if image is None:
        fail(f"Could not decode image: {path}")

    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2RGBA)

    channels = image.shape[2]
    if channels == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2RGBA)
    if channels == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA)

    fail(f"Unsupported image channel count in {path}: {channels}")


def read_template_size(path: Path) -> tuple[int, int]:
    if not path.exists():
        return 1024, 1024

    ensure_image_libs()
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if image is None:
        fail(f"Could not decode template image: {path}")
    height, width = image.shape[:2]
    return int(width), int(height)


def delaunay_triangles(dst_points: np.ndarray, out_size: tuple[int, int]) -> np.ndarray:
    try:
        from scipy.spatial import Delaunay  # type: ignore

        return Delaunay(dst_points).simplices.astype(np.int32)
    except Exception:
        return delaunay_triangles_opencv(dst_points, out_size)


def delaunay_triangles_opencv(dst_points: np.ndarray, out_size: tuple[int, int]) -> np.ndarray:
    width, height = out_size
    subdiv = cv2.Subdiv2D((0, 0, width, height))

    clamped = []
    for x, y in dst_points:
        px = float(np.clip(x, 0, width - 1))
        py = float(np.clip(y, 0, height - 1))
        clamped.append((px, py))
        subdiv.insert((px, py))

    raw_triangles = subdiv.getTriangleList()
    triangles: list[list[int]] = []

    for tri in raw_triangles:
        coords = np.array(
            [[tri[0], tri[1]], [tri[2], tri[3]], [tri[4], tri[5]]],
            dtype=np.float32,
        )
        if np.any(coords[:, 0] < 0) or np.any(coords[:, 0] >= width):
            continue
        if np.any(coords[:, 1] < 0) or np.any(coords[:, 1] >= height):
            continue

        indices: list[int] = []
        for point in coords:
            distances = np.linalg.norm(dst_points - point, axis=1)
            index = int(np.argmin(distances))
            if distances[index] > 2.0:
                break
            indices.append(index)

        if len(indices) == 3 and len(set(indices)) == 3:
            sorted_indices = sorted(indices)
            if sorted_indices not in triangles:
                triangles.append(sorted_indices)

    if not triangles:
        fail("Could not build Delaunay triangles from anchors")

    return np.array(triangles, dtype=np.int32)


def alpha_blend_patch(output: np.ndarray, patch: np.ndarray, mask: np.ndarray, rect: tuple[int, int, int, int]) -> None:
    x, y, w, h = rect
    roi = output[y : y + h, x : x + w]

    coverage = (mask.astype(np.float32) / 255.0)[..., None]
    alpha = (patch[..., 3:4].astype(np.float32) / 255.0) * coverage
    inv_alpha = 1.0 - alpha

    roi_rgb = roi[..., :3].astype(np.float32)
    patch_rgb = patch[..., :3].astype(np.float32)
    roi[..., :3] = np.clip(patch_rgb * alpha + roi_rgb * inv_alpha, 0, 255).astype(np.uint8)

    roi_alpha = roi[..., 3:4].astype(np.float32) / 255.0
    out_alpha = alpha + roi_alpha * inv_alpha
    roi[..., 3:4] = np.clip(out_alpha * 255.0, 0, 255).astype(np.uint8)


def warp_triangle(
    image: np.ndarray,
    output: np.ndarray,
    src_tri: np.ndarray,
    dst_tri: np.ndarray,
) -> None:
    src_rect = cv2.boundingRect(src_tri.astype(np.float32))
    dst_rect = cv2.boundingRect(dst_tri.astype(np.float32))

    sx, sy, sw, sh = src_rect
    dx, dy, dw, dh = dst_rect
    if sw <= 0 or sh <= 0 or dw <= 0 or dh <= 0:
        return

    src_crop = image[sy : sy + sh, sx : sx + sw]
    if src_crop.size == 0:
        return

    src_local = src_tri - np.array([sx, sy], dtype=np.float32)
    dst_local = dst_tri - np.array([dx, dy], dtype=np.float32)

    transform = cv2.getAffineTransform(src_local.astype(np.float32), dst_local.astype(np.float32))
    warped = cv2.warpAffine(
        src_crop,
        transform,
        (dw, dh),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )

    mask = np.zeros((dh, dw), dtype=np.uint8)
    cv2.fillConvexPoly(mask, np.round(dst_local).astype(np.int32), 255)
    alpha_blend_patch(output, warped, mask, dst_rect)


def warp_piecewise_affine(
    image: np.ndarray,
    src_points: np.ndarray,
    dst_points: np.ndarray,
    out_size: tuple[int, int],
) -> np.ndarray:
    width, height = out_size
    output = np.zeros((height, width, 4), dtype=np.uint8)
    triangles = delaunay_triangles(dst_points, out_size)

    for tri_indices in triangles:
        src_tri = src_points[tri_indices]
        dst_tri = dst_points[tri_indices]
        warp_triangle(image, output, src_tri, dst_tri)

    return output


def save_image(path: Path, image: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bgra = cv2.cvtColor(image, cv2.COLOR_RGBA2BGRA)
    ok, encoded = cv2.imencode(".png", bgra)
    if not ok:
        fail(f"Could not encode PNG: {path}")
    encoded.tofile(str(path))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Warp a flat face-painting PNG into standard UV texture space using anchor landmarks.",
    )
    parser.add_argument("--image", required=True, type=Path, help="Input flat face-painting PNG")
    parser.add_argument("--anchors", required=True, type=Path, help="Source anchor JSON")
    parser.add_argument("--template", required=True, type=Path, help="UV template PNG; falls back to 1024x1024 transparent canvas if missing")
    parser.add_argument("--template-anchors", required=True, type=Path, help="UV template anchor JSON")
    parser.add_argument("--out", required=True, type=Path, help="Output UV PNG path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    anchors = load_json(args.anchors)
    template_anchors = load_json(args.template_anchors)
    validate_anchors(anchors)
    validate_anchors(template_anchors)
    if not args.image.exists():
        fail(f"Input image not found: {args.image}")

    ensure_image_libs()
    image = read_image(args.image)
    out_size = read_template_size(args.template)
    src_points = anchors_to_points(anchors)
    dst_points = anchors_to_points(template_anchors)

    warped = warp_piecewise_affine(image, src_points, dst_points, out_size)
    save_image(args.out, warped)

    print(f"Input image: {args.image}")
    print(f"Output size: {out_size[0]}x{out_size[1]}")
    print(f"Anchors: {len(REQUIRED_ANCHORS)}")
    print(f"Output file: {args.out}")


if __name__ == "__main__":
    main()
