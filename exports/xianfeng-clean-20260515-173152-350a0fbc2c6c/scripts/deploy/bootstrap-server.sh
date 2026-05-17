#!/usr/bin/env bash

set -euo pipefail

REPO_URL="${1:-}"
TARGET_DIR="${2:-/opt/xianfeng}"
BRANCH="${3:-main}"

if [[ -z "${REPO_URL}" ]]; then
  echo "用法: $0 <repo-url> [target-dir] [branch]"
  exit 1
fi

if [[ -e "${TARGET_DIR}" ]]; then
  echo "目标目录已存在: ${TARGET_DIR}"
  echo "请换一个空目录，或手动进入已有目录执行更新脚本。"
  exit 1
fi

git clone --branch "${BRANCH}" "${REPO_URL}" "${TARGET_DIR}"
cd "${TARGET_DIR}"

if [[ ! -f ".env.production" ]]; then
  cp ".env.production.example" ".env.production"
  echo "已创建 ${TARGET_DIR}/.env.production，请先填写生产环境变量。"
fi

echo
echo "初始化完成。下一步："
echo "1. 编辑 ${TARGET_DIR}/.env.production"
echo "2. 执行 ${TARGET_DIR}/scripts/deploy/update-server.sh"
