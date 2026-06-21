#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys
from PIL import Image


def check_exists(path: Path, required: bool = True) -> tuple[bool, str]:
    if path.exists():
        return True, f"OK   {path}"
    if required:
        return False, f"MISS {path}"
    return True, f"WARN {path} (optional)"


def main() -> int:
    root = Path(".").resolve()
    checks = []

    checks.append(check_exists(root / "src/components/XianfengSharePoster.tsx", required=True))
    ref_path = root / "public/assets/share-topic-reference.png"
    checks.append(check_exists(ref_path, required=True))
    checks.append(check_exists(root / "scripts/image_diff.py", required=True))
    checks.append(check_exists(root / "scripts/share_verify.py", required=True))
    checks.append(check_exists(root / "scripts/apply_share_tuning.py", required=True))
    checks.append(check_exists(root / "scripts/share_pipeline.py", required=True))
    checks.append(check_exists(root / "scripts/ingest_share_export.py", required=True))
    checks.append(check_exists(root / "tmp/share-current.png", required=False))

    print("Share Doctor")
    for _, line in checks:
        print(f"- {line}")

    if ref_path.exists():
        try:
            with Image.open(ref_path) as im:
                w, h = im.size
            if (w, h) == (1023, 1537):
                print(f"- OK   reference size {w}x{h}")
            else:
                print(f"- WARN reference size {w}x{h} (expected 1023x1537)")
        except Exception:
            print("- WARN failed to read reference image dimensions")

    missing_required = [line for ok, line in checks if not ok]
    if missing_required:
        print("\nResult: FAIL")
        print("Required files missing. Fix these before running share pipeline.")
        return 1

    print("\nResult: PASS")
    print("Environment looks ready for share tuning/verify pipeline.")
    print("Suggested next command:")
    print("  npm run share:apply:strict -- '<share-preview-url>'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
