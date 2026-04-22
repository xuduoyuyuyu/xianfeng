#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.production}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

cd "${ROOT_DIR}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "当前目录不是 git 仓库: ${ROOT_DIR}"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "缺少环境变量文件: ${ROOT_DIR}/${ENV_FILE}"
  echo "可先执行: cp .env.production.example ${ENV_FILE}"
  exit 1
fi

DIRTY_FILES="$(git status --porcelain --untracked-files=no)"
if [[ -n "${DIRTY_FILES}" ]]; then
  echo "服务器工作区存在未提交改动，已停止自动更新："
  echo "${DIRTY_FILES}"
  exit 1
fi

echo "同步代码: ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
git fetch "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}"
git pull --ff-only "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}"

echo "重建并启动容器"
docker compose --env-file "${ENV_FILE}" up -d --build --remove-orphans

echo "当前服务状态"
docker compose --env-file "${ENV_FILE}" ps
