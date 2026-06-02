import argparse
import io
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


@dataclass(frozen=True)
class Caption:
    start: float
    end: float
    text: str


CAPTIONS = (
    Caption(0.8, 14.15, "川剧变脸的传承面临一定的挑战，传统脸谱承载着人物性格、戏曲程式和地域文化记忆，但多数同类产品仍存在诸多不足。"),
    Caption(14.15, 16.9, "针对这些痛点，本项目实现了从“看热闹”到“真正参与”的转变。"),
    Caption(16.9, 18.65, "这是一款面向非遗数字化展示的 Web 互动体验应用。"),
    Caption(18.65, 21.1, "它融合川剧变脸、人脸追踪、手势识别、舞台特效与三维模型生成。"),
    Caption(21.1, 23.35, "让体验者亲自完成一场数字化变脸表演。"),
    Caption(24.2, 29.4, "首页介绍了针对不同设备条件的两种模式、注意事项、使用方法，便于快速上手。"),
    Caption(29.4, 34.6, "项目的第一大优势，是实时检测与川剧程式动作的结合。"),
    Caption(34.6, 41.7, "应用调用 MediaPipe Face Mesh 提取 468 个三维人脸关键点，同时通过 MediaPipe Hands 获取手部关键点信息。"),
    Caption(41.7, 52.4, "根据头部姿态、手部轨迹和面部区域关系，判断挥手、转头、遮脸、举手等动作，实现变脸、舞扇和吐火等交互触发。"),
    Caption(52.4, 59.0, "这种方式让传统表演动作真正进入实时交互流程。"),
    Caption(59.0, 62.3, "第二大优势，是三维贴合与个性化建模。"),
    Caption(62.3, 66.2, "项目引入 3DDFA-V3 模型，根据用户真实脸型生成专属三维人脸模型。"),
    Caption(66.2, 72.1, "再通过 UV 锚点展开与纹理映射，将川剧脸谱图案绑定到个人面部网格上。"),
    Caption(72.1, 75.2, "脸谱能够精准表现用户细微表情。"),
    Caption(75.2, 80.0, "从“千人一面”的滤镜效果，走向“千人千面”的个性化三维表达。"),
    Caption(80.0, 83.7, "第三大优势，是前端实时渲染与后端资产生成的完整闭环。"),
    Caption(83.7, 86.7, "用户可以进入脸谱陈列馆。"),
    Caption(86.7, 90.3, "360 度旋转查看生成的个人三维脸谱模型。"),
    Caption(90.3, 95.0, "以及对应角色故事、脸谱寓意和绘制过程。"),
    Caption(95.0, 99.3, "本项目低门槛、强互动、可留存，应用前景广阔。"),
    Caption(99.3, 102.4, "让非遗体验从一次观看，扩展为长期传播。"),
    Caption(102.4, 107.8, "团队计划在天府艺术公园·蜀园部署实体机设备，提供互动体验。"),
    Caption(107.8, 111.3, "结合 3D 打印技术，将重建的脸谱模型制作出实物。"),
    Caption(111.3, 115.6, "互动后立即打印的特性能够提升用户消费意愿，具备较大的市场潜力。"),
    Caption(115.6, 119.1, "AI-Opera 智能川剧变脸，让传统戏曲走近年轻人，让非遗活在当下，让文化留在未来。"),
)

BASE_WIDTH = 1280
BASE_HEIGHT = 720


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


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    buffer = ""
    for char in text:
        if char.isascii() and (char.isalnum() or char in " -_./"):
            buffer += char
            continue
        if buffer:
            tokens.append(buffer)
            buffer = ""
        tokens.append(char)
    if buffer:
        tokens.append(buffer)
    return tokens


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int, stroke_width: int) -> list[str]:
    probe = Image.new("RGB", (10, 10))
    draw = ImageDraw.Draw(probe)
    lines: list[str] = []
    current = ""

    for token in tokenize(text):
        candidate = current + token
        width = draw.textbbox((0, 0), candidate, font=font, stroke_width=stroke_width)[2]
        if current and width > max_width:
            lines.append(current.strip())
            current = token.lstrip()
        else:
            current = candidate

    if current.strip():
        lines.append(current.strip())
    return lines


