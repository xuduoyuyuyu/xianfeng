# Mama Resource Transfer Screenshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow operators to attach one replaceable transfer screenshot to each Mama Resource task assignment and let only that assignment's user view it on mobile Web and the native mini program.

**Architecture:** Store the screenshot URL and update time on `MamaResourceTaskAssignment`. Add an admin-only assignment patch endpoint, reuse the existing admin image uploader, serialize the fields through existing owner-scoped user task APIs, and render a read-only credential block only when a screenshot exists.

**Tech Stack:** Express, Mongoose, Node test runner with `tsx`, React/Vite/TypeScript, WeChat mini-program JavaScript/WXML, static contract tests.

## Global Constraints

- One current screenshot per assignment; a new upload replaces it.
- Operators upload or replace screenshots; users have read-only access.
- Saving a screenshot must not change assignment status.
- Historical assignments without the fields remain valid and render no placeholder.
- Do not add amount, transaction number, payment status, screenshot history, or user receipt confirmation.
- Do not modify claim, proof submission, collection, rejection, or personal-content-link behavior.

---

### Task 1: Assignment persistence and owner-scoped API contract

**Files:**
- Modify: `backend/src/models/MamaResourceTaskAssignment.ts`
- Modify: `backend/src/routes/mamaResource.ts`
- Modify: `backend/src/routes/adminMamaResource.ts`
- Test: `backend/src/routes/mamaResource.test.ts`

**Interfaces:**
- Produces model fields: `transferScreenshotUrl?: string` and `transferScreenshotUpdatedAt?: Date | null`.
- Produces admin endpoint: `PATCH /api/admin/mama-resources/tasks/assignments/:assignmentId/transfer-screenshot` with `{ transferScreenshotUrl: string }`.
- Produces serialized assignment properties consumed by Web and mini-program clients.

- [ ] **Step 1: Write failing route tests**

Add a route test that creates an assignment, patches its screenshot as an admin, asserts that status is unchanged, then fetches `/api/mama-resources/me/tasks/:taskId` as the owner and verifies both fields. Also create another profile/user and assert that the same assignment ID returns 404 through the owner-scoped user route.

```ts
const response = await adminRequest
  .patch(`/api/admin/mama-resources/tasks/assignments/${assignment._id}/transfer-screenshot`)
  .send({ transferScreenshotUrl: "/uploads/images/transfer.png" });
assert.equal(response.status, 200);
assert.equal(response.body.assignment.status, "collected");
assert.equal(response.body.assignment.transferScreenshotUrl, "/uploads/images/transfer.png");
assert.ok(response.body.assignment.transferScreenshotUpdatedAt);
```

- [ ] **Step 2: Run the targeted backend test and verify failure**

Run from `backend/`:

```bash
node --test --import tsx src/routes/mamaResource.test.ts
```

Expected: FAIL because the endpoint and assignment properties do not exist.

- [ ] **Step 3: Add model fields and serialization**

Add optional-compatible schema fields:

```ts
transferScreenshotUrl: { type: String, default: "", trim: true },
transferScreenshotUpdatedAt: { type: Date, default: null },
```

Include the properties in the existing assignment/public-task serializer:

```ts
transferScreenshotUrl: asText(source.transferScreenshotUrl),
transferScreenshotUpdatedAt: source.transferScreenshotUpdatedAt || null,
```

- [ ] **Step 4: Add the admin-only update endpoint**

Validate a non-empty string, update only the two transfer screenshot fields, keep `runValidators: true`, populate the same references as assignment list responses, and return 404 for a missing assignment.

```ts
router.patch("/tasks/assignments/:assignmentId/transfer-screenshot", async (req, res) => {
  const transferScreenshotUrl = asText(req.body?.transferScreenshotUrl);
  if (!transferScreenshotUrl) return res.status(400).json({ message: "请上传转账截图" });
  const assignment = await MamaResourceTaskAssignment.findOneAndUpdate(
    idQuery(asText(req.params.assignmentId)),
    { transferScreenshotUrl, transferScreenshotUpdatedAt: new Date() },
    { returnDocument: "after", runValidators: true }
  ).populate("taskId").populate("profileId");
  if (!assignment) return res.status(404).json({ message: "任务账号不存在" });
  res.json({ assignment: serializeAssignment(assignment) });
});
```

