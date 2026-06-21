#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import shutil
from pathlib import Path
from PIL import Image


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest latest exported share image into frontend/tmp/share-current.png")
    parser.add_argument(
        "--source-dir",
        default=str(Path.home() / "Downloads"),
        help="Directory to search exported images (default: ~/Downloads)",
    )
    parser.add_argument(
        "--pattern",
        default="share-current*.png",
        help="Primary glob pattern in source dir (default: share-current*.png)",
    )
    parser.add_argument(
        "--fallback-patterns",
        default="*分享图*.png,*share*.png,*.png",
        help="Comma-separated fallback glob patterns",
    )
    parser.add_argument(
        "--target",
        default="./tmp/share-current.png",
        help="Target path (default: ./tmp/share-current.png)",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=1023,
        help="Preferred image width for filtering",
    )
    parser.add_argument(
        "--height",
        type=int,
        default=1537,
        help="Preferred image height for filtering",
    )
    parser.add_argument(
        "--reference",
        default="./public/assets/share-topic-reference.png",
        help="Reference image path for anti-mistaken-ingest check",
    )
    args = parser.parse_args()

    src_dir = Path(args.source_dir).expanduser().resolve()
    target = Path(args.target).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)

    patterns = [args.pattern] + [p.strip() for p in args.fallback_patterns.split(",") if p.strip()]
    seen = set()
    matches: list[Path] = []
    for pat in patterns:
        for p in sorted(src_dir.glob(pat), key=lambda x: x.stat().st_mtime, reverse=True):
            if p in seen:
                continue
            seen.add(p)
            matches.append(p)

    # Prefer exact expected poster size.
    sized: list[Path] = []
    for p in matches:
        try:
            with Image.open(p) as im:
                if im.size == (args.width, args.height):
                    sized.append(p)
        except Exception:
            continue
    if sized:
        matches = sized
    if not matches:
        print(f"FAIL: no files matched usable images in {src_dir}")
        print(f"Tried patterns: {patterns}")
        return 1

    def sha1(path: Path) -> str:
        h = hashlib.sha1()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()

    ref_path = Path(args.reference)
    ref_hash = sha1(ref_path) if ref_path.exists() else None

    latest = matches[0]
    if ref_hash is not None:
        non_ref = []
        for p in matches:
            try:
                if sha1(p) != ref_hash:
                    non_ref.append(p)
            except Exception:
                continue
        if non_ref:
            latest = non_ref[0]
        else:
            print("FAIL: matched files are identical to reference image; please export current preview first.")
            print("Hint: open /topics/share-preview and click `导出当前图`.")
            return 1

    shutil.copy2(latest, target)
    print(f"OK: copied {latest} -> {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
