# Mini Program Transcript Display Design

Date: 2026-07-13
Status: approved

## Goal

Make native WeChat mini-program program details display every transcript segment and present every existing timestamp as `HH:MM:SS · speaker`, matching the accepted reference.

## Scope

- Remove the client-side eight-segment transcript limit.
- Normalize existing timestamp labels for display by using the start point only:
  - `00:00:05` stays `00:00:05`.
  - `0:00:05`, `00:05`, and fractional forms such as `00:00:05.25` become `00:00:05`.
  - Ranges such as `00:00:05-00:00:09` and `00:05-00:09` display their normalized start as `00:00:05`.
- Keep a genuinely missing timestamp empty. Do not derive or invent a timestamp from transcript order, paragraph count, or audio duration.
- Preserve the existing speaker-label mapping and transcript text.
- Do not modify production records, transcription jobs, audio, backend persistence, or deployment configuration in this workstream.

## Data Flow

The public program-detail API remains the source of transcript segments. `normalizeTranscript()` in `apps/wechat-miniprogram/pages/webview/index.js` maps every segment, normalizes the display timestamp, filters only rows without text, and returns the complete array. The existing WXML renders the normalized time, separator, speaker label, and text.

## Time Normalization

Timestamp normalization is display-only and deterministic:

1. Trim the input and take the portion before the first hyphen as the start point.
2. Remove a fractional-second suffix.
3. Parse either `HH:MM:SS` or `MM:SS` components as non-negative integers.
4. Convert the resulting total seconds to zero-padded `HH:MM:SS`.
5. Return an empty string when the input is empty or cannot be parsed safely.

This also corrects legacy values such as `101:22:00` only when they represent a syntactically valid `HH:MM:SS`; it does not guess whether the source intended `01:01:22`. Source-data correction remains a separate data-repair task.

## Verification

Focused static/runtime tests must prove:

- More than eight transcript rows are retained.
- Point, range, fractional, and `MM:SS` inputs display as `HH:MM:SS`.
- Empty time remains empty while the speaker and text remain visible.
- Existing program-detail normalization and WXML assertions remain green.

## Deferred Data Repair

The 12 public programs whose transcript records contain no timestamps require recovery from original ASR output or a new timestamped transcription. Production backfill requires a separate approval and verification pass.
