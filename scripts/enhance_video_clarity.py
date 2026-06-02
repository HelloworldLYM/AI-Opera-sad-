import argparse
import io
import subprocess
from pathlib import Path

from PIL import Image, ImageFilter


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


def run(input_path: Path, output_path: Path, ffmpeg: Path, fps: float, bitrate: str) -> None:
    decoder = subprocess.Popen(
        [
            str(ffmpeg),
            "-v",
            "error",
            "-i",
            str(input_path),
            "-an",
            "-c:v",
            "png",
            "-pix_fmt",
            "rgb24",
            "-f",
            "image2pipe",
            "-",
        ],
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
            "slow",
            "-pix_fmt",
            "yuv420p",
            "-profile:v",
            "high",
            "-level:v",
            "3.1",
            "-r",
            f"{fps:g}",
            "-b:v",
            bitrate,
            "-maxrate",
            bitrate,
            "-bufsize",
            "26000k",
            "-video_track_timescale",
            "15360",
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
            if raw is None:
                break

            image = Image.open(io.BytesIO(raw)).convert("RGB")
            # Gentle sharpening: enough to tighten UI text and subtitles without
            # creating obvious halos on the already-compressed source.
            image = image.filter(ImageFilter.UnsharpMask(radius=1.0, percent=70, threshold=4))

            buffer = io.BytesIO()
            image.save(buffer, format="PNG", compress_level=1)
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
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--bitrate", default="13000k")
    args = parser.parse_args()

    run(Path(args.input), Path(args.output), Path(args.ffmpeg), args.fps, args.bitrate)


if __name__ == "__main__":
    main()
