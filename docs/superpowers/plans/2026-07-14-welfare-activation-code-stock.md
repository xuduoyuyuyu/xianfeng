# 福利激活码库存同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使已导入激活码的福利活动始终满足已领取数不大于总库存且总库存不大于激活码总数。

**Architecture:** `adminWelfare` 更新接口是最终一致性边界：保存前读取激活码数与已领取数，对请求库存执行上下界校正。管理端比较请求值和响应中的实际库存，只在发生校正时显示明确提示。

**Tech Stack:** Express 5、Mongoose 9、Node.js test runner、React 18、TypeScript

## Global Constraints

- 无激活码活动保留普通库存模式。
- 有激活码时，总库存不得超过激活码总数。
- 总库存不得小于已领取数。
- 不删除激活码，不新增领取模式字段，不重写生产历史数据。
- 保留导入激活码后库存同步为激活码总数的现有行为。

---

### Task 1: 后端库存一致性校正

**Files:**
- Modify: `backend/src/routes/welfare.test.ts`
- Modify: `backend/src/routes/adminWelfare.ts`

**Interfaces:**
- Consumes: `PUT /api/admin/welfare/:id` 的 `totalStock` 和已存在的 `WelfareActivationCode` / `WelfareClaim` 记录。
- Produces: 响应中 `campaign.totalStock` 为校正后实际保存值。

- [ ] **Step 1: 写失败的接口回归测试**

在 `backend/src/routes/welfare.test.ts` 增加独立用例：创建活动并导入 3 个激活码，然后验证库存 10 被压到 3，库存 2 保留为 2。

