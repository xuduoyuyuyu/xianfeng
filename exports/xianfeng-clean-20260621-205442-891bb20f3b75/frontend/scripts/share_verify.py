#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import hashlib
from pathlib import Path
from PIL import Image


def resolve_existing_path(path_str: str) -> Path:
    p = Path(path_str)
    if p.exists():
        return p
    alt = Path("frontend") / path_str.lstrip("./")
    if alt.exists():
        return alt
    return p


def sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify share image diff against thresholds.")
    parser.add_argument(
        "--actual",
        default="./tmp/share-current.png",
        help="Actual image path (default: ./tmp/share-current.png)",
    )
    parser.add_argument(
        "--expected",
        default="./public/assets/share-topic-reference.png",
        help="Expected reference image path",
    )
    parser.add_argument(
        "--max-changed-percent",
        type=float,
        default=3.0,
        help="Max allowed changed percent threshold (default: 3.0)",
    )
    parser.add_argument(
        "--max-mean-abs-channel-diff",
        type=float,
        default=8.0,
        help="Max allowed mean abs channel diff (default: 8.0)",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=16,
        help="Per-channel threshold passed to image_diff.py",
    )
    parser.add_argument(
        "--out",
        default="./tmp/share-diff.png",
        help="Diff image output path (default: ./tmp/share-diff.png)",
    )
    parser.add_argument(
        "--print-json",
        action="store_true",
        help="Also print final verification result as JSON",
    )
    args = parser.parse_args()

    actual = resolve_existing_path(args.actual)
    expected = resolve_existing_path(args.expected)
    if not actual.exists():
        print(f"FAIL: actual image not found: {actual}")
        print("Hint: open /topics/share-preview and click `导出当前图`, then place file at ./tmp/share-current.png")
        print("Or pass --actual /path/to/your-export.png")
        return 2
    if not expected.exists():
        print(f"FAIL: expected image not found: {expected}")
        print("Hint: check expected reference path or pass --expected /path/to/reference.png")
        return 2

    try:
        with Image.open(actual) as a_img, Image.open(expected) as e_img:
            if a_img.size != e_img.size:
                print(f"FAIL: size mismatch actual={a_img.size}, expected={e_img.size}")
                print("Hint: export using 1023x1537 from /topics/share-preview")
                return 2
    except Exception:
        print("FAIL: unable to read image sizes")
        return 2

    try:
        if sha1(actual) == sha1(expected):
            print("FAIL: actual image is byte-identical to reference image.")
            print("Hint: export current preview from /topics/share-preview, do not reuse reference file.")
            return 2
    except Exception:
        print("FAIL: unable to hash images for identity check")
        return 2

    cmd = [
        sys.executable,
        "./scripts/image_diff.py",
        str(actual),
        str(expected),
        "--json",
        "--out",
        str(args.out),
        "--threshold",
        str(args.threshold),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        print("FAIL: image_diff.py failed")
        print(proc.stdout)
        print(proc.stderr)
        return proc.returncode or 1

    result = json.loads(proc.stdout.strip())
    changed_percent = float(result["changed_percent"])
    mean_diff = float(result["mean_abs_channel_diff"])

    ok_percent = changed_percent <= args.max_changed_percent
    ok_mean = mean_diff <= args.max_mean_abs_channel_diff
    ok = ok_percent and ok_mean

    print("Share Verify Result")
    print(f"- actual: {result['actual']}")
    print(f"- expected: {result['expected']}")
    print(f"- changed_percent: {changed_percent:.6f} (limit {args.max_changed_percent})")
    print(f"- mean_abs_channel_diff: {mean_diff:.6f} (limit {args.max_mean_abs_channel_diff})")
    print(f"- diff_image: {args.out}")
    print(f"- verdict: {'PASS' if ok else 'FAIL'}")
    if args.print_json:
        payload = {
            "actual": result["actual"],
            "expected": result["expected"],
            "changed_percent": changed_percent,
            "mean_abs_channel_diff": mean_diff,
            "max_changed_percent": args.max_changed_percent,
            "max_mean_abs_channel_diff": args.max_mean_abs_channel_diff,
            "threshold": args.threshold,
            "diff_image": args.out,
            "verdict": "PASS" if ok else "FAIL",
        }
        print(json.dumps(payload, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
