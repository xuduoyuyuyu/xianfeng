#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"

cd "${ROOT_DIR}"

find apps/wechat-miniprogram -name '._*' -delete

"${NODE_BIN}" --test \
  frontend/src/styles.mp-webview.test.mjs \
  frontend/src/components/GlobalPublicNav.mp-webview.test.mjs \
  apps/wechat-miniprogram/pages/tab-webview.static.test.mjs \
  apps/wechat-miniprogram/utils/share.static.test.mjs \
  backend/src/routes/wechatMini.static.test.mjs \
  apps/wechat-miniprogram/utils/webview.static.test.mjs

(cd backend && "${NODE_BIN}" --test --import tsx src/services/wechatMiniAuth.test.ts)

(cd frontend && npm run build)
chmod -R a+rX frontend/dist

"${NODE_BIN}" scripts/release/verify-mini-webview-build.mjs
