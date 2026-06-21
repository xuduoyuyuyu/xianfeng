#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

load_ai_env_from_backend_env() {
  local env_file="${ROOT_DIR}/backend/.env"
  if [[ ! -f "${env_file}" ]]; then
    return 0
  fi

  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "${line}" || "${line:0:1}" == "#" ]] && continue
    [[ "${line}" != *=* ]] && continue

    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    case "${key}" in
      AI_PROVIDER|OPENAI_API_KEY|AI_TRANSCRIBE_MODEL|AI_TEXT_MODEL|DEEPSEEK_API_KEY|DEEPSEEK_MODEL_ID|DEEPSEEK_BASE_URL|VOLCENGINE_APP_ID|VOLCENGINE_ACCESS_TOKEN|VOLCENGINE_API_KEY|VOLCENGINE_SECRET_KEY|VOLCENGINE_RESOURCE_ID|VOLCENGINE_MODE|VOLCENGINE_PUBLIC_BASE_URL|PUBLIC_BASE_URL|VOLCENGINE_FETCH_TIMEOUT_MS|ARK_API_KEY|ARK_MODEL_ID|ARK_BASE_URL)
        export "${key}=${value}"
        ;;
    esac
  done < "${env_file}"
}

if ! command -v docker >/dev/null 2>&1; then
  if [[ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]]; then
    export PATH="/Applications/Docker.app/Contents/Resources/bin:${PATH}"
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker 命令。请先安装 Docker Desktop。"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  if [[ "${OSTYPE:-}" == darwin* ]]; then
    echo "Docker daemon 未就绪，正在尝试启动 Docker Desktop..."
    open -a Docker || true
    for _ in {1..30}; do
      if docker info >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
  fi
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon 未就绪，请手动启动 Docker Desktop 后重试。"
  exit 1
fi

# macOS 资源分叉文件会导致 Docker build context 失败，启动前清理。
find backend frontend -name '._*' -type f -delete || true
mkdir -p backend/uploads/audio backend/uploads/images

load_ai_env_from_backend_env
docker compose up -d --build --remove-orphans
# frontend/backend rebuild 后，gateway 需要重载 upstream DNS，避免偶发 502。
docker compose restart gateway >/dev/null 2>&1 || true
docker compose ps

echo "本地环境已启动: http://localhost/"
