from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path


def run(command: list[str], *, dry_run: bool = False) -> None:
    print(" ".join(command))
    if not dry_run:
        subprocess.run(command, check=True)


def write_manifest(
    out_dir: Path,
    scene_id: str,
    title: str,
    scene_type: str,
    canto_title: str | None,
    canto_audio_url: str | None,
    source_video_url: str | None,
) -> None:
    manifest = {
        "sceneId": scene_id,
        "sceneType": scene_type,
        "title": title,
        "status": "autodl-prepared",
        "claimLevel": "Prepared for CUDA 3D Gaussian Splatting training; not yet imported into web viewer.",
        "viewer": {
            "type": "threejs-3dgs-classic-scene" if scene_type == "classic-scene-3dgs" else "threejs-free-explore",
            "entryUrl": (
                f"/classic_scene_3dgs.html?scene={scene_id}"
                if scene_type == "classic-scene-3dgs"
                else f"/digital_exhibition_viewer.html?scene={scene_id}"
            ),
            "navigation": ["orbit", "walk", "audio timeline", "camera trajectory"]
            if scene_type == "classic-scene-3dgs"
            else ["orbit", "walk", "zoom", "pan"],
        },
        "assets": {
            "splat": None,
            "pointCloud": "point_cloud.ply",
            "previewImage": "preview.jpg",
            "sourceVideo": source_video_url,
        },
        "canto": {
            "title": canto_title or "经典唱段待导入",
            "audioUrl": canto_audio_url,
            "lyricsUrl": None,
            "startTime": 0,
            "durationSeconds": None,
        },
        "autodl": {
            "imagesDir": "images",
            "colmapDir": "colmap",
            "outputDir": "output",
        },
    }
    (out_dir / "scene_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare AI-Opera scene frames and command hints for AutoDL 3DGS training.")
    parser.add_argument("--input", required=True, type=Path, help="Input video file or image directory.")
    parser.add_argument("--scene-id", required=True, help="Scene id, e.g. sichuan-opera-stage-001.")
    parser.add_argument("--title", default="AI-Opera 3DGS Scene", help="Human-readable scene title.")
    parser.add_argument("--scene-type", default="classic-scene-3dgs", choices=["classic-scene-3dgs", "museum-gallery"])
    parser.add_argument("--canto-title", default=None, help="Classic singing segment title.")
    parser.add_argument("--canto-audio-url", default=None, help="Audio URL copied into scene_manifest.json.")
    parser.add_argument("--source-video-url", default=None, help="Original scene video URL or relative path.")
    parser.add_argument("--out", required=True, type=Path, help="Output scene work directory.")
    parser.add_argument("--fps", type=float, default=3.0, help="Frame extraction FPS when input is a video.")
    parser.add_argument("--dry-run", action="store_true", help="Print commands without running ffmpeg.")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    images_dir = args.out / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    if args.input.is_dir():
        for path in sorted(args.input.iterdir()):
            if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                target = images_dir / f"{len(list(images_dir.iterdir())):06d}{path.suffix.lower()}"
                if not args.dry_run:
                    shutil.copyfile(path, target)
                print(f"copy {path} -> {target}")
    else:
        run([
            "ffmpeg",
            "-y",
            "-i",
            str(args.input),
            "-vf",
            f"fps={args.fps},scale='min(1600,iw)':-2",
            str(images_dir / "%06d.jpg"),
        ], dry_run=args.dry_run)

    write_manifest(
        args.out,
        args.scene_id,
        args.title,
        args.scene_type,
        args.canto_title,
        args.canto_audio_url,
        args.source_video_url,
    )

    commands = [
        "# COLMAP / GraphDeco command hints",
        f"colmap automatic_reconstructor --workspace_path {args.out / 'colmap'} --image_path {images_dir}",
        f"python convert.py -s {args.out}",
        f"python train.py -s {args.out} --model_path {args.out / 'output'}",
        f"python render.py -m {args.out / 'output'}",
    ]
    (args.out / "COMMANDS.md").write_text("\n".join(commands) + "\n", encoding="utf-8", newline="\n")
    print(f"\nPrepared scene directory: {args.out}")
    print("Next: install COLMAP + GraphDeco 3DGS on AutoDL CUDA, then run COMMANDS.md.")


if __name__ == "__main__":
    main()
