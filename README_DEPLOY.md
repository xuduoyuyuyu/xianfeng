# 家长先疯部署说明（本地一键启动 + 生产部署）

## 配置分层（关键）

项目现在分成两套 Compose 配置：

- `docker-compose.yml`：本地默认配置（无证书依赖，直接可跑）
- `docker-compose.prod.yml`：生产覆盖配置（开启 443、挂载 `/opt/cert`、使用生产 Nginx）

这样可以做到：

- 本地一条命令即可启动
- 生产行为保持不变，不受本地兼容改动影响

## 1. 本地一键启动

首次执行建议：

```bash
chmod +x scripts/local/up.sh scripts/local/down.sh scripts/local/ps.sh
```

启动：

```bash
./scripts/local/up.sh
```

查看状态：

```bash
./scripts/local/ps.sh
```

停止：

```bash
./scripts/local/down.sh
```

本地访问：

- 前台：`http://localhost/`
- API：`http://localhost/api/programs`

## 2. 服务器首次部署

准备环境：

- 安装 Docker、Docker Compose Plugin、Git
- 开放 80/443 端口
- 代码目录建议 `/opt/xianfeng`
- 证书目录 `/opt/cert`（由生产覆盖配置挂载）

首次克隆：

```bash
chmod +x scripts/deploy/bootstrap-server.sh scripts/deploy/update-server.sh
./scripts/deploy/bootstrap-server.sh <你的-git-仓库地址> /opt/xianfeng main
```

或手动：

```bash
git clone -b main <你的-git-仓库地址> /opt/xianfeng
cd /opt/xianfeng
cp .env.production.example .env.production
```

然后编辑 `/opt/xianfeng/.env.production`，至少修改：

- `JWT_SECRET`
- `CORS_ORIGIN`
- `ALLOW_PUBLIC_REGISTER=false`
- `VITE_API_URL`（同域代理时可保持空）
- AI / 火山相关变量（按需）
- 若使用火山转写并且上传地址在内网/localhost，配置 `VOLCENGINE_PUBLIC_BASE_URL=https://你的公网域名`（用于 413 时自动切标准版 URL 转写）

执行部署：

```bash
cd /opt/xianfeng
./scripts/deploy/update-server.sh
```

## 3. 日常发布流程（生产）

本地提交：

```bash
git add .
git commit -m "feat: xxx"
git push origin main
```

服务器更新：

```bash
ssh <你的服务器>
cd /opt/xianfeng
./scripts/deploy/update-server.sh
```

`update-server.sh` 会自动：

1. 检查服务器工作区是否干净
2. 拉取 `origin/main`
3. 执行 `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans`

## 4. 一键触发服务器更新（从本机）

```bash
./scripts/deploy/deploy-from-local.sh root@你的服务器IP /opt/xianfeng main
```

前提：

- 本机可 SSH 到服务器
- 服务器已完成首次部署
- 本地工作区干净

## 5. 容器结构

- `gateway`：入口代理（前端 + `/api`）
- `frontend`：React 静态站点
- `backend`：Express API
- `mongo`：MongoDB

## 6. 验证项

- 前台：`http://服务器IP/`
- 后台登录：`http://服务器IP/admin/login`
- API：`http://服务器IP/api/programs`
- 管理 API 需 Bearer Token 且用户为 `admin`
