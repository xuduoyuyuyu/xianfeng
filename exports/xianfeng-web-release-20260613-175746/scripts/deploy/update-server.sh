#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.production}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_GIT_RETRIES="${DEPLOY_GIT_RETRIES:-5}"
DEPLOY_GIT_RETRY_SLEEP_SEC="${DEPLOY_GIT_RETRY_SLEEP_SEC:-3}"

cd "${ROOT_DIR}"

"${ROOT_DIR}/scripts/release/verify-clean-structure.sh"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "当前目录不是 git 仓库: ${ROOT_DIR}"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "缺少环境变量文件: ${ROOT_DIR}/${ENV_FILE}"
  echo "可先执行: cp .env.production.example ${ENV_FILE}"
  exit 1
fi

BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-backend/.env}"

sync_backend_env() {
  local source_env="${ENV_FILE}"
  local target_env="${BACKEND_ENV_FILE}"

  if [[ ! -f "${target_env}" ]]; then
    echo "缺少 ${target_env}，从 ${source_env} 创建"
    cp "${source_env}" "${target_env}"
    chmod 600 "${target_env}" || true
    return
  fi

  if ! cmp -s "${source_env}" "${target_env}"; then
    echo "同步 ${source_env} 到 ${target_env}"
    cp "${source_env}" "${target_env}"
    chmod 600 "${target_env}" || true
  fi
}

git_network_retry() {
  local attempt=1
  while true; do
    if git -c http.version=HTTP/1.1 "$@"; then
      return 0
    fi
    if [[ "${attempt}" -ge "${DEPLOY_GIT_RETRIES}" ]]; then
      echo "git 命令重试失败（${attempt}/${DEPLOY_GIT_RETRIES}）：git $*"
      return 1
    fi
    echo "git 命令失败，${DEPLOY_GIT_RETRY_SLEEP_SEC}s 后重试（${attempt}/${DEPLOY_GIT_RETRIES}）：git $*"
    sleep "${DEPLOY_GIT_RETRY_SLEEP_SEC}"
    attempt=$((attempt + 1))
  done
}

DIRTY_FILES="$(git status --porcelain --untracked-files=no)"
if [[ -n "${DIRTY_FILES}" ]]; then
  echo "服务器工作区存在未提交改动，已停止自动更新："
  echo "${DIRTY_FILES}"
  exit 1
fi

echo "同步代码: ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
git_network_retry fetch "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}"
git_network_retry pull --ff-only "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}"

sync_backend_env

echo "重建并启动容器（生产配置）"
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "${ENV_FILE}" up -d --build --remove-orphans

echo "当前服务状态"
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "${ENV_FILE}" ps
