#!/usr/bin/env bash
set -euo pipefail
docker rm -f xianfeng_sync_5173 >/dev/null 2>&1 || true
echo "sync stopped"
