# 妈妈好赚专属内容链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让运营可手动或通过 Excel 为妈妈好赚任务的不同账号配置专属飞书链接，并让登录用户在自己的任务详情中打开或复制链接。

**Architecture:** 专属链接属于 `MamaResourceTaskAssignment`，不进入公共任务模型；Excel 由管理员接口解析并在确认接口中按“任务 ID + 账号 ID”幂等 upsert。普通用户接口只序列化当前登录账号自己的分配链接，现有领取、提交、审核和结算流程保持不变。

**Tech Stack:** Express 5、Mongoose 9、MongoDB Memory Server、SheetJS `xlsx`、React 18、Axios、原生微信小程序。

## Global Constraints

- 本期只保存和下发飞书链接，不抓取正文、不转存图片、不接入飞书开放平台。
- 本期不实现短信通知、短信状态或下发批次。
- Excel 精确使用 `妈妈好赚账号ID` 匹配 `MamaResourceProfile._id`，不按名称或手机号猜测。
- 同一任务、同一账号只有一条分配记录；重复导入覆盖链接。
- 普通用户只能读取自己的专属链接。
- 不修改现有领取、证明提交、审核和结算语义。
- 保留工作区中与本计划无关的现有修改，不格式化或重构邻近代码。

---

## File Map

- `backend/src/models/MamaResourceTaskAssignment.ts`：保存专属链接及更新时间。
- `backend/src/routes/adminMamaResource.ts`：手动链接、Excel 模板、预检与确认接口。
- `backend/src/routes/mamaResource.ts`：把专属链接仅返回给当前登录用户。
- `backend/src/routes/mamaResource.test.ts`：链接权限、手动更新和导入行为测试。
- `backend/package.json`、`backend/pnpm-lock.yaml`：增加 `xlsx` 解析依赖。
- `frontend/src/services/api.ts`：新增字段、预检结果与管理员 API。
- `frontend/src/pages/admin/AdminMamaResourcesPage.tsx`：手动填写、模板下载、Excel 预检和配置进度 UI。
- `frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs`：管理员 UI 静态契约。
- `apps/wechat-miniprogram/pages/mama-resource-apply/index.js`：专属链接视图数据及打开/复制动作。
- `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml`：任务详情专属内容区。
- `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxss`：专属内容区样式。
- `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`：小程序链接入口与回退静态测试。
- `docs/modules/backend-api.md`、`docs/modules/platform-release-and-app-shells.md`、`docs/ACTIVE_CONTEXT.md`：持久行为与当前工作流快照。

### Task 1: 专属链接模型与用户数据隔离

**Files:**
- Modify: `backend/src/models/MamaResourceTaskAssignment.ts`
- Modify: `backend/src/routes/mamaResource.ts`
- Modify: `backend/src/routes/mamaResource.test.ts`

**Interfaces:**
- Produces: assignment fields `contentUrl?: string`, `contentUpdatedAt?: Date | null`.
- Produces: `publicTaskPayload()` includes those fields only on the existing authenticated owner path.

- [ ] **Step 1: Write the failing owner-isolation tests**

Create two approved profiles and assignments with different links. Authenticate as the first user and assert list/detail return only the first link:

```ts
assert.equal(data.tasks.length, 1);
assert.equal(data.tasks[0].contentUrl, "https://my.feishu.cn/wiki/owner-one");
assert.equal(data.tasks.some((item: any) => item.contentUrl?.includes("owner-two")), false);

const forbidden = await fetch(`${base}/api/mama-resources/me/tasks/${secondAssignment._id}`, {
  headers: { Authorization: `Bearer ${firstToken}` },
});
assert.equal(forbidden.status, 404);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd backend && node --test --import tsx src/routes/mamaResource.test.ts`

Expected: FAIL because `contentUrl` is absent from the schema/public payload.

- [ ] **Step 3: Add minimal model fields and owner serialization**

```ts
contentUrl?: string;
contentUpdatedAt?: Date | null;
```

```ts
contentUrl: { type: String, default: "", trim: true },
contentUpdatedAt: { type: Date, default: null },
```

In `publicTaskPayload` copy assignment-owned fields:

```ts
contentUrl: source.contentUrl || "",
contentUpdatedAt: source.contentUpdatedAt || null,
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `cd backend && node --test --import tsx src/routes/mamaResource.test.ts`

Expected: PASS, including the cross-user 404 assertion.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/MamaResourceTaskAssignment.ts backend/src/routes/mamaResource.ts backend/src/routes/mamaResource.test.ts
git commit -m "feat: expose private mama resource content links"
```

