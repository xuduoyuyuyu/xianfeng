# Share Poster One-to-One Workflow

This document defines the repeatable workflow for matching the share poster to the reference image pixel-by-pixel.

## 1) Open preview

- URL: `/topics/share-preview`
- Enable overlay mode:
  - `difference` for fast visual mismatch detection
  - adjust overlay opacity as needed

Optional preflight check:

```bash
npm run share:doctor --prefix frontend
npm run share:ready --prefix frontend
```

## 2) Tune in preview

Use sliders in preview for:

- Global text scale
- Block Y offsets: `S/K/C/F`
- Section fine offsets: `L/D/X`

If needed, copy:

- tuning JSON
- tuning URL
- paste-ready TS snippet

## 3) Persist tuning into code

Apply URL tuning into `finalTuning` (default safe mode):

```bash
npm run share:apply-tuning --prefix frontend -- '<share-preview-url>'
```

Optional safe apply with backup and diff preview:

```bash
npm run share:pipeline --prefix frontend -- '<share-preview-url>' -- --backup --show-diff --skip-build
```

## 4) Build

```bash
npm run build --prefix frontend
```

## 5) Export current image

From `/topics/share-preview`, click `导出当前图`, save as `share-current.png`, place it at:

`frontend/tmp/share-current.png`

Or ingest latest download automatically:

```bash
npm run share:ingest-export --prefix frontend
```

## 6) Quantitative verification

Normal threshold:

```bash
npm run share:verify:normal --prefix frontend
```

Strict threshold:

```bash
npm run share:verify:strict --prefix frontend
```

Pipeline one-liners (apply URL + build + verify):

```bash
npm run share:pipeline:normal --prefix frontend -- '<share-preview-url>'
npm run share:pipeline:strict --prefix frontend -- '<share-preview-url>'
npm run share:apply:strict --prefix frontend -- '<share-preview-url>'
npm run share:apply:strict:ready --prefix frontend -- '<share-preview-url>'
```

`share:apply:strict` includes backup + unified diff preview before writing.
`share:apply:strict:ready` adds `share:doctor` preflight before applying.
`share:one-shot` now runs doctor first, requires ingest success, then runs strict apply pipeline.

Custom thresholds/paths via pipeline:

```bash
npm run share:pipeline --prefix frontend -- '<share-preview-url>' -- --verify --actual ./tmp/share-current.png --expected ./public/assets/share-topic-reference.png --max-changed-percent 2.5 --max-mean-abs-channel-diff 7 --threshold 16
```

## 7) Iterate until pass

Repeat steps 1-6 until the strict threshold passes consistently.

## Troubleshooting

- `FAIL: actual image not found`
  - Export from `/topics/share-preview` via `导出当前图`
  - Save/copy to `frontend/tmp/share-current.png`
  - Or pass custom path: `--actual /path/to/export.png`

- `FAIL: expected image not found`
  - Confirm reference exists at `frontend/public/assets/share-topic-reference.png`
  - Or pass custom path: `--expected /path/to/reference.png`

- Verify failed but looks close
  - Try `difference` mode in preview and reduce local hotspots first (`L/D/X`, `S/K/C/F`)
  - Then re-run `share:verify:normal`, and finally `share:verify:strict`