def caption_at(timestamp: float) -> Caption | None:
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


def clean_caption_band(arr: np.ndarray, timestamp: float) -> np.ndarray:
    height, width = arr.shape[:2]
    scale_y = height / BASE_HEIGHT
    x0, x1 = 0, width
    y0 = int(round(548 * scale_y))
    y1 = min(height, int(round(715 * scale_y)))
    region = arr[y0:y1, x0:x1]
    red = region[:, :, 0].astype(np.int16)
    green = region[:, :, 1].astype(np.int16)
    blue = region[:, :, 2].astype(np.int16)
    max_channel = region.max(axis=2)
    min_channel = region.min(axis=2)

    bright_white = (max_channel > 126) & (min_channel > 78) & ((max_channel - min_channel) < 112)
    warm_glow = (red > 126) & (green > 78) & (blue < 138)
    red_emphasis = (red > 130) & (green < 104) & (blue < 104)
    mask = bright_white | warm_glow | red_emphasis

    y_indices = np.arange(y1 - y0)[:, None] + y0
    if timestamp >= 23.5:
        mask &= y_indices >= int(round(600 * scale_y))
    else:
        mask &= y_indices >= int(round(560 * scale_y))

    if not mask.any():
        return arr

    mask_img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    mask_img = mask_img.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(1.1))
    soft_mask = np.asarray(mask_img).astype(np.float32) / 255.0
    hard_mask = soft_mask > 0.06

    fill = row_interpolate_fill(region, hard_mask)
    alpha = soft_mask[:, :, None]
    region[:] = (region.astype(np.float32) * (1.0 - alpha) + fill.astype(np.float32) * alpha).clip(0, 255)
    return arr


def make_overlay(caption: Caption, width: int, height: int, font: ImageFont.FreeTypeFont) -> tuple[np.ndarray, np.ndarray]:
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    scale_x = width / BASE_WIDTH
    scale_y = height / BASE_HEIGHT
    stroke_width = max(2, int(round(2 * scale_y)))
    lines = wrap_text(
        caption.text,
        font,
        max_width=int(round(1100 * scale_x)),
        stroke_width=stroke_width,
    )
    line_gap = max(5, int(round(5 * scale_y)))

    metrics = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font, stroke_width=stroke_width)
        metrics.append((line, bbox[2] - bbox[0], bbox[3] - bbox[1]))

    total_height = sum(item[2] for item in metrics) + line_gap * max(0, len(metrics) - 1)
    y = height - int(round(31 * scale_y)) - total_height

    for line, line_width, line_height in metrics:
        x = (width - line_width) / 2
        draw.text(
            (x, y),
            line,
            font=font,
            fill=(255, 255, 255, 255),
            stroke_width=stroke_width,
            stroke_fill=(0, 0, 0, 210),
        )
        y += line_height + line_gap

    rgba = np.asarray(overlay).astype(np.float32)
    rgb = rgba[:, :, :3]
    alpha = rgba[:, :, 3:4] / 255.0
    return rgb, alpha


def apply_overlay(arr: np.ndarray, overlay: tuple[np.ndarray, np.ndarray]) -> np.ndarray:
    rgb, alpha = overlay
    return (arr.astype(np.float32) * (1.0 - alpha) + rgb * alpha).clip(0, 255).astype(np.uint8)


def read_png_frame(stream) -> bytes | None:
    signature = stream.read(8)
    if not signature:
        return None
    if signature != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Unexpected PNG stream signature")

    chunks = [signature]
    while True:
        header = stream.read(8)
        if len(header) != 8:
            raise RuntimeError("Incomplete PNG chunk header")
        length = int.from_bytes(header[:4], "big")
        chunk_type = header[4:8]
        data_and_crc = stream.read(length + 4)
        if len(data_and_crc) != length + 4:
            raise RuntimeError("Incomplete PNG chunk data")
        chunks.append(header)
        chunks.append(data_and_crc)
        if chunk_type == b"IEND":
            return b"".join(chunks)