### Task 2: 手动填写与 Excel 预检/确认接口

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/pnpm-lock.yaml`
- Modify: `backend/src/routes/adminMamaResource.ts`
- Modify: `backend/src/routes/mamaResource.test.ts`

**Interfaces:**
- Consumes: assignment fields from Task 1.
- Produces: `PATCH /api/admin/mama-resources/tasks/assignments/:assignmentId/content` with `{ contentUrl }`.
- Produces: `GET /api/admin/mama-resources/tasks/content-import/template` returning a real `.xlsx`.
- Produces: `POST /api/admin/mama-resources/tasks/:taskId/content-import/preview` multipart field `file`.
- Produces: `POST /api/admin/mama-resources/tasks/:taskId/content-import/commit` with `{ rows: [{ profileId, contentUrl }] }`.
- Produces: preview row `{ rowNumber, profileId, displayName, contentUrl, action, valid, errors }`, where `action` is `create_assignment | update_link | unchanged`.

- [ ] **Step 1: Install the parser dependency**

Run: `cd backend && pnpm add xlsx`

Expected: only `xlsx` and its required lockfile entries are added.

- [ ] **Step 2: Write failing administrator route tests**

Cover real template download, valid manual save, non-HTTP rejection, duplicate spreadsheet ID, missing profile, unapproved profile, preview-without-write, commit-created assignment, commit-updated link and unchanged link:

```ts
assert.equal(preview.status, 200);
assert.equal(previewData.summary.valid, 2);
assert.equal(await MamaResourceTaskAssignment.countDocuments({ taskId }), 0);