```ts
it("keeps activation-code campaign stock within claimed and code counts", async () => {
  const created = await WelfareCampaign.create({ title: "激活码福利", totalStock: 3, claimedCount: 0, status: "draft" });
  await WelfareActivationCode.insertMany([
    { campaignId: created._id, code: "CODE-A", importIndex: 0 },
    { campaignId: created._id, code: "CODE-B", importIndex: 1 },
    { campaignId: created._id, code: "CODE-C", importIndex: 2 },
  ]);

  const cappedResponse = await fetch(`${server.adminUrl}/${created._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: created.title, totalStock: 10, status: "draft" }),
  });
  assert.equal(cappedResponse.status, 200);
  assert.equal((await cappedResponse.json()).campaign.totalStock, 3);

  const lowerResponse = await fetch(`${server.adminUrl}/${created._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: created.title, totalStock: 2, status: "draft" }),
  });
  assert.equal(lowerResponse.status, 200);
  assert.equal((await lowerResponse.json()).campaign.totalStock, 2);
});
```

在同一用例追加已领取下界：

```ts
await WelfareCampaign.updateOne({ _id: created._id }, { $set: { claimedCount: 2 } });
const floorResponse = await fetch(`${server.adminUrl}/${created._id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: created.title, totalStock: 1, status: "draft" }),
});
assert.equal(floorResponse.status, 200);
assert.equal((await floorResponse.json()).campaign.totalStock, 2);
```

- [ ] **Step 2: 运行目标测试并确认 RED**

Run: `cd backend && node --test --import tsx src/routes/welfare.test.ts`

Expected: 新用例在“库存 10 应为 3”或“库存 1 应为 2”断言失败。

- [ ] **Step 3: 实现最小后端校正**

在 `router.put("/:id")` 中先读取活动，再计数并修正 `payload.totalStock`：

```ts
const campaign = await WelfareCampaign.findOne(idQuery(asText(req.params.id)));
if (!campaign) {
  res.status(404).json({ message: "福利活动不存在" });
  return;
}
const [activationCodeCount, claimCount] = await Promise.all([
  WelfareActivationCode.countDocuments({ campaignId: campaign._id }),
  WelfareClaim.countDocuments({ campaignId: campaign._id, status: "claimed" }),
]);
const effectiveClaimCount = Math.max(Number(campaign.claimedCount || 0), claimCount);
const requestedStock = Math.max(0, Number(payload.totalStock || 0));
payload.totalStock = Math.max(
  effectiveClaimCount,
  activationCodeCount > 0 ? Math.min(requestedStock, activationCodeCount) : requestedStock
);
campaign.claimedCount = effectiveClaimCount;
campaign.set(payload);
await campaign.save();
```

保留现有 `withActivationCodeStats` 响应结构和 `now` 处理。

- [ ] **Step 4: 运行目标测试并确认 GREEN**

Run: `cd backend && node --test --import tsx src/routes/welfare.test.ts`

Expected: 全部 PASS。

- [ ] **Step 5: 提交后端变更**

```bash
git add backend/src/routes/adminWelfare.ts backend/src/routes/welfare.test.ts
git commit -m "fix(welfare): cap activation code campaign stock"
```

### Task 2: 管理端显示库存校正结果

**Files:**
- Modify: `frontend/src/pages/admin/AdminWelfarePage.test.mjs`
- Modify: `frontend/src/pages/admin/AdminWelfarePage.tsx`

**Interfaces:**
- Consumes: `adminApi.updateWelfareCampaign()` 返回的 `response.data.campaign.totalStock`。
- Produces: 保存后的用户提示，以及重新加载后按服务端实际值展示的活动列表。

- [ ] **Step 1: 写失败的管理页静态契约测试**

在 `frontend/src/pages/admin/AdminWelfarePage.test.mjs` 增加：

```js
test("shows the backend-adjusted activation-code stock after save", () => {
  assert.match(source, /const requestedStock = Math\.max\(0, Math\.floor\(Number\(form\.totalStock\) \|\| 0\)\)/);
  assert.match(source, /const savedCampaign = response\.data\.campaign/);
  assert.match(source, /savedCampaign\.totalStock !== requestedStock/);
  assert.match(source, /库存已按激活码数量调整为/);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test frontend/src/pages/admin/AdminWelfarePage.test.mjs`

Expected: 新契约断言 FAIL。

- [ ] **Step 3: 使用后端响应更新提示并刷新列表**

将 `saveCampaign` 的编辑分支改为保留响应；弹窗按现有行为关闭，随后重新加载服务端列表：

```tsx
const requestedStock = Math.max(0, Math.floor(Number(form.totalStock) || 0));
let savedCampaign: WelfareCampaign;
if (editing) {
  const response = await adminApi.updateWelfareCampaign(editing._id, toPayload(form));
  savedCampaign = response.data.campaign;
} else {
  const response = await adminApi.createWelfareCampaign(toPayload(form));
  savedCampaign = response.data.campaign;
}
const stockAdjusted = savedCampaign.totalStock !== requestedStock;
setFormModalOpen(false);
setEditing(null);
setForm(emptyForm);
await loadItems();
setMessage(stockAdjusted
  ? `库存已按激活码数量调整为 ${savedCampaign.totalStock}。`
  : "百宝箱福利已保存。");
```

不在前端自行计算激活码上界；后端响应是真实保存结果。

- [ ] **Step 4: 运行管理页测试和前端构建**

Run: `node --test frontend/src/pages/admin/AdminWelfarePage.test.mjs`

Expected: PASS。

Run: `cd frontend && npm run build`

Expected: TypeScript 和 Vite 构建成功。

- [ ] **Step 5: 提交管理端变更**

```bash
git add frontend/src/pages/admin/AdminWelfarePage.tsx frontend/src/pages/admin/AdminWelfarePage.test.mjs
git commit -m "fix(admin): show adjusted welfare stock"
```

### Task 3: 综合验证与活动上下文

**Files:**
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Consumes: Task 1 的后端一致性规则和 Task 2 的管理端反馈。
- Produces: 可供后续 agent 使用的当前行为快照。

- [ ] **Step 1: 运行后端目标测试**

Run: `cd backend && node --test --import tsx src/routes/welfare.test.ts`

Expected: PASS。

- [ ] **Step 2: 运行管理页契约测试**

Run: `node --test frontend/src/pages/admin/AdminWelfarePage.test.mjs`

Expected: PASS。

- [ ] **Step 3: 运行前端完整构建**

Run: `cd frontend && npm run build`

Expected: PASS。

- [ ] **Step 4: 更新活动上下文**

在 `docs/ACTIVE_CONTEXT.md` 的 Current Focus 加入：

```md
Welfare campaigns with activation codes cap total stock at the imported-code
count and floor it at the claimed count. The admin UI reports the actual saved
stock whenever the backend adjusts an operator-entered value.
```

- [ ] **Step 5: 检查差异和提交**

Run: `git diff --check`

Expected: 无新的 whitespace error；现有 `.git/objects/pack/._*.idx` 警告不属于业务差异。

```bash
git add docs/ACTIVE_CONTEXT.md
git commit -m "docs: record welfare stock consistency"
```
