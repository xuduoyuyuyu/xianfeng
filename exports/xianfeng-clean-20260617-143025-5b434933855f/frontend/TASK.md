# xianfeng 前端实现任务

## 项目概况
这是"家长先疯"的前端项目（React + TypeScript + Vite + Tailwind CSS）。
后端 API 已经完整实现（Express + MongoDB），你需要实现完整的前端。

## 设计风格
参考播客详情页（public/screens/podcast-detail.html）的设计风格：
- 主色：#5e17eb（紫色）
- 字体：Noto Sans SC + Plus Jakarta Sans
- 图标：Material Symbols Outlined
- 圆角卡片、毛玻璃效果、渐变
- Tailwind CSS CDN + 自定义配置

## 三个页面

### 1. 播客首页 (/programs)
参考 public/screens/podcast-home.html 设计稿
- 顶部导航栏（推荐书单/播客节目/专家导览/成功案例 + 搜索 + 登录）
- Hero区域：标题"知识沉淀" + 描述
- 分类圆形图标筛选（全部/早期启蒙/情绪管理/升学路径/艺术素养/通识博雅/家庭关系）
- 节目卡片列表（封面图 + EPISODE编号 + 标题 + 描述 + 操作按钮）
- 右侧边栏（订阅区域）
- 底部Footer
- 点击节目卡片 → 跳转 /programs/:id

### 2. 播客详情页 (/programs/:id)
参考 public/screens/podcast-detail.html 设计稿
- Hero区域：节目封面 + 编号 + 标题 + 描述 + 播放/收藏按钮
- AI总结摘要区域
- 逐字稿区域（带时间戳的对话列表）
- 右侧边栏：嘉宾信息卡 + 深度挖掘（推荐阅读/相关内容推荐）
- 底部播放器栏（胶囊式毛玻璃播放器）
- Footer
- 相关内容可点击跳转

### 3. 资源管理页面 (/admin/programs)
参考 public/screens/资源管理页面/code.html 设计稿，作为管理后台
- 统计卡片（资源总数/关联总计/今日新增/健康度）
- 内容发布中心（拖拽上传区域 + 上传队列）
- 多维属性关联面板（标签/分类选择）
- 内容资源清单表格（名称/类型/标签/状态/日期/操作）
- 分页、筛选、状态切换（已发布/草稿）
- 新增资源按钮

### 管理后台还需要：
- /admin/books - 书单管理（同风格）
- /admin/materials - 学习资料管理（同风格）
- /admin/login - 管理员登录页
- 路由守卫：未登录跳转 /admin/login，非admin跳转首页

## 后端 API（已实现）

公开接口（无需鉴权）：
- GET /api/programs - 获取已发布节目列表
- GET /api/programs/:id - 获取单个已发布节目
- GET /api/books - 获取已发布书单列表
- GET /api/books/:id - 获取单个已发布书单
- GET /api/learning-materials - 获取已发布学习资料列表
- GET /api/learning-materials/:id - 获取单个已发布学习资料

管理员接口（需 Authorization: Bearer <token>，且 role=admin）：
- GET/POST /api/admin/programs - 列表/创建
- GET/PUT/DELETE /api/admin/programs/:id - 详情/更新/删除
- PATCH /api/admin/programs/:id/status - 上下架 { status: "draft"|"published" }
- GET/POST /api/admin/books - 列表/创建
- GET/PUT/DELETE /api/admin/books/:id - 详情/更新/删除
- PATCH /api/admin/books/:id/status - 上下架
- GET/POST /api/admin/learning-materials - 列表/创建
- GET/PUT/DELETE /api/admin/learning-materials/:id
- PATCH /api/admin/learning-materials/:id/status - 上下架

用户接口：
- POST /api/users/login - 登录 { username, password } → { token, user }
- GET /api/users/me - 获取当前用户（需鉴权）
- POST /api/users/register - 注册（需admin鉴权或ALLOW_PUBLIC_REGISTER=true）

## 数据模型

Program: { title, description, coverImage, episodes: [{title, duration, url}], status, publishedAt }
Book: { title, author, description, coverImage, category, status, publishedAt }
LearningMaterial: { title, description, fileUrl, category, status, publishedAt }
User: { username, password, role: "admin"|"user" }

## 技术要求
1. 使用 React + TypeScript + Tailwind CSS（已安装）
2. 使用 axios 调用 API（已安装）
3. 使用 @reduxjs/toolkit 管理状态（已安装）
4. 使用 react-router-dom v6 路由（已安装）
5. 不要使用 antd，全部用 Tailwind 手写样式
6. 所有页面都要真实对接后端 API
7. 页面间可以正常跳转
8. 管理后台 CRUD 功能完整（创建/编辑/删除/上下架）
9. 登录态通过 localStorage.token 存储
10. 保持设计稿的视觉风格（紫色体系、圆角卡片、Material图标）

## 文件结构建议
```
src/
├── App.tsx              # 路由配置
├── main.tsx             # 入口
├── styles.css           # 全局样式 + Tailwind
├── services/
│   └── api.ts           # axios 封装 + token 拦截器
├── store/
│   ├── index.ts         # Redux store
│   └── userSlice.ts     # 用户登录态
├── components/
│   ├── Layout.tsx       # 前台布局（导航+Footer）
│   ├── AdminLayout.tsx  # 后台布局（侧边栏+顶栏）
│   ├── AdminRoute.tsx   # 路由守卫
│   └── Navbar.tsx       # 导航栏
├── pages/
│   ├── HomePage.tsx     # 首页（重定向到 /programs）
│   ├── ProgramListPage.tsx    # 播客首页
│   ├── ProgramDetailPage.tsx  # 播客详情
│   ├── BookListPage.tsx       # 书单列表
│   ├── BookDetailPage.tsx     # 书单详情
│   ├── MaterialListPage.tsx   # 学习资料列表
│   └── admin/
│       ├── AdminLoginPage.tsx
│       ├── AdminDashboardPage.tsx
│       ├── AdminProgramsPage.tsx
│       ├── AdminBooksPage.tsx
│       └── AdminMaterialsPage.tsx
```

## 重要
- public/screens/ 下的 HTML 设计稿仅供参考样式，不要直接用 iframe 嵌入
- 所有内容必须写成 React 组件，真实调用 API
- 确保代码能通过 tsc 编译
- 完成后运行 npm run build 确保无报错

When completely finished, run this command to notify me:
openclaw system event --text "Done: xianfeng frontend fully implemented with all 3 pages + admin panel" --mode now
