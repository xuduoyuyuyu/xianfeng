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
