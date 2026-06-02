from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset


FEATURE_DIM = 86


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number != number:
        return fallback
    return number


def _flatten_point(point: Any) -> list[float]:
    if not isinstance(point, list):
        return [0.0, 0.0, 0.0]
    return [_safe_float(point[0] if len(point) > 0 else 0), _safe_float(point[1] if len(point) > 1 else 0), _safe_float(point[2] if len(point) > 2 else 0)]


def frame_to_features(frame: dict[str, Any]) -> list[float]:
    features: list[float] = []
    face_box = frame.get("faceBox") or {}
    features.extend([
        _safe_float(face_box.get("cx")),
        _safe_float(face_box.get("cy")),
        _safe_float(face_box.get("width")),
        _safe_float(face_box.get("height")),
        _safe_float(frame.get("yaw")),
        _safe_float(frame.get("pitch")),
    ])

    for point in (frame.get("faceAnchors") or [])[:10]:
        features.extend(_flatten_point(point))
    while len(features) < 36:
        features.append(0.0)

    selected_hand = frame.get("selectedHand") or []
    wrist = _flatten_point(selected_hand[0] if len(selected_hand) > 0 else None)
    for point in selected_hand[:16]:
        p = _flatten_point(point)
        features.extend([p[0] - wrist[0], p[1] - wrist[1], p[2] - wrist[2]])
    while len(features) < FEATURE_DIM - 2:
        features.append(0.0)

    detector = frame.get("detector") or {}
    features.extend([
        1.0 if detector.get("triggered") else 0.0,
        _safe_float(detector.get("direction")),
    ])
    return features[:FEATURE_DIM]


class GestureDataset(Dataset):
    def __init__(self, samples: list[dict[str, Any]], label_to_index: dict[str, int], seq_len: int = 48):
        self.samples = samples
        self.label_to_index = label_to_index
        self.seq_len = seq_len

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        sample = self.samples[index]
        frames = sample.get("frames") or []
        features = [frame_to_features(frame) for frame in frames]
        if not features:
            features = [[0.0] * FEATURE_DIM]

        if len(features) >= self.seq_len:
            start = max(0, (len(features) - self.seq_len) // 2)
            features = features[start : start + self.seq_len]
        else:
            features.extend([[0.0] * FEATURE_DIM for _ in range(self.seq_len - len(features))])

        x = torch.tensor(features, dtype=torch.float32).transpose(0, 1)
        y = torch.tensor(self.label_to_index[str(sample["label"])], dtype=torch.long)
        return x, y


class TinyTCN(nn.Module):
    def __init__(self, input_dim: int, num_classes: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(input_dim, 96, kernel_size=5, padding=2),
            nn.BatchNorm1d(96),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Conv1d(96, 128, kernel_size=5, padding=4, dilation=2),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Conv1d(128, 128, kernel_size=3, padding=4, dilation=4),
            nn.BatchNorm1d(128),
            nn.ReLU(),
        )
        self.head = nn.Linear(128, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        hidden = self.net(x)
        pooled = hidden.mean(dim=-1)
        return self.head(pooled)


def load_samples(path: Path, keep_failed_quality: bool = False) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    samples = data.get("samples", [])
    valid: list[dict[str, Any]] = []
    for sample in samples:
        if not sample.get("label") or len(sample.get("frames") or []) < 8:
            continue
        quality = sample.get("quality")
        if isinstance(quality, dict) and quality.get("passed") is False and not keep_failed_quality:
            continue
        valid.append(sample)
    return valid


def split_samples(samples: list[dict[str, Any]], val_ratio: float = 0.2) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for sample in samples:
        grouped.setdefault(str(sample["label"]), []).append(sample)

    train: list[dict[str, Any]] = []
    val: list[dict[str, Any]] = []
    for items in grouped.values():
        random.shuffle(items)
        cut = max(1, int(len(items) * val_ratio)) if len(items) > 1 else 0
        val.extend(items[:cut])
        train.extend(items[cut:])
    return train or samples, val or samples[: max(1, len(samples) // 5)]


def run_epoch(model: nn.Module, loader: DataLoader, optimizer: torch.optim.Optimizer | None, device: torch.device) -> tuple[float, float]:
    is_train = optimizer is not None
    model.train(is_train)
    total_loss = 0.0
    total_correct = 0
    total = 0
    for x, y in loader:
        x = x.to(device)
        y = y.to(device)
        with torch.set_grad_enabled(is_train):
            logits = model(x)
            loss = F.cross_entropy(logits, y)
            if optimizer:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
        total_loss += float(loss.item()) * y.numel()
        total_correct += int((logits.argmax(dim=1) == y).sum().item())
        total += y.numel()
    return total_loss / max(total, 1), total_correct / max(total, 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--epochs", default=40, type=int)
    parser.add_argument("--batch-size", default=32, type=int)
    parser.add_argument("--seq-len", default=48, type=int)
    parser.add_argument("--lr", default=1e-3, type=float)
    parser.add_argument("--keep-failed-quality", action="store_true", help="Keep samples that failed browser-side soft quality checks.")
    args = parser.parse_args()

    random.seed(42)
    torch.manual_seed(42)
    samples = load_samples(args.data, keep_failed_quality=args.keep_failed_quality)
    if len(samples) < 10:
        raise SystemExit("Need at least 10 valid samples. Collect more browser gesture data first.")

    labels = sorted({str(sample["label"]) for sample in samples})
    label_to_index = {label: index for index, label in enumerate(labels)}
    train_samples, val_samples = split_samples(samples)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    train_loader = DataLoader(GestureDataset(train_samples, label_to_index, args.seq_len), batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(GestureDataset(val_samples, label_to_index, args.seq_len), batch_size=args.batch_size)
    model = TinyTCN(FEATURE_DIM, len(labels)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)

    best_acc = -1.0
    metrics = []
    args.out.mkdir(parents=True, exist_ok=True)
    for epoch in range(1, args.epochs + 1):
        train_loss, train_acc = run_epoch(model, train_loader, optimizer, device)
        val_loss, val_acc = run_epoch(model, val_loader, None, device)
        row = {
            "epoch": epoch,
            "trainLoss": round(train_loss, 5),
            "trainAcc": round(train_acc, 4),
            "valLoss": round(val_loss, 5),
            "valAcc": round(val_acc, 4),
        }
        metrics.append(row)
        print(row)
        if val_acc > best_acc:
            best_acc = val_acc
            torch.save({"model": model.state_dict(), "labels": labels, "featureDim": FEATURE_DIM, "seqLen": args.seq_len}, args.out / "gesture_tcn.pt")

    (args.out / "label_map.json").write_text(json.dumps(label_to_index, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.out / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