assert.equal(commit.status, 200);
assert.deepEqual(commitData.summary, { created: 1, updated: 1, unchanged: 0 });
assert.equal(template.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
```

- [ ] **Step 3: Run tests and verify 404 failures**

Run: `cd backend && node --test --import tsx src/routes/mamaResource.test.ts`

Expected: FAIL because the new routes do not exist.

- [ ] **Step 4: Implement strict URL and XLSX helpers**

```ts
function normalizeContentUrl(value: unknown): string {
  const text = asText(value);
  if (!text) return "";
  const url = new URL(text);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("链接仅支持 HTTP(S)");
  return url.toString();
}
```

Accept one `.xlsx` in memory up to 5 MB. Parse the first worksheet with `XLSX.read(req.file.buffer)` and `XLSX.utils.sheet_to_json(..., { defval: "" })`. Generate the template with exact headers `妈妈好赚账号ID` and `专属内容链接`, XLSX MIME type and filename `mama-resource-content-import.xlsx`.

- [ ] **Step 5: Implement preview without database writes**

Load task, profiles and existing assignments in bounded queries. Return deterministic errors:

```ts
if (!mongoose.Types.ObjectId.isValid(profileId)) errors.push("账号ID格式错误");
if (duplicateIds.has(profileId)) errors.push("账号ID重复");
if (!profile) errors.push("账号不存在");
else if (profile.status !== "approved") errors.push("账号尚未通过审核");
if (!contentUrl) errors.push("专属内容链接为空");
```

- [ ] **Step 6: Implement manual save and commit revalidation**

Manual save updates the existing assignment. Commit revalidates every submitted row, creates missing assignment records for approved profiles, updates changed links, and leaves identical links untouched:

```ts
await MamaResourceTaskAssignment.updateOne(
  { taskId: task._id, profileId: profile._id },
  {
    $setOnInsert: { taskId: task._id, profileId: profile._id, status: "assigned" },
    $set: { contentUrl, contentUpdatedAt: now },
  },
  { upsert: true }
);
```

Return exact counts `{ created, updated, unchanged }`.

- [ ] **Step 7: Run tests and build**

Run: `cd backend && node --test --import tsx src/routes/mamaResource.test.ts`

Expected: PASS.

Run: `cd backend && pnpm build`

Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml backend/src/routes/adminMamaResource.ts backend/src/routes/mamaResource.test.ts
git commit -m "feat: import mama resource content links"
```

### Task 3: 管理后台录入与导入

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.tsx`
- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs`

**Interfaces:**
- Consumes: Task 2 endpoints.
- Produces: manual assignment editor, `.xlsx` template download, upload preview dialog and configuration progress.

- [ ] **Step 1: Write failing static UI contracts**

```js
assert.match(source, /专属内容链接/);
assert.match(source, /批量导入专属链接/);
assert.match(source, /已配置/);
assert.match(apiSource, /content-import\/preview/);
assert.match(apiSource, /content-import\/commit/);
```

- [ ] **Step 2: Run test and verify failure**

Run: `cd frontend && node --test src/pages/admin/AdminMamaResourcesPage.test.mjs`

Expected: FAIL on missing controls and API methods.

- [ ] **Step 3: Add types and API methods**

Extend task assignments with `contentUrl?: string` and `contentUpdatedAt?: string | null`, then add:

```ts
downloadMamaResourceContentTemplate()
previewMamaResourceContentImport(id: string, file: File)
commitMamaResourceContentImport(id: string, rows: MamaResourceContentImportCommitRow[])
updateMamaResourceAssignmentContent(id: string, contentUrl: string)
```

Use blob response for the template and multipart upload with a 60-second timeout for preview.

- [ ] **Step 4: Add manual editor and progress**

In each assigned-account card render a URL input and save button. Compute:

```ts
const configuredCount = assignments.filter((item) => Boolean(item.contentUrl)).length;
const contentProgressText = `已配置 ${configuredCount}/${assignments.length}`;
```

After save, reload the task workspace so displayed state is server truth.

- [ ] **Step 5: Add two-stage import dialog**

Download the backend-generated file as `mama-resource-content-import.xlsx`. Upload `.xlsx`, display summary and row-level errors/actions, disable confirm when there are no valid rows, commit only normalized valid rows returned by preview, then reload assignments.

- [ ] **Step 6: Run test and build**

Run: `cd frontend && node --test src/pages/admin/AdminMamaResourcesPage.test.mjs`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: Tailwind, TypeScript and Vite exit 0.

- [ ] **Step 7: Browser verification**

On `/admin/mama-resources`, verify configuration progress, manual save/reload, real template download, mixed valid/invalid preview, confirmed import and refreshed assignments.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/pages/admin/AdminMamaResourcesPage.tsx frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs
git commit -m "feat: manage mama resource content links"
```

### Task 4: 小程序专属内容入口与复制回退

**Files:**
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.js`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

**Interfaces:**
- Consumes: authenticated `contentUrl` from Task 1.
- Produces: task badge “专属内容已下发”, actions `openMamaTaskContent` and `copyMamaTaskContentUrl`.

- [ ] **Step 1: Write failing static tests**

```js
assert.match(jsSource, /contentUrl: asText\(source\.contentUrl\)/);
assert.match(wxmlSource, /专属内容已下发/);
assert.match(wxmlSource, /打开专属发布内容/);
assert.match(jsSource, /openMamaTaskContent/);
assert.match(jsSource, /wx\.setClipboardData/);
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

Expected: FAIL on missing content actions.

- [ ] **Step 3: Map and render only real content**

```js
contentUrl: asText(source.contentUrl).trim(),
hasContentUrl: Boolean(asText(source.contentUrl).trim()),
contentUpdatedAt: asText(source.contentUpdatedAt).trim(),
```

Show the badge and detail card only when `hasContentUrl`; do not invent fallback content.

- [ ] **Step 4: Implement open and clipboard fallback**

Follow the existing `pages/webview/index` parameter contract rather than creating a new page. The action must preserve the exact URL and copy it if navigation fails:

```js
openMamaTaskContent() {
  const url = asText(this.data.currentMamaTask && this.data.currentMamaTask.contentUrl).trim();
  if (!url) return;
  wx.navigateTo({
    url: `/pages/webview/index?url=${encodeURIComponent(url)}`,
    fail: () => this.copyMamaTaskContentUrl(),
  });
},

copyMamaTaskContentUrl() {
  const url = asText(this.data.currentMamaTask && this.data.currentMamaTask.contentUrl).trim();
  if (!url) return;
  wx.setClipboardData({ data: url });
},
```

- [ ] **Step 5: Run static and syntax checks**

Run: `node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

Expected: PASS.

Run: `node --check apps/wechat-miniprogram/pages/mama-resource-apply/index.js`

Expected: exits 0.

- [ ] **Step 6: Verify the exact WeChat route**

Compile and open `pages/mama-resource-apply/index` using an account with a real assigned link. Verify task badge, detail link, return flow, proof form preservation and clipboard fallback in Developer Tools, then verify external-domain behavior on a real device.

- [ ] **Step 7: Commit**

```bash
git add apps/wechat-miniprogram/pages/mama-resource-apply/index.js apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml apps/wechat-miniprogram/pages/mama-resource-apply/index.wxss apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs
git commit -m "feat: show mama resource personal content links"
```

### Task 5: 文档与全量回归

**Files:**
- Modify: `docs/modules/backend-api.md`
- Modify: `docs/modules/platform-release-and-app-shells.md`
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: documented ownership and verified completion evidence.

- [ ] **Step 1: Update module boundaries and active context**

Document that common task content stays on `MamaResourceTask`, per-user links belong to `MamaResourceTaskAssignment`, public routes expose only the current profile's assignment, and this version has no SMS notification.

- [ ] **Step 2: Run the proportional regression suite**

```bash
cd backend && node --test --import tsx src/routes/mamaResource.test.ts
cd backend && pnpm build
cd frontend && node --test src/pages/admin/AdminMamaResourcesPage.test.mjs
cd frontend && npm run build
node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs
node --check apps/wechat-miniprogram/pages/mama-resource-apply/index.js
git diff --check
```

Expected: every command exits 0. Record exact unrelated pre-existing failures instead of claiming a full pass.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/modules/backend-api.md docs/modules/platform-release-and-app-shells.md docs/ACTIVE_CONTEXT.md
git commit -m "docs: record mama resource content links"
```

- [ ] **Step 4: Completion report**

Report what changed, commands actually run, what was not verified, and remaining assumptions about Feishu sharing and real-device WebView behavior.
