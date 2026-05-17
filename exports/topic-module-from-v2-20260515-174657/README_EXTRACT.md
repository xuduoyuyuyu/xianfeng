# admin/topics 提取包（来源：xianfeng-v2）

## 来源
- `/Users/QUAN/Downloads/Project/xianfeng-v2`

## 提取时间
- 2026-05-15 17:46:57 (Asia/Shanghai)

## 包含文件
- frontend/src/pages/admin/AdminTopicsPage.tsx
- frontend/src/pages/TopicHubPage.tsx
- frontend/src/pages/TopicDetailPage.tsx
- frontend/src/components/GlobalPublicNav.tsx
- frontend/src/App.tsx
- backend/src/routes/topic.ts
- backend/src/models/Topic.ts
- backend/src/services/topicAiGenerator.ts
- docs/online-routes.md

## 关键挂载点
- 后台页：`/admin/topics` -> `AdminTopicsPage`
- 前台页：`/topics` -> `TopicHubPage`
- 详情页：`/topics/:slug` -> `TopicDetailPage`
- 后端接口前缀：`/api/admin/topic-hub`、`/api/topic-hub`

## 说明
- 这是“模块提取包”，用于对照与迁移，不是完整可直接启动工程。
