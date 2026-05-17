# xianfeng - 线上页面路由全景

> 来源：从线上直接访问 + 浏览器截图
> 线上版本：`index-BkCrH4yI.js` / `index-BMDBUCbC.css`
> 截图目录：`screenshots/`
> 整理时间：2026-05-15 15:20 GMT+8

---

## 一、全局导航栏 (GlobalPublicNav)

所有前台公共页面共享此导航栏，7 个入口：

| # | 图标 | 导航文案 | 路由 | 说明 |
|---|------|---------|------|------|
| 1 | podcasts | 节目列表 | `/programs` | 完整节目索引 |
| 2 | person | 先疯智库 | `/experts` | 嘉宾档案库 |
| 3 | 及阅(图片) | 及阅 | `/reading` | 书单阅读 |
| 4 | inventory_2 | 学习资料 | `/materials` | 资料模板库 |
| 5 | route | 教育规划 | `/planning` | 教育规划(wel) |
| 6 | 🙏 | 请教一下 | `/topics` | AI 话题广场 |
| 7 | verified | 知物 | `/worthbuy` | 商品分析 |

右侧：搜索框 + AI 在线 + 登录/注册

---

## 二、前台页面（Public Pages）

### 一级页面

| # | 路由 | 页面标题 | 组件 | 截图 |
|---|------|---------|------|------|
| 1 | `/` | 为孩子发声，替家长发疯 | LandingPage | ![](screenshots/page-home.png) |
| 2 | `/programs` | 完整节目索引 | ProgramListPage | ![](screenshots/page-programs.png) |
| 3 | `/experts` | 先疯智库 | ExpertsPage | ![](screenshots/page-experts.png) |
| 4 | `/reading` | 及阅（推荐书单） | BooksPage | ![](screenshots/page-reading.png) |
| 5 | `/materials` | 学习资料 | MaterialsPage | ![](screenshots/page-materials.png) |
| 6 | `/topics` | 🙏 请教一下 | TopicHubPage | ![](screenshots/page-topics.png) |
| 7 | `/worthbuy` | 知物 | WorthBuyPage | ![](screenshots/page-worthbuy.png) |
| 8 | `/planning` | 教育规划 | PlanningPage (wel) | ![](screenshots/page-planning.png) |

### 二级页面（详情页）

| # | 路由模式 | 页面标题 | 组件 | 截图 |
|---|---------|---------|------|------|
| 9 | `/experts/:id` | 嘉宾详情 | ExpertDetailPage | ![](screenshots/page-expert-detail.png) |
| 10 | `/topics/:slug` | 话题知识树 | TopicDetailPage | ![](screenshots/page-topic-detail.png) |
| 11 | `/worthbuy/:brand` | 商品分析详情 | WorthBuyDetailPage | ![](screenshots/page-worthbuy-detail.png) |
| 12 | `/programs/:id` | 节目详情 | ScreenPage (wel) | *(wel iframe)* |

### 兼容路由

| 路由 | 实际渲染 | 说明 |
|------|---------|------|
| `/books` | BooksPage | 及阅兼容旧路径 |
| `/programs/list` | → `/programs` | 重定向 |

---

## 三、后台页面（Admin Pages）

所有后台路由路径前缀 `/admin/`，受 RequireAdmin 保护。

| # | 路径 | 页面 | 组件 |
|---|------|------|------|
| 1 | `/admin/login` | 后台登录 | AdminLoginPage |
| 2 | `/admin` | 管理仪表盘 | AdminDashboardPage |
| 3 | `/admin/programs` | 节目管理 | AdminProgramsPage |
| 4 | `/admin/books` | 及阅管理 | AdminBooksPage |
| 5 | `/admin/materials` | 资料管理 | AdminMaterialsPage |
| 6 | `/admin/dictionary` | 词典管理 | AdminDictionaryPage |
| 7 | `/admin/guests` | 嘉宾管理 | AdminGuestsPage |
| 8 | `/admin/users` | 用户管理 | AdminUsersPage |
| 9 | `/admin/user-portrait` | 用户画像 | AdminUserPortraitPage |
| 10 | `/admin/system` | 系统管理 | AdminSystemPage |
| 11 | `/admin/agents` | 智能体管理 | AdminAgentsPage |
| 12 | `/admin/agents/:botId/chat` | 智能体对话 | AdminAgentsChatPage |
| 13 | `/admin/multi-agents` | 多智能体 | AdminMultiAgentsPage |
| 14 | `/admin/topics` | 话题管理 | AdminTopicsPage |
| 15 | `/admin/inbox` | 消息盒子 | AdminInboxPage |
| 16 | `/admin/worthbuy` | 知物管理 | AdminWorthBuyPage |

