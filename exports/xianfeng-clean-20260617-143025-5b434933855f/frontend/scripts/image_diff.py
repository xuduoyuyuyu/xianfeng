#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two images and report pixel difference.")
    parser.add_argument("actual", type=Path, help="Actual rendered image path")
    parser.add_argument("expected", type=Path, help="Expected/reference image path")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("diff.png"),
        help="Output heatmap diff image path (default: diff.png)",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=16,
        help="Per-channel threshold for counting a pixel as different (0-255, default: 16)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON output",
    )
    parser.add_argument(
        "--no-diff-image",
        action="store_true",
        help="Skip writing diff image file",
    )
    args = parser.parse_args()

    actual = Image.open(args.actual).convert("RGBA")
    expected = Image.open(args.expected).convert("RGBA")
    if actual.size != expected.size:
        raise SystemExit(f"size mismatch: actual={actual.size}, expected={expected.size}")

    diff = ImageChops.difference(actual, expected)
    if not args.no_diff_image:
        diff.save(args.out)

    w, h = diff.size
    raw = diff.convert("RGBA").tobytes()
    threshold = max(0, min(255, args.threshold))

    changed = 0
    channel_sum = 0
    for i in range(0, len(raw), 4):
        r = raw[i]
        g = raw[i + 1]
        b = raw[i + 2]
        a = raw[i + 3]
        channel_sum += r + g + b + a
        if r > threshold or g > threshold or b > threshold or a > threshold:
            changed += 1

    total = w * h
    changed_pct = (changed / total) * 100 if total else 0
    mean_abs_channel_diff = channel_sum / (total * 4) if total else 0

    result = {
        "actual": str(args.actual),
        "expected": str(args.expected),
        "size": {"width": w, "height": h},
        "threshold": threshold,
        "changed_pixels": changed,
        "changed_percent": round(changed_pct, 6),
        "mean_abs_channel_diff": round(mean_abs_channel_diff, 6),
        "diff_image": None if args.no_diff_image else str(args.out),
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(f"actual={result['actual']}")
        print(f"expected={result['expected']}")
        print(f"size={w}x{h}")
        print(f"threshold={threshold}")
        print(f"changed_pixels={changed}")
        print(f"changed_percent={changed_pct:.4f}")
        print(f"mean_abs_channel_diff={mean_abs_channel_diff:.4f}")
        print(f"diff_image={result['diff_image']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
