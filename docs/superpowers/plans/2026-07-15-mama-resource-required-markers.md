# Mama Resource Required Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consistent red required-field markers to the existing Mama Haozhuan profile forms on web and WeChat mini program without changing validation behavior.

**Architecture:** Keep the current form components and validation ownership intact. Render a small required marker beside only the labels already enforced by `canSubmit` or `submitMamaResourcePayload`, and lock the two clients to the same field set through focused static tests.

**Tech Stack:** React, TypeScript, Tailwind CSS, WeChat WXML/WXSS, Node.js test runner

---

### Task 1: Web required markers

**Files:**
- Modify: `frontend/src/pages/MamaResourceApplyPage.test.mjs`
- Modify: `frontend/src/pages/MamaResourceApplyPage.tsx`

- [ ] **Step 1: Write the failing web marker test**

Add a test that requires a shared marker and every enforced web label:

```js
test("web mama resource form marks every required field", () => {
  assert.match(source, /const requiredMark = <span[^>]*>\*<\/span>/);
  ["姓名\/昵称", "微信号", "支付宝账号", "支付宝验证姓名", "小红书账号昵称", "小红书主页链接", "账号昵称"].forEach((label) => {
    assert.match(source, new RegExp(`${label}[\\s\\S]{0,120}requiredMark`));
  });
  assert.match(source, /requiredMark[\s\S]{0,120}我同意家和万事团队/);
});
```

- [ ] **Step 2: Run the web test and verify RED**

Run: `node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`

Expected: FAIL because `requiredMark` and the marked labels do not exist.

- [ ] **Step 3: Render the web markers**

Define once inside `MamaResourceApplyPage`:

```tsx
const requiredMark = <span className="ml-0.5 text-[#e11d48]" aria-hidden="true">*</span>;
```

Place `{requiredMark}` immediately after these labels: `姓名/昵称`, `微信号`, `支付宝账号`, `支付宝验证姓名`, `小红书账号昵称`, `小红书主页链接`, and every rendered extra-account `账号昵称`. Place it immediately before the consent sentence. Do not mark optional fields.

- [ ] **Step 4: Run the web test and verify GREEN**

Run: `node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the web increment**

```bash
git add frontend/src/pages/MamaResourceApplyPage.tsx frontend/src/pages/MamaResourceApplyPage.test.mjs
git commit -m "feat: mark required mama resource web fields"
```

### Task 2: Mini-program required markers

**Files:**
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxss`

- [ ] **Step 1: Write the failing mini-program marker test**

Add a test for the shared class and enforced labels:

```js
test("mini mama resource form marks every required field", () => {
  ["姓名/昵称", "微信号", "支付宝账号", "支付宝验证姓名", "账号昵称", "小红书主页链接"].forEach((label) => {
    assert.match(wxmlSource, new RegExp(`${label}<text class="xf-mama-required">\\*<\\/text>`));
  });
  assert.match(wxmlSource, /<text class="xf-mama-required">\*<\/text>资料会用于任务匹配和运营联系/);
  assert.match(wxssSource, /\.xf-mama-required\s*\{[\s\S]*color:\s*#e11d48;/);
});
```

- [ ] **Step 2: Run the mini-program test and verify RED**

Run: `node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

Expected: FAIL because `xf-mama-required` is absent.

- [ ] **Step 3: Render and style the mini-program markers**

Append the marker immediately after each required field title and before the consent copy:

```xml
<text class="xf-mama-required">*</text>
```

Use the shared scoped style:

```css
.xf-mama-required {
  margin-left: 4rpx;
  color: #e11d48;
}
```

Mark `姓名/昵称`, `微信号`, `支付宝账号`, `支付宝验证姓名`, the primary `账号昵称`, `小红书主页链接`, every extra-account `账号昵称`, and the consent copy. Do not change placeholders or validation.

- [ ] **Step 4: Run the mini-program test and verify GREEN**

Run: `node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the mini-program increment**

```bash
git add apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml apps/wechat-miniprogram/pages/mama-resource-apply/index.wxss apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs
git commit -m "feat: mark required mama resource mini fields"
```

### Task 3: Cross-client verification

**Files:**
- Verify: `frontend/src/pages/MamaResourceApplyPage.tsx`
- Verify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml`

- [ ] **Step 1: Run both focused suites**

Run:

```bash
node --test frontend/src/pages/MamaResourceApplyPage.test.mjs
node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs
```

Expected: both suites PASS with zero failures.

- [ ] **Step 2: Run the mini-program package suite**

Run: `find apps/wechat-miniprogram -name '._*' -delete && node --test apps/wechat-miniprogram/**/*.test.mjs`

Expected: all mini-program tests PASS and the package contains no AppleDouble files.

- [ ] **Step 3: Build the web client**

Run: `npm run build` from `frontend/`.

Expected: build exits with code 0.

- [ ] **Step 4: Check the final diff**

Run: `git diff --check`

Expected: no whitespace errors. Confirm the diff changes only marker rendering, marker styling, and focused tests.
