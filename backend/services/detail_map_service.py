from __future__ import annotations

from pathlib import Path


def generate_detail_normal_map(
    texture_path: Path | str,
    out_path: Path | str,
    *,
    max_size: int = 1024,
    strength: float = 3.2,
) -> Path | None:
    """Create a lightweight tangent-space normal map from the baked facepaint texture."""

    try:
        from PIL import Image, ImageFilter
    except ModuleNotFoundError:
        return None

    source = Path(texture_path).expanduser().resolve()
    target = Path(out_path).expanduser().resolve()
    if not source.is_file():
        return None

    try:
        with Image.open(source) as image:
            rgba = image.convert("RGBA")
            if max(rgba.size) > max_size:
                resampling = getattr(Image, "Resampling", Image)
                rgba.thumbnail((max_size, max_size), getattr(resampling, "LANCZOS", 1))

            height_map = rgba.convert("L").filter(ImageFilter.GaussianBlur(radius=0.65))
            width, height = height_map.size
            source_pixels = height_map.load()
            alpha_pixels = rgba.getchannel("A").load()
            normal = Image.new("RGBA", (width, height))
            normal_pixels = normal.load()

            for y in range(height):
                y0 = max(y - 1, 0)
                y1 = min(y + 1, height - 1)
                for x in range(width):
                    x0 = max(x - 1, 0)
                    x1 = min(x + 1, width - 1)
                    dx = ((source_pixels[x1, y] - source_pixels[x0, y]) / 255.0) * strength
                    dy = ((source_pixels[x, y1] - source_pixels[x, y0]) / 255.0) * strength
                    nx = -dx
                    ny = -dy
                    nz = 1.0
                    length = max((nx * nx + ny * ny + nz * nz) ** 0.5, 1e-6)
                    normal_pixels[x, y] = (
                        int((nx / length * 0.5 + 0.5) * 255),
                        int((ny / length * 0.5 + 0.5) * 255),
                        int((nz / length * 0.5 + 0.5) * 255),
                        alpha_pixels[x, y],
                    )

            target.parent.mkdir(parents=True, exist_ok=True)
            normal.save(target, format="PNG")
    except Exception:
        return None

    return target
