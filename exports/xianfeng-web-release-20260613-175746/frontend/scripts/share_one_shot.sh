#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: npm run share:one-shot -- '<share-preview-url>'"
  exit 1
fi

URL="$1"

echo "[0/4] Preflight doctor..."
python3 ./scripts/share_doctor.py

echo "[1/4] Ingest latest exported share image..."
python3 ./scripts/ingest_share_export.py

if [ ! -f "./tmp/share-current.png" ]; then
  echo "FAIL: ./tmp/share-current.png not found after ingest."
  echo "Open /topics/share-preview and click 导出当前图, then rerun."
  exit 2
fi

echo "[2/4] Apply tuning + build + strict verify..."
python3 ./scripts/share_pipeline.py "$URL" \
  --backup \
  --show-diff \
  --verify \
  --max-changed-percent 2.0 \
  --max-mean-abs-channel-diff 6.0 \
  --threshold 16

echo "[3/4] Done."
