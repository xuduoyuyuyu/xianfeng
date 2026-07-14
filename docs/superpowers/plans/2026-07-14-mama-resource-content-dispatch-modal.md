# 妈妈好赚内容下发弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将管理员端当前任务的账号筛选和专属链接管理放入独立的大尺寸“内容下发”弹窗，并移除弹窗内的任务看板与“上架新任务”入口。

**Architecture:** 保留 `AdminMamaResourcesPageContent` 现有状态、`openTaskManager` / `loadTaskWorkspace` 数据流和所有 API，只收窄任务工作区的入口文案与 JSX 结构。任务创建和编辑继续由主页面及 `taskCreateOpen` 弹窗负责，不新增组件、接口或状态层。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Node.js built-in test runner、Vite

## Global Constraints

- 弹窗只服务当前任务的账号筛选、账号分配和专属内容链接管理。
- 不修改后端接口、任务模型、分配规则、链接校验规则或短信语义。
- 不修改账号审核页、任务创建字段或任务编辑流程。
- 不新增兜底文案、模拟数据、依赖或通用抽象。
- 保留现有账号加载、空状态、保存、导入及错误反馈行为。

---

## File Map

- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs` — 定义“内容下发”入口、独立弹窗范围与保留能力的静态契约。
- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.tsx` — 调整任务卡动作、弹窗标题、宽度和布局，移除弹窗内任务看板。
- Reference: `docs/superpowers/specs/2026-07-14-mama-resource-content-dispatch-modal-design.md` — 已确认的产品范围与验收标准。

### Task 1: 独立内容下发弹窗

**Files:**
- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs:69-146`
- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.tsx:748-764`
- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.tsx:918-1065`
- Test: `frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs`

**Interfaces:**
- Consumes: 现有 `openTaskManager(task?: MamaResourceTask)`、`closeTaskManager()`、`loadTaskWorkspace(taskId: string)`、`selectedTask`、`candidates`、`assignments` 和内容链接导入/保存处理器。
- Produces: 任务卡“内容下发”入口，以及 `aria-label="当前任务内容下发"` 的独立大尺寸弹窗；不新增导出函数或 API。

- [ ] **Step 1: 写入会在旧实现上失败的静态契约**

在 `AdminMamaResourcesPage.test.mjs` 中保留任务创建、编辑和 API 断言，将任务工作区的旧文案断言替换为以下独立测试：

```js
test("admin task content dispatch opens a current-task-only wide modal", () => {
  assert.match(source, />内容下发<\/span>/);
  assert.match(source, /aria-label="当前任务内容下发"/);
  assert.match(source, /max-w-\[min\(96vw,1440px\)\]/);
  assert.match(source, /当前任务的账号筛选、分配和专属内容链接/);
  assert.match(source, /按标签筛选/);
  assert.match(source, /定向选择账号/);
  assert.match(source, /已分配账号/);

  const modalStart = source.indexOf('aria-label="当前任务内容下发"');
  const modalEnd = source.indexOf("{contentImportOpen && contentImportPreview", modalStart);
  const modalSource = source.slice(modalStart, modalEnd);

  assert.doesNotMatch(modalSource, /上架新任务/);
  assert.doesNotMatch(modalSource, /已上架任务/);
  assert.doesNotMatch(modalSource, /openTaskCreate/);
  assert.doesNotMatch(modalSource, /openTaskEdit/);
});
```

现有 `admin mama resources page supports task shelving and account selection inside the task` 测试中：

```js
assert.match(source, /任务上架\/选号/);
assert.match(source, /内容下发/);
assert.match(source, /上架新任务/);
assert.match(source, /创建新任务/);
```

删除只要求旧混合弹窗存在的断言：

```js
assert.match(source, /任务上架和账号选号/);
assert.match(source, /账号选号/);
```

- [ ] **Step 2: 运行目标测试并确认 RED**

Run:

```bash
cd frontend
node --test src/pages/admin/AdminMamaResourcesPage.test.mjs
```

Expected: FAIL；失败信息至少包含缺少 `aria-label="当前任务内容下发"` 或缺少 `max-w-[min(96vw,1440px)]`，证明测试正在约束旧混合弹窗。

- [ ] **Step 3: 将任务卡动作改为内容下发**

在任务列表卡片末尾保留现有 `onClick={() => openTaskManager(task)}`，仅将可见动作改为：

```tsx
<span className="rounded-lg bg-[#f6f0ff] px-3 py-1.5 text-xs font-black text-[#5e17eb]">内容下发</span>
```

顶部“任务上架/选号”按钮和主页面“上架新任务”入口保持不变，因为它们仍承担任务管理入口。

- [ ] **Step 4: 收窄弹窗标题和容器**

将任务工作区弹窗外壳改为：

```tsx
<aside
  role="dialog"
  aria-modal="true"
  aria-label="当前任务内容下发"
  className="mx-auto my-6 max-w-[min(96vw,1440px)] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
  onClick={(event) => event.stopPropagation()}