---

## 四、Wel iframe 嵌入页面

| wel URL | 作用 | 对应路由 |
|---------|------|---------|
| `/wel/index.html?page=61` | 播客列表 | `/programs` |
| `/wel/index.html?page=podcast-detail&programId=xxx` | 节目详情 | `/programs/:id` |
| `/wel/Planning/教育规划首页.html` | 教育规划 | `/planning` |
| `/wel/Planning/教育规划.html` | 教育规划详情 | 规划内跳转 |

---

## 五、开发对应的本地文件路径

仅记录源码文件，不修改代码。

```
frontend/src/
├── pages/
│   ├── LandingPage.tsx          ← /
│   ├── ProgramListPage.tsx      ← /programs
│   ├── ProgramDetailPage.tsx    ← /programs/:id (wel iframe)
│   ├── ScreenPage.tsx           ← wel 容器
│   ├── ExpertsPage.tsx          ← /experts
│   ├── ExpertDetailPage.tsx     ← /experts/:id
│   ├── BooksPage.tsx            ← /reading, /books
│   ├── MaterialsPage.tsx        ← /materials
│   ├── TopicHubPage.tsx         ← /topics
│   ├── TopicDetailPage.tsx      ← /topics/:slug
│   ├── WorthBuyPage.tsx         ← /worthbuy
│   ├── WorthBuyDetailPage.tsx   ← /worthbuy/:brand
│   ├── PlanningPage.tsx         ← /planning
│   ├── UserLoginPage.tsx        ← /login
│   │
│   └── admin/
│       ├── AdminLoginPage.tsx
│       ├── AdminDashboardPage.tsx
│       ├── AdminProgramsPage.tsx
│       ├── AdminBooksPage.tsx
│       ├── AdminMaterialsPage.tsx
│       ├── AdminDictionaryPage.tsx
│       ├── AdminGuestsPage.tsx
│       ├── AdminUsersPage.tsx
│       ├── AdminUserPortraitPage.tsx
│       ├── AdminSystemPage.tsx
│       ├── AdminAgentsPage.tsx
│       ├── AdminAgentsChatPage.tsx
│       ├── AdminMultiAgentsPage.tsx
│       ├── AdminTopicsPage.tsx
│       ├── AdminInboxPage.tsx
│       ├── AdminWorthBuyPage.tsx
│       └── AdminShellPage.tsx
│
├── components/
│   ├── GlobalPublicNav.tsx      ← 7入口导航栏
│   ├── AdminLayout.tsx          ← 后台布局
│   ├── RequireAdmin.tsx         ← 鉴权守卫
│   ├── AdminRoute.tsx
│   ├── Layout.tsx
│   ├── Navbar.tsx
│   └── PageViewTracker.tsx
│
└── App.tsx                      ← 路由分发 (PublicScreenRouter + Routes)
```

---

## 六、关键注意事项

1. **导航栏 7 个入口**：及阅（`/reading`）+ 请教一下（`/topics`）+ 知物（`/worthbuy`）都在 GlobalPublicNav 的 showBooksEntry / showPlanningEntry 等 props 控制
2. **及阅双路径**：`/reading` 和 `/books` 都渲染 BooksPage，导航 link 用 `/reading`，检测用 `startsWith("/books") || startsWith("/reading")`
3. **播客列表**：`/programs/list` 被重定向到 `/programs`
4. **话题详情**：懒加载 TopicDetailPage，code-split
5. **知物**：前后台都有独立页面
