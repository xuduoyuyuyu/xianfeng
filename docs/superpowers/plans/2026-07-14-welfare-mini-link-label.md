# Welfare Mini Link Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show “点击获取” for welfare claim links containing “小程序” while preserving “复制链接” for every other URL on mobile Web and native WeChat Mini Program.

**Architecture:** Derive a presentation-only boolean from the existing `externalUrl`; do not change APIs or link actions. React computes the label at render time, while the mini program stores the derived boolean alongside existing dialog state for WXML rendering.

**Tech Stack:** React/TypeScript, WeChat Mini Program JavaScript/WXML, Node.js built-in test runner

## Global Constraints

- Match any external URL containing the consecutive text `小程序`.
- Do not change mobile Web copy behavior.
- Do not change mini-program short-link open, copy, or failure behavior.
- Do not affect non-welfare link surfaces.

---

### Task 1: Mobile Web welfare label

**Files:**
- Modify: `frontend/src/pages/WelfarePage.test.mjs`
- Modify: `frontend/src/pages/WelfarePage.tsx`
- Test: `frontend/src/pages/WelfarePage.test.mjs`

**Interfaces:**
- Consumes: `claimDialog.externalUrl: string`.
- Produces: Button label expression `claimDialog.externalUrl.includes("小程序") ? "点击获取" : "复制链接"`.

- [ ] **Step 1: Write the failing test**

Add assertions requiring the conditional label and existing copy handler:

```js
assert.match(source, /claimDialog\.externalUrl\.includes\("小程序"\)\s*\?\s*"点击获取"\s*:\s*"复制链接"/);
assert.match(source, /onClick=\{copyClaimLink\}/);
```

- [ ] **Step 2: Run RED**

```bash
node --test frontend/src/pages/WelfarePage.test.mjs
```

Expected: FAIL because the button still contains the fixed text `复制链接`.

- [ ] **Step 3: Implement the conditional label**

Keep the existing button and handler, replacing only its text:

```tsx
<button type="button" onClick={copyClaimLink} className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-[#5e43e6]">
  {claimDialog.externalUrl.includes("小程序") ? "点击获取" : "复制链接"}
</button>
```

- [ ] **Step 4: Run GREEN**

```bash
node --test frontend/src/pages/WelfarePage.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add frontend/src/pages/WelfarePage.tsx frontend/src/pages/WelfarePage.test.mjs
git commit -m "fix(frontend): label welfare mini links"
```

---

### Task 2: Native mini-program welfare label

**Files:**
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- Modify: `apps/wechat-miniprogram/pages/welfare/index.js`
- Modify: `apps/wechat-miniprogram/pages/welfare/index.wxml`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: The existing `claimDialogExternalUrl` value.
- Produces: `claimDialogIsMiniProgramLink: boolean` in page data and conditional WXML text.

- [ ] **Step 1: Write the failing static contract**

Add assertions to the native welfare test:

```js
assert.match(page.js, /claimDialogIsMiniProgramLink:\s*[^,]*\.includes\("小程序"\)/);
assert.match(page.js, /closeClaimDialog\(\)[\s\S]*claimDialogIsMiniProgramLink:\s*false/);
assert.match(page.wxml, /\{\{claimDialogIsMiniProgramLink \? '点击获取' : '复制链接'\}\}/);
```

- [ ] **Step 2: Run RED**

First remove generated AppleDouble metadata, then run:

```bash
find apps/wechat-miniprogram -name '._*' -delete
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: FAIL because the derived state and conditional label do not exist.

- [ ] **Step 3: Add the derived dialog state**

Initialize the page data field with the other claim-dialog fields:

```js
claimDialogIsMiniProgramLink: false,
```

Whenever claimed or already-claimed campaign data opens the dialog, set:

```js
claimDialogIsMiniProgramLink: String(externalUrl || "").includes("小程序"),
```

Use the exact external URL selected for that dialog, and reset the field in `closeClaimDialog()`:

```js
claimDialogIsMiniProgramLink: false
```

- [ ] **Step 4: Render the conditional WXML label**

Keep `catchtap="copyClaimLink"` and replace only the text:

```xml
<button catchtap="copyClaimLink">{{claimDialogIsMiniProgramLink ? '点击获取' : '复制链接'}}</button>
```

- [ ] **Step 5: Run GREEN**

```bash
find apps/wechat-miniprogram -name '._*' -delete
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: PASS with 0 failed tests.

- [ ] **Step 6: Verify scope and commit Task 2**

```bash
git diff --check -- apps/wechat-miniprogram/pages/welfare/index.js apps/wechat-miniprogram/pages/welfare/index.wxml apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git add apps/wechat-miniprogram/pages/welfare/index.js apps/wechat-miniprogram/pages/welfare/index.wxml apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "fix(miniprogram): label welfare mini links"
```

---

### Task 3: Cross-surface verification

**Files:**
- Verify only: all Task 1 and Task 2 files

**Interfaces:**
- Consumes: Both conditional label implementations.
- Produces: Verified behavior contract across mobile Web and native mini program.

- [ ] **Step 1: Run both focused suites**

```bash
node --test frontend/src/pages/WelfarePage.test.mjs
find apps/wechat-miniprogram -name '._*' -delete
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: both commands PASS.

- [ ] **Step 2: Inspect the total feature diff**

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
```

Expected: no whitespace errors; changes remain limited to the previously approved tabbar icon work, this welfare label work, and their design/plan documents.

