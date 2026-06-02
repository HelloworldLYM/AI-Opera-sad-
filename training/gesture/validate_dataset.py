from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


LABELS = [
    "vertical_swipe",
    "cover_face",
    "head_shake",
    "head_nod",
    "raise_hand",
    "idle",
]
HAND_REQUIRED_LABELS = {"vertical_swipe", "cover_face", "raise_hand"}


def _frames(sample: dict[str, Any]) -> list[dict[str, Any]]:
    frames = sample.get("frames") or []
    return frames if isinstance(frames, list) else []


def _has_face_signal(frame: dict[str, Any]) -> bool:
    anchors = frame.get("faceAnchors")
    return bool(frame.get("faceBox")) or (isinstance(anchors, list) and len(anchors) > 0)


def _has_hand_signal(frame: dict[str, Any]) -> bool:
    selected = frame.get("selectedHand")
    if isinstance(selected, list) and len(selected) > 0:
        return True
    hands = frame.get("hands")
    return isinstance(hands, list) and any(isinstance(hand, list) and len(hand) > 0 for hand in hands)


def _round(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


def validate_dataset(data: dict[str, Any], target_per_label: int = 30, min_frames: int = 8) -> dict[str, Any]:
    samples = data.get("samples") or []
    if not isinstance(samples, list):
        samples = []

    by_label = {label: 0 for label in LABELS}
    per_label: dict[str, dict[str, Any]] = {
        label: {
            "count": 0,
            "avgFrames": 0,
            "minFrames": 0,
            "maxFrames": 0,
            "handCoverage": 0,
            "faceCoverage": 0,
            "ready": False,
        }
        for label in LABELS
    }
    frame_counts: list[int] = []
    too_short_samples: list[dict[str, Any]] = []
    quality_failed_samples: list[dict[str, Any]] = []
    unknown_labels: dict[str, int] = {}

    for sample in samples:
        if not isinstance(sample, dict):
            continue
        label = str(sample.get("label") or "unknown")
        frames = _frames(sample)
        frame_count = int(sample.get("frameCount") or len(frames))
        hand_frames = sum(1 for frame in frames if isinstance(frame, dict) and _has_hand_signal(frame))
        face_frames = sum(1 for frame in frames if isinstance(frame, dict) and _has_face_signal(frame))

        if label not in per_label:
            unknown_labels[label] = unknown_labels.get(label, 0) + 1
            per_label[label] = {
                "count": 0,
                "avgFrames": 0,
                "minFrames": 0,
                "maxFrames": 0,
                "handCoverage": 0,
                "faceCoverage": 0,
                "ready": False,
            }
        by_label[label] = by_label.get(label, 0) + 1
        row = per_label[label]
        row["count"] += 1
        row["avgFrames"] += frame_count
        row["minFrames"] = min(row["minFrames"], frame_count) if row["minFrames"] else frame_count
        row["maxFrames"] = max(row["maxFrames"], frame_count)
        row["handCoverage"] += hand_frames / frame_count if frame_count else 0
        row["faceCoverage"] += face_frames / frame_count if frame_count else 0
        frame_counts.append(frame_count)
        if frame_count < min_frames:
            too_short_samples.append({
                "id": sample.get("id") or "",
                "label": label,
                "frameCount": frame_count,
            })
        quality = sample.get("quality") or {}
        if isinstance(quality, dict) and quality.get("passed") is False:
            quality_failed_samples.append({
                "id": sample.get("id") or "",
                "label": label,
                "score": quality.get("score"),
                "warnings": quality.get("warnings") or [],
            })

    for label, row in per_label.items():
        count = row["count"]
        if not count:
            continue
        row["avgFrames"] = _round(row["avgFrames"] / count, 2)
        row["handCoverage"] = _round(row["handCoverage"] / count, 4)
        row["faceCoverage"] = _round(row["faceCoverage"] / count, 4)
        row["ready"] = count >= target_per_label and row["avgFrames"] >= min_frames

    missing_labels = [label for label in LABELS if by_label.get(label, 0) == 0]
    labels_below_target = [
        {
            "label": label,
            "count": by_label.get(label, 0),
            "missing": max(target_per_label - by_label.get(label, 0), 0),
        }
        for label in LABELS
        if 0 < by_label.get(label, 0) < target_per_label
    ]
    ready_labels = [label for label in LABELS if per_label[label]["ready"]]

    warnings: list[str] = []
    if missing_labels:
        warnings.append(f"缺少类别: {', '.join(missing_labels)}")
    if labels_below_target:
        warnings.append("样本不足: " + ", ".join(f"{item['label']} 还差 {item['missing']} 段" for item in labels_below_target))
    if too_short_samples:
        warnings.append(f"{len(too_short_samples)} 段样本短于 {min_frames} 帧")
    if quality_failed_samples:
        warnings.append(f"{len(quality_failed_samples)} 段样本未通过采集页面软质检")
    for label in LABELS:
        row = per_label[label]
        if row["count"] and row["faceCoverage"] < 0.75:
            warnings.append(f"{label} 的人脸关键点覆盖偏低: {row['faceCoverage']}")
        if label in HAND_REQUIRED_LABELS and row["count"] and row["handCoverage"] < 0.45:
            warnings.append(f"{label} 的手部关键点覆盖偏低: {row['handCoverage']}")

    total_frames = sum(frame_counts)
    return {
        "version": 1,
        "targetPerLabel": target_per_label,
        "minValidFrames": min_frames,
        "totalSamples": len(samples),
        "validSamples": len(samples) - len(too_short_samples),
        "readyForTraining": len(ready_labels) == len(LABELS) and not too_short_samples,
        "readyLabels": ready_labels,
        "missingLabels": missing_labels,
        "labelsBelowTarget": labels_below_target,
        "unknownLabels": unknown_labels,
        "tooShortSamples": too_short_samples[:50],
        "qualityFailedSamples": quality_failed_samples[:50],
        "byLabel": by_label,
        "perLabel": per_label,
        "frameStats": {
            "min": min(frame_counts) if frame_counts else 0,
            "max": max(frame_counts) if frame_counts else 0,
            "avg": _round(total_frames / len(frame_counts), 2) if frame_counts else 0,
        },
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate AI-Opera browser gesture dataset before training.")
    parser.add_argument("--data", required=True, type=Path, help="Browser-exported gesture dataset JSON.")
    parser.add_argument("--out", type=Path, help="Optional path to save the validation report JSON.")
    parser.add_argument("--target-per-label", default=30, type=int)
    parser.add_argument("--min-frames", default=8, type=int)
    args = parser.parse_args()

    data = json.loads(args.data.read_text(encoding="utf-8"))
    report = validate_dataset(data, target_per_label=args.target_per_label, min_frames=args.min_frames)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
