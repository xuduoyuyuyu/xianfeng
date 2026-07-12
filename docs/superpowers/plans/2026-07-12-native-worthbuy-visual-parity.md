# Native WorthBuy Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the native WeChat WorthBuy list and detail pages visually match the existing mobile web pages while preserving all native data, billing, auth, cache, delete, and navigation behavior.

**Architecture:** Keep API and page-controller logic in the current native pages. Extend the existing WorthBuy display normalizer with web-compatible presentation fields, then replace only the WXML/WXSS composition of the list and detail surfaces. Verify structure with static tests and appearance in WeChat DevTools against the supplied mobile screenshots.

**Tech Stack:** WeChat Mini Program WXML/WXSS/CommonJS, Node test runner, existing `nativeChrome`, `worthbuyNative`, and release verification scripts.

## Global Constraints

- `frontend/src/pages/WorthBuyPage.tsx` and `frontend/src/pages/WorthBuyDetailPage.tsx` are the content and visual rules of record.
- Preserve native safe-area chrome and fixed TabBar clearance.
- Do not modify Web pages, API contracts, Pro billing, analysis behavior, auth, cache ownership, pagination, delete semantics, or share routes.
- Do not invent product content or fallback summaries; hide absent fields.
- Use existing brand assets and real data only; no generated images or new dependencies.

---

### Task 1: Web-Compatible Presentation Mapping

**Files:**
- Modify: `apps/wechat-miniprogram/utils/worthbuyNative.js`
- Modify: `apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs`

**Interfaces:**
- Consumes: raw WorthBuy list items and result objects already passed to `normalizeWorthBuyItem` and `normalizeWorthBuyResult`.
- Produces: `scoreLabel`, `scoreColor`, Chinese dimension labels/colors, `displayEmoji`, and `categoryLabel` on normalized display objects.

- [ ] **Step 1: Write the failing presentation tests**

Add assertions that score `0` produces the Web-equivalent warning label/color, dimensions map `cost/quality/safety/experience/afterSales` to Chinese labels and `#F59E0B/#10B981/#3B82F6/#8B5CF6/#EC4899`, and known category/title inputs produce a display emoji and category label without replacing the real title.

- [ ] **Step 2: Run the utility test and verify RED**

Run: `node --test utils/worthbuyNative.static.test.mjs`

Expected: FAIL because the new presentation fields do not exist.

- [ ] **Step 3: Add the minimal mapping helpers**

Implement pure helpers inside `worthbuyNative.js` and call them from the existing normalizers. Keep empty source fields empty; mappings may only derive presentation metadata from existing title/category/score/dimension values.

- [ ] **Step 4: Run the utility test and verify GREEN**

Run: `node --test utils/worthbuyNative.static.test.mjs`

Expected: all utility tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wechat-miniprogram/utils/worthbuyNative.js apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs
git commit -m "feat: map native worthbuy presentation fields"
```

### Task 2: Mobile-Web-Aligned Native List

**Files:**
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.js`
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs`

**Interfaces:**
- Consumes: normalized `publicItems` and `myItems` from Task 1 plus existing submit/history handlers.
- Produces: a mobile-web-aligned Hero, input/action states, and two-column item grid.

- [ ] **Step 1: Write failing list structure tests**

Assert WXML contains `VALUE CHECK`, the exact Web title/description/support copy, a search-style input row, disabled empty-state submit button, and a two-column `wb-card-grid` whose cards bind real `displayEmoji`, title, and `categoryLabel`. Assert the old score-first card presentation is absent.

- [ ] **Step 2: Run the list test and verify RED**

Run: `node --test pages/worthbuy/index.static.test.mjs`

Expected: FAIL on missing Web-aligned structure and card fields.

- [ ] **Step 3: Implement the list composition**

Update `index.js` with only derived view state needed for button enablement and public/history labels. Replace WXML with the approved Hero and grid while retaining the same handler names. Rewrite WXSS using `#f8f6ff`, white cards, `#d8d0ef/#F3F0FF` borders, purple text/actions, 32rpx Hero radius, two equal columns, two-line title truncation, and bottom padding equal to TabBar plus safe area.

- [ ] **Step 4: Run list and utility tests**