- [ ] **Step 5: Run backend tests and commit**

Run the command from Step 2. Expected: all tests pass.

```bash
git add backend/src/models/MamaResourceTaskAssignment.ts backend/src/routes/mamaResource.ts backend/src/routes/adminMamaResource.ts backend/src/routes/mamaResource.test.ts
git commit -m "feat(backend): store task transfer screenshots"
```

### Task 2: Admin upload, preview, and replacement

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/pages/admin/AdminMamaResourcesPage.tsx`
- Test: `frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs`

**Interfaces:**
- Consumes: admin transfer screenshot endpoint from Task 1 and existing `adminApi.uploadAdminImage(file)`.
- Produces: `adminApi.updateMamaResourceAssignmentTransferScreenshot(id, transferScreenshotUrl)` and assignment type fields used by all clients.

- [ ] **Step 1: Write failing static contract tests**

Assert that `MamaResourceTaskAssignment` includes both new fields, the API method calls the exact admin endpoint, the page tracks the uploading assignment ID, uses `uploadAdminImage`, shows upload/replace copy, and updates only the matching assignment in state.

```js
assert.match(apiSource, /transferScreenshotUrl\?: string;/);
assert.match(apiSource, /transferScreenshotUpdatedAt\?: string \| null;/);
assert.match(source, /uploadAdminImage/);
assert.match(source, /上传转账截图/);
assert.match(source, /替换截图/);
```

- [ ] **Step 2: Run the admin page test and verify failure**

```bash
node --test frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs
```

Expected: FAIL on the missing type, method, and UI.

- [ ] **Step 3: Add API types and method**

```ts
transferScreenshotUrl?: string;
transferScreenshotUpdatedAt?: string | null;

updateMamaResourceAssignmentTransferScreenshot: (id: string, transferScreenshotUrl: string) =>
  api.patch<{ assignment: MamaResourceTaskAssignment }>(
    `/admin/mama-resources/tasks/assignments/${id}/transfer-screenshot`,
    { transferScreenshotUrl }
  ),
```

- [ ] **Step 4: Implement assignment-scoped upload UI**

Add `transferScreenshotUploadingId`. On file selection upload through `adminApi.uploadAdminImage`, save the returned URL through the new API method, then replace only the matching assignment in `assignments`. Render the current image, update time, and an upload/replace file control. Preserve the old assignment when either request fails and show the existing toast error surface.

```tsx
const handleTransferScreenshotUpload = async (assignmentId: string, file?: File) => {
  if (!file || transferScreenshotUploadingId) return;
  setTransferScreenshotUploadingId(assignmentId);
  try {
    const uploadResponse = await adminApi.uploadAdminImage(file);
    const transferScreenshotUrl = uploadResponse.data.url;
    if (!transferScreenshotUrl) throw new Error("转账截图上传失败");
    const response = await adminApi.updateMamaResourceAssignmentTransferScreenshot(
      assignmentId,
      transferScreenshotUrl
    );
    setAssignments((current) => current.map((item) =>
      item._id === assignmentId ? response.data.assignment : item
    ));
  } catch (uploadError: any) {
    setToast(requestErrorMessage(uploadError, "转账截图上传失败"));
  } finally {
    setTransferScreenshotUploadingId("");
  }
};
```

- [ ] **Step 5: Run admin test and frontend build, then commit**

```bash
node --test frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs
cd frontend && npm run build
```

Expected: test passes and Vite build succeeds; the existing large-chunk warning is allowed.

```bash
git add frontend/src/services/api.ts frontend/src/pages/admin/AdminMamaResourcesPage.tsx frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs
git commit -m "feat(admin): upload task transfer screenshots"
```

### Task 3: Mobile Web read-only transfer credential

**Files:**
- Modify: `frontend/src/pages/MamaResourceApplyPage.tsx`
- Test: `frontend/src/pages/MamaResourceApplyPage.test.mjs`

**Interfaces:**
- Consumes: `MamaResourceTaskAssignment.transferScreenshotUrl` serialized by Task 1 and typed by Task 2.
- Produces no mutation API; the user detail is read-only.

- [ ] **Step 1: Write a failing rendering contract test**

Assert that task detail conditionally renders “转账凭证”, uses the screenshot URL in an image, links it for full-size viewing, and does not render an upload input tied to that field.

- [ ] **Step 2: Run the page test and verify failure**

```bash
node --test frontend/src/pages/MamaResourceApplyPage.test.mjs
```

Expected: FAIL because the credential block is absent.

- [ ] **Step 3: Add the conditional credential block**

```tsx
{task.transferScreenshotUrl ? (
  <section>
    <h3>转账凭证</h3>
    <a href={task.transferScreenshotUrl} target="_blank" rel="noreferrer">
      <img src={task.transferScreenshotUrl} alt="任务转账凭证" />
    </a>
  </section>
) : null}
```

Use existing task-detail card spacing and image styles. Do not add empty-state copy or controls.

- [ ] **Step 4: Run page test and frontend build, then commit**

Run the test from Step 2 and `cd frontend && npm run build`. Expected: both succeed.

```bash
git add frontend/src/pages/MamaResourceApplyPage.tsx frontend/src/pages/MamaResourceApplyPage.test.mjs
git commit -m "feat(frontend): show task transfer screenshots"
```

### Task 4: Native mini-program read-only transfer credential

**Files:**
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.js`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxss`
- Test: `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

