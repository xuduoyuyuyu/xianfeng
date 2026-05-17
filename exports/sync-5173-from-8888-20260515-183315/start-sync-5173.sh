#!/usr/bin/env bash
set -euo pipefail
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$BASE_DIR/frontend-dist"
CONF_FILE="$BASE_DIR/nginx-5173.conf"

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "missing frontend snapshot: $FRONTEND_DIR" >&2
  exit 1
fi
if [[ ! -f "$CONF_FILE" ]]; then
  echo "missing nginx conf: $CONF_FILE" >&2
  exit 1
fi

docker rm -f xianfeng_sync_5173 >/dev/null 2>&1 || true

docker run -d \
  --name xianfeng_sync_5173 \
  -p 5173:80 \
  -v "$FRONTEND_DIR:/usr/share/nginx/html:ro" \
  -v "$CONF_FILE:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.27-alpine >/dev/null

echo "sync started: http://localhost:5173/programs"
