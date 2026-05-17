#!/usr/bin/env bash
set -euo pipefail
docker ps --filter name=xianfeng_sync_5173 --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
