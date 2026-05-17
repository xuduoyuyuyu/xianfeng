#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/Users/QUAN/Downloads/Project/xianfeng"
BACKUP_DIR="${ROOT_DIR}/backup-20260514-2033"
BACKEND_DIR="${BACKUP_DIR}/backend-dist"
FRONTEND_DIR="${BACKUP_DIR}/frontend-dist"
BACKEND_LOG="/tmp/xianfeng_backend.log"
GATEWAY_CONF="/tmp/xianfeng-gateway-local.conf"
GATEWAY_NAME="xianfeng_local_gateway"

echo "[1/6] Validate backup directories..."
if [[ ! -d "${BACKEND_DIR}" ]]; then
  echo "ERROR: backend-dist not found: ${BACKEND_DIR}" >&2
  exit 1
fi
if [[ ! -d "${FRONTEND_DIR}" ]]; then
  echo "ERROR: frontend-dist not found: ${FRONTEND_DIR}" >&2
  exit 1
fi

echo "[2/6] Restart backend on :3001..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
cd "${BACKEND_DIR}"
nohup node index.js </dev/null >"${BACKEND_LOG}" 2>&1 &
BACKEND_PID=$!
echo "Backend PID: ${BACKEND_PID}"

echo "[3/6] Write local nginx gateway config..."
cat >"${GATEWAY_CONF}" <<'EOF'
server {
  listen 80;
  server_name localhost;
  root /usr/share/nginx/html;
  index index.html admin.html;

  location /api/ {
    proxy_pass http://host.docker.internal:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /uploads/ {
    proxy_pass http://host.docker.internal:3001/uploads/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

echo "[4/6] Recreate nginx gateway container on :8888..."
docker rm -f "${GATEWAY_NAME}" 2>/dev/null || true
docker run -d \
  --name "${GATEWAY_NAME}" \
  -p 8888:80 \
  -v "${FRONTEND_DIR}:/usr/share/nginx/html:ro" \
  -v "${GATEWAY_CONF}:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.27-alpine >/dev/null

echo "[5/6] Health checks..."
sleep 2
curl -sSI http://localhost:3001/ | head -n 5 || true
curl -sSI http://localhost:8888/admin/login | head -n 5 || true

echo "[6/6] Login API check..."
curl -sS -X POST http://localhost:8888/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123456"}' | head -c 220
echo
echo "Done. Open: http://localhost:8888/admin/login"
