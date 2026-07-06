#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

# Paths that must never be part of final deployable tree.
forbidden_paths=(
  "archives"
  "backup-20260514-2033"
  "backup-20260514-2033-sync.tgz"
  "backup-codebase-20260515-1319.tgz"
  "data"
  "dist"
  "scripts/local/start-backup-20260514-2033.sh"
  "播客首页"
  "资源管理页面"
)

violations=()
for p in "${forbidden_paths[@]}"; do
  if [[ -e "${p}" ]]; then
    violations+=("${p}")
  fi
done

if [[ ${#violations[@]} -gt 0 ]]; then
  echo "检测到历史垃圾/高风险遗留路径，已阻断部署："
  printf ' - %s\n' "${violations[@]}"
  echo "请先迁移到外部备份或删除后再部署。"
  exit 1
fi

required_release_paths=(
  "scripts/release/verify-mini-webview-ready.sh"
  "scripts/release/upload-wechat-miniprogram.sh"
  "scripts/release/verify-mini-release-chain.test.mjs"
  "apps/wechat-miniprogram/app.json"
  "apps/wechat-miniprogram/pages/share/index.js"
  "apps/wechat-miniprogram/pages/share/index.json"
  "apps/wechat-miniprogram/pages/share/index.wxml"
  "apps/wechat-miniprogram/pages/share/index.wxss"
  "apps/wechat-miniprogram/utils/share.js"
  "apps/wechat-miniprogram/utils/share.static.test.mjs"
  "backend/src/models/XiaowanziShare.ts"
  "backend/src/routes/wechatMini.ts"
  "backend/src/routes/wechatMini.static.test.mjs"
  "backend/src/services/wechatMiniAuth.ts"
  "backend/src/services/wechatMiniAuth.test.ts"
)

missing_release_paths=()
for p in "${required_release_paths[@]}"; do
  if ! git ls-files --error-unmatch "${p}" >/dev/null 2>&1; then
    missing_release_paths+=("${p}")
  fi
done

if [[ ${#missing_release_paths[@]} -gt 0 ]]; then
  echo "检测到小程序分享/小程序码发布关键文件尚未纳入 Git，已阻断部署："
  printf ' - %s\n' "${missing_release_paths[@]}"
  echo "请先 git add 这些文件并提交，避免 git archive/生产发布漏包。"
  exit 1
fi

if [[ ! -f ".release/current.lock" ]]; then
  echo "缺少 .release/current.lock（未锁定最终版），已阻断部署。"
  echo "先执行: scripts/release/freeze-current.sh"
  exit 1
fi

LOCK_COMMIT="$(awk -F= '/^COMMIT=/{print $2}' .release/current.lock)"
CURRENT_COMMIT="$(git rev-parse HEAD)"
if [[ -n "${LOCK_COMMIT}" && "${LOCK_COMMIT}" != "${CURRENT_COMMIT}" ]]; then
  echo "当前提交与锁定版本不一致，已阻断部署。"
  echo "LOCK_COMMIT=${LOCK_COMMIT}"
  echo "HEAD_COMMIT=${CURRENT_COMMIT}"
  exit 1
fi

echo "结构校验通过，版本锁一致。"