>
  <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-100 bg-white px-5 py-4">
    <div>
      <div className="text-xs font-black text-stone-400">内容下发</div>
      <h2 className="mt-1 text-xl font-black text-stone-900">{selectedTask?.title || "当前任务"}</h2>
      <div className="mt-1 text-sm font-semibold text-stone-500">管理当前任务的账号筛选、分配和专属内容链接。</div>
    </div>
    <button type="button" onClick={closeTaskManager} disabled={taskLoading} className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50">关闭</button>
  </div>
```

- [ ] **Step 5: 删除弹窗内任务看板并放大双栏工作区**

删除任务工作区内部以下整段结构：

```tsx
<div className="space-y-3">
  <button type="button" onClick={openTaskCreate}>上架新任务</button>
  <div>已上架任务 ... openTaskEdit ...</div>
</div>
```

将其外层布局：

```tsx
<div className="grid gap-4 p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
  {/* task rail */}
  <div className="space-y-4">
    {/* filter and account columns */}
  </div>
</div>
```

替换为单一内容容器，并将右栏从固定 `360px` 放大为可伸缩列：

```tsx
<div className="space-y-4 p-5">
  {/* existing filter block unchanged */}
  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
    {/* existing candidate block unchanged */}
    {/* existing assignment block unchanged */}
  </div>
</div>
```

候选账号、已分配账号、链接保存、模板下载、Excel 导入、转账截图和审核动作的 JSX 及处理器保持原样。

- [ ] **Step 6: 运行目标测试并确认 GREEN**

Run:

```bash
cd frontend
node --test src/pages/admin/AdminMamaResourcesPage.test.mjs
```

Expected: PASS；该文件全部测试通过，无错误堆栈。

- [ ] **Step 7: 运行前端构建**

Run:

```bash
cd frontend
npm run build
```

Expected: exit code 0，Vite 构建完成；若仓库已有体积提示，只记录，不为本任务修改打包配置。

- [ ] **Step 8: 浏览器验证真实页面**

启动仓库既有本地前端，登录管理员页面 `/admin/mama-resources`，打开一条任务的“内容下发”，逐项确认：

1. 弹窗宽度接近视口且不被左侧任务栏占用。
2. 标题显示“内容下发”和被点击任务的真实标题。
3. 页面只出现筛选、定向选择账号、已分配账号及其既有操作。
4. 弹窗内没有“上架新任务”“已上架任务”或任务编辑按钮。
5. 关闭弹窗后仍停留在任务列表；主页面任务创建和编辑入口仍可见。

保存一张桌面宽度截图作为本次视觉验证证据。

- [ ] **Step 9: 检查改动范围并提交**

Run:

```bash
git diff --check -- frontend/src/pages/admin/AdminMamaResourcesPage.tsx frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs
git diff -- frontend/src/pages/admin/AdminMamaResourcesPage.tsx frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs
```

Expected: `git diff --check` 无输出；diff 只包含入口文案、弹窗静态契约、标题、宽度和布局调整。

Commit:

```bash
git add frontend/src/pages/admin/AdminMamaResourcesPage.tsx frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs
git commit -m "feat(admin): focus content dispatch modal"
```
