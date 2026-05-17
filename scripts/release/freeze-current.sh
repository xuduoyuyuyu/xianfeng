#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCK_FILE="${ROOT_DIR}/.release/current.lock"

cd "${ROOT_DIR}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "当前目录不是 git 仓库"
  exit 1
fi

COMMIT="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TIME_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

mkdir -p "$(dirname "${LOCK_FILE}")"
cat > "${LOCK_FILE}" <<LOCK
COMMIT=${COMMIT}
BRANCH=${BRANCH}
FROZEN_AT_UTC=${TIME_UTC}
LOCK

echo "已锁定当前最终版: ${LOCK_FILE}"
echo "COMMIT=${COMMIT}"
