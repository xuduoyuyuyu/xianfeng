#!/usr/bin/env bash

set -euo pipefail

SERVER_HOST="${1:-}"
SERVER_PATH="${2:-/opt/xianfeng}"
BRANCH="${3:-$(git rev-parse --abbrev-ref HEAD)}"
PUSH_FIRST="${PUSH_FIRST:-true}"

if [[ -z "${SERVER_HOST}" ]]; then
  echo "用法: $0 <server-host> [server-path] [branch]"
  echo "示例: $0 root@1.2.3.4 /opt/xianfeng main"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "当前目录不是 git 仓库"
  exit 1
fi

DIRTY_FILES="$(git status --porcelain)"
if [[ -n "${DIRTY_FILES}" ]]; then
  echo "本地还有未提交改动，已停止部署："
  echo "${DIRTY_FILES}"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${CURRENT_BRANCH}" != "${BRANCH}" ]]; then
  echo "当前分支是 ${CURRENT_BRANCH}，目标部署分支是 ${BRANCH}"
  echo "请先切到目标分支，或把第三个参数改成当前分支。"
  exit 1
fi

if [[ "${PUSH_FIRST}" == "true" ]]; then
  echo "推送本地代码到 origin/${BRANCH}"
  git push origin "${BRANCH}"
fi

echo "连接服务器并执行更新: ${SERVER_HOST}:${SERVER_PATH}"
ssh "${SERVER_HOST}" "cd '${SERVER_PATH}' && DEPLOY_BRANCH='${BRANCH}' ./scripts/deploy/update-server.sh"

echo "部署完成"
