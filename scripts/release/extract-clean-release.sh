#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f ".release/current.lock" ]]; then
  echo "缺少 .release/current.lock，请先执行 scripts/release/freeze-current.sh"
  exit 1
fi

LOCK_COMMIT="$(awk -F= '/^COMMIT=/{print $2}' .release/current.lock)"
if [[ -z "${LOCK_COMMIT}" ]]; then
  echo "锁文件里没有 COMMIT"
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_BASE="${OUT_BASE:-${ROOT_DIR}/exports}"
OUT_DIR="${OUT_BASE}/xianfeng-clean-${STAMP}-${LOCK_COMMIT:0:12}"

mkdir -p "${OUT_DIR}"

git archive --format=tar "${LOCK_COMMIT}" | tar -xf - -C "${OUT_DIR}"

cat > "${OUT_DIR}/CLEAN_RELEASE_INFO.txt" <<INFO
CLEAN_RELEASE=true
SOURCE_REPO=${ROOT_DIR}
LOCK_COMMIT=${LOCK_COMMIT}
EXPORTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOTE=This export includes only git-tracked files from the locked commit.
INFO

echo "${OUT_DIR}"
