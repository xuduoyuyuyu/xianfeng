#!/usr/bin/env sh
set -eu

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
FRONTEND_DIR=$(CDPATH= cd -- "$APP_DIR/../../frontend" && pwd)

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env"
  set +a
fi

if [ -z "${VITE_API_URL:-}" ]; then
  echo "VITE_API_URL is required for native app builds. Copy apps/mobile/.env.example to apps/mobile/.env and set the production API origin." >&2
  exit 1
fi

case "$VITE_API_URL" in
  http://localhost*|https://localhost*|http://127.*|https://127.*)
    echo "VITE_API_URL must point to a reachable HTTPS production origin for native builds, not $VITE_API_URL." >&2
    exit 1
    ;;
esac

export VITE_API_URL
export VITE_PRO_BILLING_ENABLED="${VITE_PRO_BILLING_ENABLED:-true}"

cd "$FRONTEND_DIR"
npm run build

# Capacitor's native copy step can fail on macOS AppleDouble files, especially
# under asset paths that contain spaces or Chinese characters.
find "$FRONTEND_DIR/dist" -name '._*' -delete