**Interfaces:**
- Consumes: owner-scoped task property `transferScreenshotUrl` from Task 1.
- Produces: normalized task field and `previewTransferScreenshot()` using `wx.previewImage`.

- [ ] **Step 1: Write failing static contract tests**

Assert normalization preserves the field, WXML conditionally renders only when it exists, the image invokes `previewTransferScreenshot`, and the method calls `wx.previewImage({ current, urls: [current] })`.

- [ ] **Step 2: Run the native page test and verify failure**

```bash
node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs
```

Expected: FAIL because normalization and WXML are absent.

- [ ] **Step 3: Normalize and preview the transfer screenshot**

Add to `buildTaskView`:

```js
transferScreenshotUrl: asText(source.transferScreenshotUrl).trim(),
transferScreenshotUpdatedAt: source.transferScreenshotUpdatedAt || null,
```

Add a guarded preview method:

```js
previewTransferScreenshot() {
  const current = asText(this.data.currentMamaTask?.transferScreenshotUrl).trim();
  if (!current) return;
  wx.previewImage({ current, urls: [current] });
},
```

- [ ] **Step 4: Render the conditional read-only block**

Add a “转账凭证” section only when `currentMamaTask.transferScreenshotUrl` exists. Use `mode="widthFix"`, bind preview, and add only scoped sizing/radius styles. Do not add an upload button or empty state.

- [ ] **Step 5: Run mini-program tests and commit**

```bash
node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs
find apps/wechat-miniprogram -name '*.test.mjs' -print0 | xargs -0 node --test
```

Expected: targeted and complete mini-program suites pass.

```bash
git add apps/wechat-miniprogram/pages/mama-resource-apply/index.js apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml apps/wechat-miniprogram/pages/mama-resource-apply/index.wxss apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs
git commit -m "feat(miniprogram): show task transfer screenshots"
```

### Task 5: Cross-surface verification and project snapshot

**Files:**
- Modify if behavior snapshot requires it: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Consumes all tasks above.
- Produces a verified branch ready for the separately authorized local merge.

- [ ] **Step 1: Run backend, frontend, and mini-program verification**

```bash
(cd backend && node --test --import tsx src/routes/mamaResource.test.ts)
node --test frontend/src/pages/admin/AdminMamaResourcesPage.test.mjs frontend/src/pages/MamaResourceApplyPage.test.mjs
(cd frontend && npm run build)
find apps/wechat-miniprogram -name '._*' -delete
find apps/wechat-miniprogram -name '*.test.mjs' -print0 | xargs -0 node --test
```

Expected: all tests pass and frontend build succeeds.

- [ ] **Step 2: Inspect the final diff and runtime risks**

Run `git diff --check`, confirm no `._*` files are tracked, confirm the upload flow does not mutate assignment status, and confirm user APIs remain owner-scoped.

- [ ] **Step 3: Update the active context only if the current snapshot tracks this workstream**

Record the completed capability and exact verification results without turning `docs/ACTIVE_CONTEXT.md` into a journal.

- [ ] **Step 4: Commit any snapshot update**

```bash
git add docs/ACTIVE_CONTEXT.md
git commit -m "docs: update Mama Resource task workflow"
```
