# Xianfeng 锁版与防回退流程

## 目标
- 锁定当前最终版（可追溯提交）
- 阻断历史垃圾进入部署链路
- 保证线上只从干净结构发布

## 一次性清理
1. 将 `backup-*`、`archives/`、`dist/`、`data/`、旧页面目录迁移到仓库外。
2. 确保这些目录不再被 git 跟踪（已由 `.gitignore` 保护）。

## 每次发布标准步骤
1. 在目标分支完成改动并提交。
2. 执行版本冻结：
   - `scripts/release/freeze-current.sh`
3. 执行部署（任一方式）：
   - 服务器内更新：`scripts/deploy/update-server.sh`
   - 本地直传部署：`scripts/deploy/deploy-direct-to-server.sh root@14.103.106.216 /opt/xianfeng main`

## 强制校验机制
部署脚本会先执行：`scripts/release/verify-clean-structure.sh`
- 若存在历史垃圾路径：阻断部署
- 若未锁定最终版（无 `.release/current.lock`）：阻断部署
- 若当前 HEAD 与锁定提交不一致：阻断部署

## 建议
- 只允许通过上述脚本部署，禁用手工 `docker compose up --build`。
- 每次上线后记录锁定提交（`COMMIT`）到变更单。
