#!/usr/bin/env sh
set -eu

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env"
  set +a
fi

status=0

check() {
  label="$1"
  shift
  if "$@" >/tmp/xianfeng-mobile-doctor.out 2>&1; then
    printf "ok   %s\n" "$label"
  else
    printf "miss %s\n" "$label"
    sed 's/^/     /' /tmp/xianfeng-mobile-doctor.out
    status=1
  fi
}

if [ -n "${VITE_API_URL:-}" ]; then
  case "$VITE_API_URL" in
    http://localhost*|https://localhost*|http://127.*|https://127.*)
      printf "miss VITE_API_URL: must not use localhost for native builds (%s)\n" "$VITE_API_URL"
      status=1
      ;;
    *)
      printf "ok   VITE_API_URL=%s\n" "$VITE_API_URL"
      ;;
  esac
else
  printf "miss VITE_API_URL: set it in apps/mobile/.env\n"
  status=1
fi

check "Node" node -v
check "npm" npm -v
check "Capacitor CLI" npx cap --version
check "Java runtime for Android Gradle" java -version

if command -v xcode-select >/dev/null 2>&1; then
  dev_dir=$(xcode-select -p 2>/dev/null || true)
  if [ "$dev_dir" = "/Applications/Xcode.app/Contents/Developer" ]; then
    printf "ok   Xcode developer directory=%s\n" "$dev_dir"
  else
    printf "miss Xcode developer directory: current=%s\n" "${dev_dir:-unset}"
    printf "     Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer\n"
    status=1
  fi
else
  printf "miss xcode-select\n"
  status=1
fi

exit "$status"
