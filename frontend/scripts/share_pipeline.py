#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> int:
    print(f"$ {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=str(cwd))
    return proc.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply share tuning URL, build, and verify in one pipeline.")
    parser.add_argument("url", help="share-preview URL with query parameters")
    parser.add_argument(
        "--frontend-dir",
        default="frontend",
        help="Frontend directory (default: frontend)",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip npm build step",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Pass --backup to apply_share_tuning.py",
    )
    parser.add_argument(
        "--show-diff",
        action="store_true",
        help="Pass --show-diff to apply_share_tuning.py",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Run share verify at the end (requires ./tmp/share-current.png)",
    )
    parser.add_argument(
        "--max-changed-percent",
        type=float,
        default=3.0,
        help="Pass-through threshold for share_verify.py",
    )
    parser.add_argument(
        "--max-mean-abs-channel-diff",
        type=float,
        default=8.0,
        help="Pass-through threshold for share_verify.py",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=16,
        help="Per-channel threshold for share_verify.py/image_diff.py",
    )
    parser.add_argument(
        "--actual",
        default="./tmp/share-current.png",
        help="Actual image path for verify step",
    )
    parser.add_argument(
        "--expected",
        default="./public/assets/share-topic-reference.png",
        help="Expected image path for verify step",
    )
    parser.add_argument(
        "--print-json",
        action="store_true",
        help="Pass --print-json to share_verify.py",
    )
    args = parser.parse_args()

    frontend_dir = Path(args.frontend_dir).resolve()
    if not frontend_dir.exists():
        print(f"frontend dir not found: {frontend_dir}")
        return 2

    apply_cmd = ["python3", "./scripts/apply_share_tuning.py", args.url]
    if args.backup:
        apply_cmd.append("--backup")
    if args.show_diff:
        apply_cmd.append("--show-diff")
    rc = run(apply_cmd, frontend_dir)
    if rc != 0:
        return rc

    if not args.skip_build:
        rc = run(["npm", "run", "build"], frontend_dir)
        if rc != 0:
            return rc

    if args.verify:
        rc = run(
            [
                "python3",
                "./scripts/share_verify.py",
                "--actual",
                args.actual,
                "--expected",
                args.expected,
                "--max-changed-percent",
                str(args.max_changed_percent),
                "--max-mean-abs-channel-diff",
                str(args.max_mean_abs_channel_diff),
                "--threshold",
                str(args.threshold),
                *(["--print-json"] if args.print_json else []),
            ],
            frontend_dir,
        )
        if rc != 0:
            return rc

    print("Pipeline completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
