from __future__ import annotations

from pathlib import Path


def _resolve_obj_index(value: str, size: int) -> int:
    index = int(value)
    return size + index if index < 0 else index - 1


def _parse_face_token(token: str, vertex_count: int, uv_count: int) -> tuple[int, int | None]:
    parts = token.split("/")
    vertex_index = _resolve_obj_index(parts[0], vertex_count)
    uv_index = None
    if len(parts) > 1 and parts[1]:
        uv_index = _resolve_obj_index(parts[1], uv_count)
    return vertex_index, uv_index


def _load_obj(obj_path: Path):
    import numpy as np

    vertices: list[list[float]] = []
    vertex_colors: list[list[float] | None] = []
    uvs: list[list[float]] = []
    faces: list[list[int]] = []
    face_uvs: list[list[int | None]] = []

    with obj_path.open("r", encoding="utf-8", errors="replace") as obj_file:
        for raw_line in obj_file:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split()
            if parts[0] == "v" and len(parts) >= 4:
                vertices.append([float(parts[1]), float(parts[2]), float(parts[3])])
                if len(parts) >= 7:
                    vertex_colors.append([float(parts[4]), float(parts[5]), float(parts[6])])
                else:
                    vertex_colors.append(None)
            elif parts[0] == "vt" and len(parts) >= 3:
                uvs.append([float(parts[1]), float(parts[2])])
            elif parts[0] == "f" and len(parts) >= 4:
                parsed = [_parse_face_token(token, len(vertices), len(uvs)) for token in parts[1:]]
                for i in range(1, len(parsed) - 1):
                    tri = [parsed[0], parsed[i], parsed[i + 1]]
                    faces.append([item[0] for item in tri])
                    face_uvs.append([item[1] for item in tri])

    if not vertices or not faces:
        raise RuntimeError(f"OBJ file has no usable mesh data: {obj_path}")

    return (
        np.asarray(vertices, dtype=np.float32),
        vertex_colors,
        np.asarray(uvs, dtype=np.float32) if uvs else np.zeros((0, 2), dtype=np.float32),
        np.asarray(faces, dtype=np.int64),
        face_uvs,
    )


def _base_vertex_colors(vertex_colors: list[list[float] | None], vertex_count: int):
    import numpy as np

    colors = np.full((vertex_count, 4), [225, 202, 176, 255], dtype=np.float32)
    for index, color in enumerate(vertex_colors):
        if color is None:
            continue
        rgb = np.asarray(color[:3], dtype=np.float32)
        if rgb.max(initial=0) <= 1.0:
            rgb *= 255.0
        colors[index, :3] = np.clip(rgb, 0, 255)
    return colors


def _sample_rgba(texture, u: float, v: float):
    import numpy as np

    height, width = texture.shape[:2]
    x = int(np.clip(round(u * (width - 1)), 0, width - 1))
    y = int(np.clip(round((1.0 - v) * (height - 1)), 0, height - 1))
    return texture[y, x].astype(np.float32)


def _texture_vertex_colors(vertices, uvs, faces, face_uvs, vertex_colors, texture_path: Path):
    import numpy as np
    from PIL import Image

    texture = np.asarray(Image.open(texture_path).convert("RGBA"), dtype=np.uint8)
    colors = _base_vertex_colors(vertex_colors, len(vertices))
    accum = np.zeros((len(vertices), 4), dtype=np.float32)
    counts = np.zeros((len(vertices), 1), dtype=np.float32)

    has_uvs = len(uvs) > 0 and any(any(uv is not None for uv in tri_uvs) for tri_uvs in face_uvs)
    if has_uvs:
        for face, tri_uvs in zip(faces, face_uvs):
            for vertex_index, uv_index in zip(face, tri_uvs):
                if uv_index is None or uv_index < 0 or uv_index >= len(uvs):
                    continue
                rgba = _sample_rgba(texture, float(uvs[uv_index][0]), float(uvs[uv_index][1]))
                accum[vertex_index] += rgba
                counts[vertex_index] += 1.0
    else:
        mins = vertices.min(axis=0)
        maxs = vertices.max(axis=0)
        span = np.maximum(maxs - mins, 1e-8)
        for vertex_index, vertex in enumerate(vertices):
            u = float((vertex[0] - mins[0]) / span[0])
            v = float((vertex[1] - mins[1]) / span[1])
            accum[vertex_index] = _sample_rgba(texture, u, v)
            counts[vertex_index] = 1.0

    sampled = counts[:, 0] > 0
    accum[sampled] = accum[sampled] / counts[sampled]
    opaque = sampled & (accum[:, 3] > 8)
    colors[opaque, :4] = accum[opaque, :4]
    colors[:, 3] = 255
    return np.clip(colors, 0, 255).astype(np.uint8)


def _center_and_scale(vertices, target_size: float = 2.0):
    import numpy as np

    mins = vertices.min(axis=0)
    maxs = vertices.max(axis=0)
    center = (mins + maxs) * 0.5
    normalized = vertices - center
    scale = target_size / max(float((maxs - mins).max()), 1e-8)
    return (normalized * scale).astype(np.float32)


def export_glb_with_trimesh(
    obj_path: Path | str,
    texture_path: Path | str,
    out_path: Path | str,
) -> Path:
    import trimesh

    obj = Path(obj_path).expanduser().resolve()
    texture = Path(texture_path).expanduser().resolve()
    out = Path(out_path).expanduser().resolve()

    if not obj.is_file():
        raise RuntimeError(f"OBJ file not found: {obj}")
    if not texture.is_file():
        raise RuntimeError(f"Texture file not found: {texture}")

    vertices, vertex_colors, uvs, faces, face_uvs = _load_obj(obj)
    colors = _texture_vertex_colors(vertices, uvs, faces, face_uvs, vertex_colors, texture)
    mesh = trimesh.Trimesh(
        vertices=_center_and_scale(vertices),
        faces=faces,
        process=False,
    )
    mesh.visual.vertex_colors = colors

    out.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(str(out), file_type="glb")
    return out
