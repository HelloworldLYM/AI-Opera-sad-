import argparse
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def process_frame(
    src: Path,
    dst: Path,
    index: int,
    fps: float,
    start: float,
    end: float,
    title_plate: Image.Image,
    pain_plate: Image.Image,
) -> bool:
    timestamp = (index - 1) / fps
    if timestamp < start or timestamp > end:
        shutil.copy2(src, dst)
        return False

    image = Image.open(src).convert("RGB")
    arr = np.asarray(image).copy()

    x0, y0, x1, y1 = 148, 572, 1132, 720
    width = x1 - x0
    height = y1 - y0

    plate = title_plate if timestamp < 6.2 else pain_plate
    fill = plate.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(radius=0.4))
    fill_arr = np.asarray(fill).astype(np.float32)

    region = arr[y0:y1, x0:x1].astype(np.float32)
    max_channel = region.max(axis=2)
    min_channel = region.min(axis=2)

    # The black caption plate is nearly neutral and very dark. Keeping the mask
    # local prevents other dark stage elements from being touched.
    dark_plate = (max_channel < 46) & ((max_channel - min_channel) < 18)
    alpha = Image.fromarray((dark_plate.astype(np.uint8) * 255), mode="L").filter(
        ImageFilter.GaussianBlur(radius=1.2)
    )
    alpha_arr = np.asarray(alpha).astype(np.float32) / 255.0
    alpha_arr = alpha_arr[:, :, None]

    replaced = (region * (1.0 - alpha_arr) + fill_arr * alpha_arr).clip(0, 255).astype(np.uint8)
    arr[y0:y1, x0:x1] = replaced

    Image.fromarray(arr).save(dst)
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--start", type=float, default=3.55)
    parser.add_argument("--end", type=float, default=14.25)
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    frames = sorted(p for p in input_dir.iterdir() if p.suffix.lower() == ".png")
    changed = 0
    if not frames:
        print("processed=0 copied=0 total=0")
        return

    title_plate = Image.open(frames[0]).convert("RGB")
    pain_plate = Image.open(frames[-1]).convert("RGB")

    for index, src in enumerate(frames, start=1):
        dst = output_dir / src.name
        if process_frame(src, dst, index, args.fps, args.start, args.end, title_plate, pain_plate):
            changed += 1

    print(f"processed={changed} copied={len(frames) - changed} total={len(frames)}")


if __name__ == "__main__":
    main()
