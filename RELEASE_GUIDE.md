# 🚀 家长先疯（xianfeng）发版流程

## 项目信息

| 项目 | 值 |
|------|-----|
| 本地路径 | `/Volumes/家长先疯/xianfeng` |
| 服务器 | `root@14.103.106.216` |
| 服务器路径 | `/opt/xianfeng` |
| 域名 | https://xianfeng.xinzhi.info |
| 分支 | `main` |

---

## 📋 标准发版四步走

### Step 1 — 提交代码

```bash
cd "/Volumes/家长先疯/xianfeng"
git add -A
git commit -m "feat: xxx"
```

### Step 2 — 版本冻结

如果这次发布包含小程序 web-view / 移动端导航改动，先执行：

```bash
bash scripts/release/verify-mini-webview-ready.sh
```

这个检查会跑相关静态测试、前端构建，并确认 `frontend/dist` 已包含小程序 web-view 兼容层。

```bash
bash scripts/release/freeze-current.sh
```

会记录当前 commit 到 `.release/current.lock`，后续部署会验证版本锁一致。

### Step 3 — 推送到 GitHub

```bash
git push origin main
```

### Step 4 — 部署到服务器

**方式 A：直连 rsync（推荐，支持增量同步有断点续传）**

```bash
rsync -azP --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "backend/node_modules" \
  --exclude "frontend/node_modules" \
  --exclude "backend/uploads/" \
  --exclude "backend/secrets/" \
  --exclude ".env" \
  --exclude ".env.production" \
  --exclude "backend/.env" \
  --exclude "releases/" \
  --exclude "exports/" \
  "/Volumes/家长先疯/xianfeng/" root@14.103.106.216:/opt/xianfeng/

ssh root@14.103.106.216 \
  "cd /opt/xianfeng && docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans"

ssh root@14.103.106.216 "docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

**方式 B：git archive（不依赖 rsync，通过 git 打包传输）**

```bash
git archive --format=tar HEAD | \
  ssh root@14.103.106.216 "cd /opt/xianfeng && tar -xf - && docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans"
```

### Step 5 — 小程序 web-view 兼容验收

如果这次发布包含小程序壳层或移动网页导航样式改动，部署后执行：

```bash
bash scripts/release/verify-mini-webview-live.sh
```

通过后再用微信开发者工具或手机预览确认：网页自己的移动底部菜单不显示，底部只保留小程序原生 tabBar。

### Step 6 — 上传微信小程序

如果这次包含小程序原生页、分享页或小程序码能力，使用上传包装脚本。脚本会先执行
`verify-mini-webview-ready.sh`，确认 `pages/share/index`、小程序分享工具和后端
`/api/wechat-mini/*qrcode` 契约测试通过后，再调用微信开发者工具上传。

```bash
VERSION=$(git rev-parse --short HEAD) \
DESC="小玩子分享页和小程序码" \
bash scripts/release/upload-wechat-miniprogram.sh
```

---

## ⚠️ 关键注意事项

### 1. 不要用 `rsync --delete` 覆盖 uploads

`.gitignore` 把 `backend/uploads/` 排除了（不上传 Git），但 **服务器上 uploads 目录里存着用户上传的封面、音频、头像等文件**。rsync `--delete` 会把服务器上有而本地没有的 uploads 文件全部删除！

必须加 `--exclude "backend/uploads/"`。

### 2. `.env.production` 不能丢

本地 `.env.production` 被 `.gitignore` 排除（保护密钥），rsync 不会同步它。但 `--delete` 会**删掉服务器上的 `.env.production`**。

必须加 `--exclude ".env"`、`--exclude ".env.production"`、`--exclude "backend/.env"`。

### 3. `backend/secrets/` 敏感目录

微信支付证书存在这里，也被 gitignore 排除了。rsync 时也要排除：`--exclude "backend/secrets/"`。

### 4. SSH 免密登录前置条件

本机公钥必须在服务器的 `~/.ssh/authorized_keys` 里。如果换了电脑或 key，需要重新添加：

```bash
# 在服务器上执行
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIAikYp/vnt2pjgCoec/TJYG+btDRklACFFJyZ9lEbFz xuduoyu@QUANs-MacBook-Pro.local' >> ~/.ssh/authorized_keys
```

### 5. 版本冻结必须和部署版本一致

`verify-clean-structure.sh` 会检查：
- `.release/current.lock` 记录的 commit 是否等于当前 HEAD
- 是否有历史垃圾目录残留

不一致会阻断部署。

### 6. Apple Double 文件噪音

外置磁盘（exFAT）会产生 `._*` Apple Double 文件，git 操作时会报 `non-monotonic index` 错误，不影响实际功能，可以忽略。

---

## 📊 容器结构

| 容器 | 作用 |
|------|------|
| `xianfeng_gateway` | Nginx 入口代理（80/443 + `/api` 转发） |
| `xianfeng_frontend` | React 静态站点 |
| `xianfeng_backend` | Express API（端口 3001） |
| `xianfeng_mongo` | MongoDB |

---

## 🆘 应急恢复

### `.env.production` 丢失

从正在运行的容器里捞环境变量：

```bash
ssh root@14.103.106.216 "docker inspect xianfeng_backend --format '{{range .Config.Env}}{{println .}}{{end}}'"
```

然后将输出写入 `/opt/xianfeng/.env.production`。

### uploads 文件丢失

只能通过备份恢复，或重新在后台管理界面上传。

---

## 📁 发版脚本说明

| 脚本 | 作用 |
|------|------|
| `scripts/release/freeze-current.sh` | 版本冻结，记录当前 commit |
| `scripts/release/verify-clean-structure.sh` | 部署前结构校验 |
| `scripts/release/verify-mini-webview-build.mjs` | 检查网页构建是否包含小程序 web-view 兼容层 |
| `scripts/release/verify-mini-webview-ready.sh` | 小程序 web-view / 移动导航 / 分享页和小程序码改动的部署前综合检查 |
| `scripts/release/verify-mini-webview-live.sh` | 检查线上首页是否已发布小程序 web-view 兼容层 |
| `scripts/release/upload-wechat-miniprogram.sh` | 上传微信小程序前先跑发布检查，再调用微信开发者工具上传 |
| `scripts/deploy/deploy-direct-to-server.sh` | 直连 git archive 部署 |
| `scripts/deploy/update-server.sh` | 服务器端 git pull + docker 重启 |
| `scripts/deploy/bootstrap-server.sh` | 服务器首次初始化 |
| `scripts/local/up.sh` | 本地 docker compose 启动 |
| `scripts/local/down.sh` | 本地 docker compose 停止 |
| `scripts/local/ps.sh` | 本地容器状态查看 |