Run: `node --test utils/worthbuyNative.static.test.mjs pages/worthbuy/index.static.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wechat-miniprogram/pages/worthbuy/index.js apps/wechat-miniprogram/pages/worthbuy/index.wxml apps/wechat-miniprogram/pages/worthbuy/index.wxss apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs
git commit -m "feat: align native worthbuy list with mobile web"
```

### Task 3: Mobile-Web-Aligned Native Detail

**Files:**
- Modify: `apps/wechat-miniprogram/pages/worthbuy-detail/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/worthbuy-detail/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/worthbuy-detail/index.static.test.mjs`

**Interfaces:**
- Consumes: the existing normalized `report`, including Task 1 presentation metadata.
- Produces: Web-aligned title, trust gauge, five-dimension score card, and conditional report cards.

- [ ] **Step 1: Write failing detail structure tests**

Assert WXML contains `深度分析报告`, `可信指数`, a layered `wbd-gauge` with score-dependent style/class, Web-equivalent score label, tax/price tags, and five Chinese dimension rows using normalized colors. Keep assertions for every existing conditional content block and copy-reference handler.

- [ ] **Step 2: Run the detail test and verify RED**

Run: `node --test pages/worthbuy-detail/index.static.test.mjs`

Expected: FAIL because the current detail uses a compact score box and generic dimension rows.

- [ ] **Step 3: Implement the detail composition**

Replace only WXML/WXSS. Build the 180px-equivalent circular gauge with an outer score arc and white inner disc, centered mobile layout, Web colors and spacing, five colored progress rows, then apply the same white-card language to all real conditional sections. Preserve retry, back, share, reference copy, and API logic unchanged.

- [ ] **Step 4: Run detail, list, and utility tests**

Run: `node --test utils/worthbuyNative.static.test.mjs pages/worthbuy/index.static.test.mjs pages/worthbuy-detail/index.static.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wechat-miniprogram/pages/worthbuy-detail/index.wxml apps/wechat-miniprogram/pages/worthbuy-detail/index.wxss apps/wechat-miniprogram/pages/worthbuy-detail/index.static.test.mjs
git commit -m "feat: align native worthbuy detail with mobile web"
```

### Task 4: Route Regression and Visual QA

**Files:**
- Modify if evidence requires it: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- Create: `docs/qa/native-worthbuy-visual-parity.md`

**Interfaces:**
- Consumes: final list/detail pages and existing sidebar native route.
- Produces: automated regression evidence and same-viewport DevTools comparison record.

- [ ] **Step 1: Run focused route and WorthBuy tests**

Run:

```bash
node --test --test-name-pattern="hamburger secondary entries keep restored wrapper routes" pages/tab-webview.static.test.mjs
node --test utils/worthbuyNative.static.test.mjs pages/worthbuy/index.static.test.mjs pages/worthbuy-detail/index.static.test.mjs
```

Expected: sidebar opens `/pages/worthbuy/index`; all focused tests pass.

- [ ] **Step 2: Run release readiness verification**

Run: `bash scripts/release/verify-mini-webview-ready.sh`

Expected: pass. If the existing uncommitted Mama Haozhuan assertions fail, record their exact names separately and verify no WorthBuy test failed.

- [ ] **Step 3: Capture list and detail in WeChat DevTools**

At the screenshot-equivalent phone viewport, open `/pages/worthbuy/index` and `/pages/worthbuy-detail/index?query=试试`. Capture both states after data settles. Compare background, Hero bounds, two-column cards, title spacing, 180px-equivalent trust gauge, five score rows, and fixed TabBar clearance against the supplied screenshots.

- [ ] **Step 4: Record design QA**

Create `docs/qa/native-worthbuy-visual-parity.md` with reference/capture paths, viewport, each comparison item marked pass/fail, and final result `passed` only when no P0/P1/P2 mismatch remains.

- [ ] **Step 5: Run final hygiene checks and commit**

Run:

```bash
git diff --check
find apps/wechat-miniprogram -name '._*' -print
```

Expected: no whitespace errors and no AppleDouble files.

```bash
git add apps/wechat-miniprogram/pages/tab-webview.static.test.mjs docs/qa/native-worthbuy-visual-parity.md
git commit -m "test: verify native worthbuy visual parity"
```