def run(
    input_path: Path,
    output_path: Path,
    ffmpeg: Path,
    width: int,
    height: int,
    fps: float,
    bitrate: str,
    timescale: int,
    level: str,
    preset: str,
    duration: float | None,
    scale: str | None,
) -> None:
    font = load_font(max(28, int(round(28 * height / BASE_HEIGHT))))
    overlays = {
        caption: make_overlay(caption, width, height, font)
        for caption in CAPTIONS
    }

    decoder_cmd = [
            str(ffmpeg),
            "-v",
            "error",
            "-i",
            str(input_path),
    ]
    if duration is not None:
        decoder_cmd.extend(["-t", f"{duration:g}"])
    if scale:
        decoder_cmd.extend(["-vf", f"scale={scale}"])
    decoder_cmd.extend(
        [
            "-an",
            "-c:v",
            "png",
            "-pix_fmt",
            "rgb24",
            "-f",
            "image2pipe",
            "-",
        ]
    )
    decoder = subprocess.Popen(
        decoder_cmd,
        stdout=subprocess.PIPE,
    )
    encoder = subprocess.Popen(
        [
            str(ffmpeg),
            "-v",
            "error",
            "-y",
            "-f",
            "image2pipe",
            "-framerate",
            f"{fps:g}",
            "-c:v",
            "png",
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            preset,
            "-pix_fmt",
            "yuv420p",
            "-profile:v",
            "high",
            "-level:v",
            level,
            "-r",
            f"{fps:g}",
            "-b:v",
            bitrate,
            "-video_track_timescale",
            str(timescale),
            "-movflags",
            "+faststart",
            str(output_path),
        ],
        stdin=subprocess.PIPE,
    )

    if decoder.stdout is None or encoder.stdin is None:
        raise RuntimeError("Unable to open ffmpeg pipes")

    frame_index = 0
    try:
        while True:
            raw = read_png_frame(decoder.stdout)
            if not raw:
                break

            timestamp = frame_index / fps
            caption = caption_at(timestamp)
            image = Image.open(io.BytesIO(raw)).convert("RGB")
            arr = np.asarray(image).copy()

            if caption:
                arr = clean_caption_band(arr, timestamp)
                arr = apply_overlay(arr, overlays[caption])

            output_frame = Image.fromarray(arr)
            buffer = io.BytesIO()
            output_frame.save(buffer, format="PNG", compress_level=1)
            encoder.stdin.write(buffer.getvalue())
            frame_index += 1
            if frame_index % 300 == 0:
                print(f"processed_frames={frame_index}", flush=True)
    finally:
        decoder.stdout.close()
        encoder.stdin.close()

    decoder_code = decoder.wait()
    encoder_code = encoder.wait()
    if decoder_code != 0:
        raise RuntimeError(f"ffmpeg decoder failed with exit code {decoder_code}")
    if encoder_code != 0:
        raise RuntimeError(f"ffmpeg encoder failed with exit code {encoder_code}")

    print(f"processed_frames={frame_index}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--ffmpeg", required=True)
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--bitrate", default="1318k")
    parser.add_argument("--timescale", type=int, default=15360)
    parser.add_argument("--level", default="3.1")
    parser.add_argument("--preset", default="medium")
    parser.add_argument("--duration", type=float, default=None)
    parser.add_argument("--scale", default=None)
    args = parser.parse_args()

    run(
        Path(args.input),
        Path(args.output),
        Path(args.ffmpeg),
        args.width,
        args.height,
        args.fps,
        args.bitrate,
        args.timescale,
        args.level,
        args.preset,
        args.duration,
        args.scale,
    )


if __name__ == "__main__":
    main()
