#!/usr/bin/env python3
from __future__ import annotations

import argparse
from urllib.parse import urlparse, parse_qs


BASE_LAYOUT = {
    "summary_y": 350,
    "section_y": 557,
    "cta_y": 1190,
    "footer_y": 1408,
}

BASE_SECTION = {
    "timeline_line_top": 75,
    "timeline_dots_top": 111,
    "cards_left": 74,
}


def pick_num(qs: dict[str, list[str]], key: str, default: float) -> float:
    vals = qs.get(key)
    if not vals:
        return default
    try:
        return float(vals[0])
    except Exception:
        return default


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate final tuning constants from share-preview URL.")
    parser.add_argument("url", help="share-preview URL with query params")
    args = parser.parse_args()

    parsed = urlparse(args.url)
    qs = parse_qs(parsed.query)

    text_scale = pick_num(qs, "ts", 1)
    sy = pick_num(qs, "sy", 0)
    ky = pick_num(qs, "ky", 0)
    cy = pick_num(qs, "cy", 0)
    fy = pick_num(qs, "fy", 0)
    ly = pick_num(qs, "ly", 0)
    dy = pick_num(qs, "dy", 0)
    cx = pick_num(qs, "cx", 0)

    final = {
        "text_scale": text_scale,
        "summary_y": BASE_LAYOUT["summary_y"] + sy,
        "section_y": BASE_LAYOUT["section_y"] + ky,
        "cta_y": BASE_LAYOUT["cta_y"] + cy,
        "footer_y": BASE_LAYOUT["footer_y"] + fy,
        "timeline_line_top": BASE_SECTION["timeline_line_top"] + ly,
        "timeline_dots_top": BASE_SECTION["timeline_dots_top"] + dy,
        "cards_left": BASE_SECTION["cards_left"] + cx,
    }

    print("Paste-ready constants:")
    print("layoutConfig:")
    print(f"  summary.y = {int(round(final['summary_y']))}")
    print(f"  section.y = {int(round(final['section_y']))}")
    print(f"  cta.y = {int(round(final['cta_y']))}")
    print(f"  footer.y = {int(round(final['footer_y']))}")
    print("sectionLayoutConfig:")
    print(f"  timelineLineTop = {int(round(final['timeline_line_top']))}")
    print(f"  timelineDotsTop = {int(round(final['timeline_dots_top']))}")
    print(f"  cardsLeft = {int(round(final['cards_left']))}")
    print("textScale:")
    print(f"  {final['text_scale']:.4f}")

    print("\nTS snippet:")
    print("const finalized = {")
    print(f"  textScale: {final['text_scale']:.4f},")
    print("  layout: {")
    print(f"    summaryY: {int(round(final['summary_y']))},")
    print(f"    sectionY: {int(round(final['section_y']))},")
    print(f"    ctaY: {int(round(final['cta_y']))},")
    print(f"    footerY: {int(round(final['footer_y']))},")
    print("  },")
    print("  section: {")
    print(f"    timelineLineTop: {int(round(final['timeline_line_top']))},")
    print(f"    timelineDotsTop: {int(round(final['timeline_dots_top']))},")
    print(f"    cardsLeft: {int(round(final['cards_left']))},")
    print("  },")
    print("} as const;")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

