#!/usr/bin/env python3
from __future__ import annotations

import argparse
import difflib
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse


BASE_LAYOUT = {
    "summary": 350,
    "section": 557,
    "cta": 1190,
    "footer": 1408,
}

BASE_SECTION = {
    "timelineLineTop": 75,
    "timelineDotsTop": 111,
    "cardsLeft": 74,
}


def pick_num(qs: dict[str, list[str]], key: str, default: float) -> float:
    vals = qs.get(key)
    if not vals:
        return default
    try:
        return float(vals[0])
    except Exception:
        return default


def replace_prop(block: str, key: str, value: int) -> str:
    pattern = rf"({re.escape(key)}\s*:\s*)(-?\d+)"
    return re.sub(pattern, rf"\g<1>{value}", block, count=1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply share-preview tuning URL into XianfengSharePoster constants.")
    parser.add_argument("url", help="share-preview URL with query params")
    parser.add_argument(
        "--file",
        default="src/components/XianfengSharePoster.tsx",
        help="Target component file path",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print resolved values only")
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Write a .bak backup file before applying changes",
    )
    parser.add_argument(
        "--show-diff",
        action="store_true",
        help="Print unified diff preview after applying replacements",
    )
    parser.add_argument(
        "--update-base",
        action="store_true",
        help="Also update layoutConfig/sectionLayoutConfig base coordinates (normally keep off)",
    )
    args = parser.parse_args()

    parsed = urlparse(args.url)
    qs = parse_qs(parsed.query)

    sy = pick_num(qs, "sy", 0)
    ky = pick_num(qs, "ky", 0)
    cy = pick_num(qs, "cy", 0)
    fy = pick_num(qs, "fy", 0)
    ly = pick_num(qs, "ly", 0)
    dy = pick_num(qs, "dy", 0)
    cx = pick_num(qs, "cx", 0)

    resolved = {
        "summaryY": int(round(BASE_LAYOUT["summary"] + sy)),
        "sectionY": int(round(BASE_LAYOUT["section"] + ky)),
        "ctaY": int(round(BASE_LAYOUT["cta"] + cy)),
        "footerY": int(round(BASE_LAYOUT["footer"] + fy)),
        "timelineLineTop": int(round(BASE_SECTION["timelineLineTop"] + ly)),
        "timelineDotsTop": int(round(BASE_SECTION["timelineDotsTop"] + dy)),
        "cardsLeft": int(round(BASE_SECTION["cardsLeft"] + cx)),
    }

    print("Resolved tuning:")
    for k, v in resolved.items():
        print(f"  {k}={v}")

    if args.dry_run:
        return 0

    file_path = Path(args.file)
    original = file_path.read_text(encoding="utf-8")
    content = original

    if args.update_base:
        # layoutConfig replacements
        content = re.sub(
            r"(summary:\s*\{\s*x:\s*24,\s*y:\s*)(-?\d+)",
            rf"\g<1>{resolved['summaryY']}",
            content,
            count=1,
        )
        content = re.sub(
            r"(section:\s*\{\s*x:\s*24,\s*y:\s*)(-?\d+)",
            rf"\g<1>{resolved['sectionY']}",
            content,
            count=1,
        )
        content = re.sub(
            r"(cta:\s*\{\s*x:\s*24,\s*y:\s*)(-?\d+)",
            rf"\g<1>{resolved['ctaY']}",
            content,
            count=1,
        )
        content = re.sub(
            r"(footer:\s*\{\s*x:\s*24,\s*y:\s*)(-?\d+)",
            rf"\g<1>{resolved['footerY']}",
            content,
            count=1,
        )

        # sectionLayoutConfig replacements
        content = re.sub(
            r"(timelineLineTop:\s*)(-?\d+)",
            rf"\g<1>{resolved['timelineLineTop']}",
            content,
            count=1,
        )
        content = re.sub(
            r"(timelineDotsTop:\s*)(-?\d+)",
            rf"\g<1>{resolved['timelineDotsTop']}",
            content,
            count=1,
        )
        content = re.sub(
            r"(cardsLeft:\s*)(-?\d+)",
            rf"\g<1>{resolved['cardsLeft']}",
            content,
            count=1,
        )

    # finalTuning replacements (store deltas for production default render)
    m = re.search(r"const finalTuning = \{[\s\S]*?\} as const;", content)
    if m:
        block = m.group(0)
        block = re.sub(r"(textScale:\s*)(-?\d+(?:\.\d+)?)", rf"\g<1>{pick_num(qs, 'ts', 1):.4f}", block, count=1)
        block = re.sub(r"(summary:\s*)(-?\d+)", rf"\g<1>{int(round(sy))}", block, count=1)
        block = re.sub(r"(section:\s*)(-?\d+)", rf"\g<1>{int(round(ky))}", block, count=1)
        block = re.sub(r"(cta:\s*)(-?\d+)", rf"\g<1>{int(round(cy))}", block, count=1)
        block = re.sub(r"(footer:\s*)(-?\d+)", rf"\g<1>{int(round(fy))}", block, count=1)
        block = re.sub(r"(timelineLineTop:\s*)(-?\d+)", rf"\g<1>{int(round(ly))}", block, count=1)
        block = re.sub(r"(timelineDotsTop:\s*)(-?\d+)", rf"\g<1>{int(round(dy))}", block, count=1)
        block = re.sub(r"(cardsLeft:\s*)(-?\d+)", rf"\g<1>{int(round(cx))}", block, count=1)
        content = content[: m.start()] + block + content[m.end() :]

    if args.backup:
        backup_path = file_path.with_suffix(file_path.suffix + ".bak")
        backup_path.write_text(original, encoding="utf-8")
        print(f"Backup written: {backup_path}")

    if args.show_diff:
        diff = difflib.unified_diff(
            original.splitlines(keepends=True),
            content.splitlines(keepends=True),
            fromfile=str(file_path),
            tofile=str(file_path),
        )
        print("".join(diff))

    file_path.write_text(content, encoding="utf-8")
    print(f"Updated {file_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
