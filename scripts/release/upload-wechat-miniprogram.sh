#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_DIR="${PROJECT_DIR:-${ROOT_DIR}/apps/wechat-miniprogram}"
WECHAT_CLI="${WECHAT_CLI:-/Applications/wechatwebdevtools.app/Contents/MacOS/cli}"
VERSION="${VERSION:-$(git -C "${ROOT_DIR}" rev-parse --short HEAD)}"
DESC="${DESC:-xianfeng mini-program ${VERSION}}"

cd "${ROOT_DIR}"

bash scripts/release/verify-mini-webview-ready.sh

"${WECHAT_CLI}" upload --project "${PROJECT_DIR}" --version "${VERSION}" --desc "${DESC}"
