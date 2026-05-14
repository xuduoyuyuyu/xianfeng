# Transcript Agent

AI 驱动的逐字稿处理工具，为先锋节目平台提供三大能力：

1. **速览总结** (`summary`) — 生成 headline + body
2. **文本校对** (`proofread`) — 纠正错别字/标点，返回 correctedTranscript
3. **词典提取** (`dictionary`) — 提取教育专属术语（term + definition）

## 快速开始

### 1. 安装依赖

```bash
cd tools/transcript-agent
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY 等
```

### 3. 运行

```bash
# 处理所有任务（summary + proofread + dictionary）
node index.mjs <节目ID>

# 只生成速览总结
node index.mjs <节目ID> --tasks summary

# 只校对
node index.mjs <节目ID> --tasks proofread

# 只提取词条
node index.mjs <节目ID> --tasks dictionary

# 组合任务
node index.mjs <节目ID> --tasks summary,dictionary

# DRY-RUN 模式 — 只读，不写回 API
node index.mjs <节目ID> --dry-run

# 自定义 API 地址和模型
node index.mjs <节目ID> --api-base http://localhost:3000/api --model deepseek-chat
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API 密钥 |
| `DEEPSEEK_BASE_URL` | - | API 地址，默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL_ID` | - | 模型名，默认 `deepseek-chat` |
| `XF_API_BASE` | - | 先锋节目 API 地址 |
| `XF_API_TOKEN` | ⚠️ | API 认证 Token（写回时需要） |

## DRY-RUN 模式

建议首次使用时先用 `--dry-run` 验证：

```bash
node index.mjs <节目ID> --dry-run
```

此模式下：
- ✅ 正常加载节目数据
- ✅ 正常调用 DeepSeek AI
- ❌ 不写回 API
- 📋 打印将要写入的 payload 摘要

## API 端点

脚本使用以下 API：

| 操作 | 方法 | 路径 |
|------|------|------|
| 加载节目 | GET | `/api/programs/:id` (公开) |
| 更新节目 | PUT | `/api/admin/programs/:id` (需 token) |
| 创建词典条目 | POST | `/api/admin/dictionary` (需 token) |

## 文件结构

```
tools/transcript-agent/
├── index.mjs       主入口
├── package.json    依赖
├── .env.example    环境变量示例
└── README.md       使用说明
```
