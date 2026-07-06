#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_URL="${1:-https://xianfeng.xinzhi.info/}"

node "${ROOT_DIR}/scripts/release/verify-mini-webview-build.mjs" --url "${TARGET_URL}"
