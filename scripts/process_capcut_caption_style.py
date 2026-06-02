import argparse
import shutil
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


@dataclass(frozen=True)
class Caption:
    start: float
    end: float
    lines: tuple[str, ...]


CAPTIONS = (
    Caption(
        0.8,
        14.15,
        (
            "川剧变脸的传承面临一定的挑战，",
            "传统脸谱承载着人物性格、戏曲程式和地域文化记忆，",
            "但多数同类产品仍存在诸多不足。",
        ),
    ),
    Caption(
        14.15,
        16.9,
        (
            "针对这些痛点，本项目实现了从“看热闹”",
            "到“真正参与”的转变。",
        ),
    ),
    Caption(
        16.9,
        18.65,
        ("这是一款面向非遗数字化展示的 Web 互动体验应用。",),
    ),
    Caption(
        18.65,
        21.1,
        (
            "它融合川剧变脸、人脸追踪、手势识别、舞台特效",
            "与三维模型生成，",
        ),
    ),
    Caption(
        21.1,
        23.15,
        ("让体验者亲自完成一场数字化变脸表演。",),
    ),
)


def load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = (
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def active_caption(timestamp: float) -> Caption | None:
    for caption in CAPTIONS:
        if caption.start <= timestamp < caption.end:
            return caption
    return None


def row_interpolate_fill(region: np.ndarray, mask: np.ndarray) -> np.ndarray:
    filled = region.copy()
    height, width = mask.shape
    xs = np.arange(width)

    for y in range(height):
        row_mask = mask[y]
        if not row_mask.any():
            continue

        known = ~row_mask
        if known.sum() < 2:
            continue

        known_x = xs[known]
        for channel in range(3):
            values = filled[y, known, channel]
            filled[y, row_mask, channel] = np.interp(xs[row_mask], known_x, values)

    return filled


def clean_old_caption(image: Image.Image, timestamp: float) -> Image.Image:
    if timestamp >= 23.15:
        return image

    arr = np.asarray(image.convert("RGB")).copy()
    x0, y0, x1, y1 = 44, 548, 1236, 710
    region = arr[y0:y1, x0:x1]
    red = region[:, :, 0].astype(np.int16)
    green = region[:, :, 1].astype(np.int16)
    blue = region[:, :, 2].astype(np.int16)
    max_channel = region.max(axis=2)
    min_channel = region.min(axis=2)

    bright_white = (max_channel > 128) & (min_channel > 86) & ((max_channel - min_channel) < 96)
    warm_glow = (red > 132) & (green > 92) & (blue < 120)
    red_emphasis = (red > 120) & (green < 88) & (blue < 88)
    mask = bright_white | warm_glow | red_emphasis

    # Keep the mask in the subtitle band so slide titles and UI text are left alone.
    y_indices = np.arange(y1 - y0)[:, None] + y0
    if timestamp < 14.25:
        mask &= (y_indices >= 568) & (y_indices <= 706)
    else:
        mask &= (y_indices >= 610) & (y_indices <= 706)

    if not mask.any():
        return image

    mask_img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    mask_img = mask_img.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(1.3))
    soft_mask = np.asarray(mask_img).astype(np.float32) / 255.0
    hard_mask = soft_mask > 0.08

    fill = row_interpolate_fill(region, hard_mask)
    alpha = soft_mask[:, :, None]
    blended = (region.astype(np.float32) * (1.0 - alpha) + fill.astype(np.float32) * alpha).clip(0, 255)
    arr[y0:y1, x0:x1] = blended.astype(np.uint8)
    return Image.fromarray(arr)


def draw_plain_caption(image: Image.Image, caption: Caption) -> Image.Image:
    draw = ImageDraw.Draw(image)
    font_size = 37 if len(caption.lines) >= 3 else 40
    font = load_font(font_size)
    line_gap = 8
    stroke_width = 3

    line_heights = []
    line_widths = []
    for line in caption.lines:
        bbox = draw.textbbox((0, 0), line, font=font, stroke_width=stroke_width)
        line_widths.append(bbox[2] - bbox[0])
        line_heights.append(bbox[3] - bbox[1])

    total_height = sum(line_heights) + line_gap * (len(caption.lines) - 1)
    y = 690 - total_height

    for line, width, height in zip(caption.lines, line_widths, line_heights):
        x = (image.width - width) / 2
        draw.text(
            (x, y),
            line,
            font=font,
            fill=(255, 255, 255),
            stroke_width=stroke_width,
            stroke_fill=(0, 0, 0),
        )
        y += height + line_gap

    return image


def process_frame(src: Path, dst: Path, index: int, fps: float) -> bool:
    timestamp = (index - 1) / fps
    caption = active_caption(timestamp)
    should_clean = timestamp < 23.15

    if not caption and not should_clean:
        shutil.copy2(src, dst)
        return False

    image = Image.open(src).convert("RGB")
    image = clean_old_caption(image, timestamp)
    if caption:
        image = draw_plain_caption(image, caption)
    image.save(dst)
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--fps", type=float, default=30.0)
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    frames = sorted(p for p in input_dir.iterdir() if p.suffix.lower() == ".png")
    changed = 0
    for index, src in enumerate(frames, start=1):
        dst = output_dir / src.name
        if process_frame(src, dst, index, args.fps):
            changed += 1

    print(f"processed={changed} copied={len(frames) - changed} total={len(frames)}")


if __name__ == "__main__":
    main()
