# 家长先疯部署说明（Git + Docker + 云服务器）

## 推荐发布链路

推荐把整站整理成一个根目录 git 仓库，发布路径固定为：

```text
本地开发机
  -> git push origin main
  -> 服务器 git pull
  -> docker compose up -d --build
```

仓库内已经补好这几个文件：

- `.env.production.example`：生产环境变量模板
- `scripts/deploy/bootstrap-server.sh`：服务器首次克隆脚本
- `scripts/deploy/update-server.sh`：服务器日常更新脚本
- `scripts/deploy/deploy-from-local.sh`：本地一键触发服务器更新

## 1. 先处理当前仓库结构

当前项目根目录还不是 git 仓库，只有 `frontend/` 是一个独立 git 仓库。为了让前端、后端、Docker 编排和部署说明一起发布，建议迁移成“根目录单仓库”。

推荐顺序：

```bash
cd /Users/QUAN/Downloads/Project/xianfeng

# 1) 先备份 frontend 现有提交历史
git -C frontend bundle create ../frontend-history.bundle --all

# 2) 再备份 frontend 的 .git 目录，避免直接丢历史
mv frontend/.git ../frontend.git.backup

# 3) 在根目录初始化整站仓库
git init
git branch -M main
git add .
git commit -m "chore: initialize xianfeng monorepo"

# 4) 绑定远端仓库
git remote add origin <你的-git-仓库地址>
git push -u origin main
```

说明：

- `frontend-history.bundle` 是前端历史的离线备份
- `frontend.git.backup` 是原始仓库目录备份，确认迁移稳定后再决定是否删除
- 根目录 `.gitignore` 已经补好，`node_modules`、`uploads`、本地环境变量不会被提交

## 2. 服务器首次部署

准备环境：

- 安装 Docker、Docker Compose Plugin、Git
- 开放 80 端口
- 代码目录建议使用 `/opt/xianfeng`

首次克隆：

```bash
chmod +x scripts/deploy/bootstrap-server.sh scripts/deploy/update-server.sh
./scripts/deploy/bootstrap-server.sh <你的-git-仓库地址> /opt/xianfeng main
```

或手动执行：

```bash
git clone -b main <你的-git-仓库地址> /opt/xianfeng
cd /opt/xianfeng
cp .env.production.example .env.production
```

然后编辑 `/opt/xianfeng/.env.production`，至少要改这些值：

- `JWT_SECRET`
- `CORS_ORIGIN`
- `ALLOW_PUBLIC_REGISTER=false`
- `VITE_API_URL`：如果前后端同域名经 `gateway` 代理，保持为空即可
- AI / 火山引擎相关变量：按是否启用填写

完成后执行：

```bash
cd /opt/xianfeng
./scripts/deploy/update-server.sh
```

## 3. 日常发布流程

本地发布：

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

这个脚本会自动做三件事：

1. 检查服务器工作区是否干净，避免把线上临时改动冲掉
2. 拉取 `origin/main`
3. 执行 `docker compose --env-file .env.production up -d --build`

如果你想从自己电脑上一条命令完成“推送 + 服务器更新”，可以直接用：

```bash
./scripts/deploy/deploy-from-local.sh root@你的服务器IP /opt/xianfeng main
```

它会自动做两件事：

1. 先把当前分支推到 GitHub
2. 再通过 SSH 登录服务器执行 `update-server.sh`

使用前提：

- 你的电脑可以 `ssh` 到服务器
- 服务器上已经完成首次部署
- 本地工作区是干净的，没有未提交改动

## 4. 当前部署细节

容器结构：

- `gateway`：80 端口入口，代理前端和 `/api`
- `frontend`：React 打包后的静态站点
- `backend`：Express API
- `mongo`：MongoDB

已经顺手补了两个更适合生产的点：

- MongoDB 只绑定到服务器 `127.0.0.1`，避免直接暴露公网
- 后端上传目录改成 Docker 命名卷 `backend_uploads`，发版更新时不会因为重建容器而丢文件

## 5. 初始化管理员

- 首次可以临时把 `ALLOW_PUBLIC_REGISTER=true`，注册一个 `admin` 角色账号后再改回 `false` 并重新执行更新脚本
- 或者直接进入数据库将指定用户 `role` 改为 `admin`

## 6. 验证项

- 前台访问：`http://服务器IP/`
- 后台登录页：`http://服务器IP/admin/login`
- API 示例：`http://服务器IP/api/programs`
- 管理 API 需携带 Bearer Token 且用户角色为 `admin`

## 7. HTTPS 建议

- 建议在 `gateway` 前再放一层 Nginx / Caddy，统一处理 Let's Encrypt 证书续期
- 完成 HTTPS 后，将 `CORS_ORIGIN` 改为正式 `https://` 域名
