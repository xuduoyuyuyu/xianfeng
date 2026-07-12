# Native WorthBuy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every WeChat mini-program WorthBuy list, submission, history, detail, and sharing flow with dedicated native pages while preserving the Web product and backend authorization/billing contracts.

**Architecture:** Add dedicated native list and detail pages backed by a focused `worthbuyNative` utility for normalization, caching, error classification, and route construction. Keep browser routes unchanged, add opt-in pagination to existing public/history endpoints without breaking their response shape, then remove WorthBuy-only state and markup from the generic WebView page after all native entries are covered.

**Tech Stack:** WeChat Mini Program JavaScript/WXML/WXSS, Express, Mongoose, Node.js test runner

## Global Constraints

- Web `WorthBuyPage` and `WorthBuyDetailPage` remain the content and behavior source of truth.
- Public browsing is anonymous; personal history, submission, private detail, and deletion retain current ownership rules.
- New analysis continues to use `worthbuy_analysis`, costs 5 points, and passes through `requirePro`.
- Missing report fields omit their complete UI block; no synthetic fallback copy.
- Login expiry, `PRO_REQUIRED`, insufficient points, validation failures, and network errors remain distinct.
- No AI prompt, model, billing-price, data migration, upload, review, or publication changes.

---

### Task 1: Native data contract and paged backend reads

**Files:**
- Create: `apps/wechat-miniprogram/utils/worthbuyNative.js`
- Create: `apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs`
- Modify: `backend/src/routes/worthbuy.ts`
- Modify: `backend/src/routes/worthbuy.test.ts`

**Interfaces:**
- Produces: `normalizeWorthBuyItem(item)`, `normalizeWorthBuyResult(result, fallbackTitle)`, `classifyWorthBuyError(error)`, `worthBuyDetailPath(query)`, `readWorthBuyCache(key, ownerId)`, `writeWorthBuyCache(key, ownerId, value)`
- Backend list responses remain `{ items }` and optionally add `{ total, current, pages, size }` when `current` or `size` is supplied.

- [ ] **Step 1: Add failing utility contract tests**

Test that normalization keeps `score`, `isIqTax`, `reason`, `pros`, `cons`, `businessModel`, `commentAnalysis`, `recommendation`, `priceRange`, `ratingDimensions`, `dataPoints`, `references`, `suitableFor`, `notSuitableFor`, `alternatives`, `buyAdvice`, and `analyzedAt`; empty arrays and blank strings become absent blocks; detail paths encode the query; personal cache reads fail when the stored owner differs.

- [ ] **Step 2: Run the utility test and verify RED**

Run: `node --test apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs`

Expected: FAIL because `worthbuyNative.js` does not exist.

- [ ] **Step 3: Implement the minimal utility**

Use pure functions for normalization and error classification. `classifyWorthBuyError` returns exactly one of `auth`, `pro`, `points`, `validation`, or `network`. Cache payloads use `{ ownerId, savedAt, value }`; public caches use owner `"public"`.

- [ ] **Step 4: Add failing backend pagination assertions**

Extend `backend/src/routes/worthbuy.test.ts` to require sanitized `current`/`size`, `.skip((current - 1) * size).limit(size)`, and unchanged unpaged `{ items }` behavior.

- [ ] **Step 5: Implement opt-in pagination**

For `/list` and `/my`, only paginate when either query parameter exists. Cap size at 50. Return `total`, `current`, `pages`, and `size` alongside `items`; without pagination parameters retain the legacy `{ items }` response.

- [ ] **Step 6: Verify Task 1**

Run:

```bash
node --test apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs
cd backend && node --test --import tsx src/routes/worthbuy.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/wechat-miniprogram/utils/worthbuyNative.js apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs backend/src/routes/worthbuy.ts backend/src/routes/worthbuy.test.ts
git commit -m "feat: add native worthbuy data contract"
```

---

### Task 2: Native public list and route registration

**Files:**
- Create: `apps/wechat-miniprogram/pages/worthbuy/index.js`
- Create: `apps/wechat-miniprogram/pages/worthbuy/index.json`
- Create: `apps/wechat-miniprogram/pages/worthbuy/index.wxml`
- Create: `apps/wechat-miniprogram/pages/worthbuy/index.wxss`
- Create: `apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs`
- Modify: `apps/wechat-miniprogram/app.json`
- Modify: `apps/wechat-miniprogram/utils/nativePageNav.js`

**Interfaces:**
- Consumes: `request`, `nativeChrome`, `nativeSettings`, `createPageShare`, and Task 1 utility functions.
- Produces: native route `/pages/worthbuy/index`, paged public cards, cache-first refresh, `openWorthBuyDetail(query)`.

- [ ] **Step 1: Write failing page registration and list tests**

Assert both new routes are registered before `pages/webview/index`; `/worthbuy` resolves to the native list; the page requests `/api/worthbuy/list?current=1&size=20`; bottom reach appends the next page; public cache uses owner `public`; cards show only real title, description, score, verdict, and date fields.

- [ ] **Step 2: Run and verify RED**

Run: `node --test apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs`

Expected: FAIL because the page is absent.

- [ ] **Step 3: Implement the native list shell**

Register both pages. Build a custom-navigation list page that reuses existing native topbar/settings mixins, loads cached public records, refreshes page 1, appends later pages without duplicates, and opens `/pages/worthbuy-detail/index?query=<encoded>`.

- [ ] **Step 4: Implement list WXML/WXSS**

Mirror the Web WorthBuy hierarchy: hero, compact analysis input, public section, analysis cards, loading skeleton, retry state, and bottom loading state. Reuse shared native shell styles; keep WorthBuy-specific styles local.

- [ ] **Step 5: Verify Task 2**

Run:

```bash
node --test apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/wechat-miniprogram/app.json apps/wechat-miniprogram/utils/nativePageNav.js apps/wechat-miniprogram/pages/worthbuy
git commit -m "feat: add native worthbuy public list"
```

---

### Task 3: Native login, submission, history, and deletion

**Files:**
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.js`
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs`
- Modify: `apps/wechat-miniprogram/pages/pro/index.js`

**Interfaces:**
- Consumes: current mini-program session, `nativeSettings.loginWithPhone`, `POST /api/worthbuy/submit`, `GET /api/worthbuy/my?current=N&size=20`, and `DELETE /api/worthbuy/my/:brand`.
- Produces: `submitAnalysis()`, `loadMyHistory()`, `deleteHistoryItem()`, and distinct auth/pro/points/validation/network UI states.

- [ ] **Step 1: Write failing interaction tests**

Assert anonymous public browsing does not trigger login; submission/history requests require a current session; phone authorization resumes the pending action; duplicate taps share one submission promise; 401 clears session, 402/`PRO_REQUIRED` offers native Pro, insufficient points displays remaining points, 422 displays backend guidance, and network errors expose retry.

- [ ] **Step 2: Verify RED**

Run: `node --test apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs`

Expected: FAIL on missing submission/history behavior.

- [ ] **Step 3: Implement input and submission**

Port the Web parsing semantics into the Task 1 utility, not page-local duplicated regexes. Submit `{ brand, url, extractedTitle, submittedBy }`, show staged progress, block duplicates, cache the returned detail, and navigate to native detail on success.

- [ ] **Step 4: Implement personal history and deletion**

Load owner-scoped cache only for the current user, refresh from `/my`, render a separate “我的分析” section, confirm deletion, delete only the matching personal card, and invalidate its detail cache.

- [ ] **Step 5: Implement error actions**

Add native actions for phone authorization, opening `/pages/pro/index`, retrying submission, and editing invalid input. Do not route to Web login or Web Pro pages.

- [ ] **Step 6: Verify Task 3**

Run:

```bash
node --test apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs
cd backend && node --test --import tsx src/routes/worthbuy.test.ts src/services/billing.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/wechat-miniprogram/pages/worthbuy apps/wechat-miniprogram/utils/worthbuyNative.js apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs apps/wechat-miniprogram/pages/pro/index.js
git commit -m "feat: add native worthbuy analysis workflow"
```

---

### Task 4: Dedicated native WorthBuy detail

**Files:**
- Create: `apps/wechat-miniprogram/pages/worthbuy-detail/index.js`
- Create: `apps/wechat-miniprogram/pages/worthbuy-detail/index.json`
- Create: `apps/wechat-miniprogram/pages/worthbuy-detail/index.wxml`
- Create: `apps/wechat-miniprogram/pages/worthbuy-detail/index.wxss`
- Create: `apps/wechat-miniprogram/pages/worthbuy-detail/index.static.test.mjs`
- Modify: `apps/wechat-miniprogram/utils/worthbuyNative.js`

**Interfaces:**
- Consumes: `GET /api/worthbuy/:query`, owner-safe cached detail, native share helpers, and normalized full report.
- Produces: complete native report and share route `/pages/worthbuy-detail/index?query=<encoded>`.

- [ ] **Step 1: Write failing full-report tests**

Require conditional blocks for hero/verdict, dimensions, pros, cons, business model, comment analysis, data points, suitable/not suitable audiences, alternatives, recommendation, buy advice, references, and analyzed time. Assert blank fields omit blocks and reference links support copy fallback.

- [ ] **Step 2: Verify RED**

Run: `node --test apps/wechat-miniprogram/pages/worthbuy-detail/index.static.test.mjs`

Expected: FAIL because the detail page is absent.

- [ ] **Step 3: Implement detail loading and permissions**

Decode `query`, hydrate a matching owner-safe cache, request `/api/worthbuy/:query` with the current user identity when present, normalize `item.result`, classify 401/403/404 separately, and preserve visible cached content during background refresh.

- [ ] **Step 4: Migrate and complete report markup**

Move the useful `nativeWorthBuyMode` report structure from `pages/webview/index` into the dedicated page, add missing Web fields, and keep every section conditional on real normalized content.

- [ ] **Step 5: Add native sharing and reference behavior**

Share the native detail path without token/userId. Open allowlisted mini-program links directly; otherwise copy the reference URL with clear feedback.

- [ ] **Step 6: Verify Task 4**

Run:

```bash
node --test apps/wechat-miniprogram/pages/worthbuy-detail/index.static.test.mjs
node --test apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/wechat-miniprogram/pages/worthbuy-detail apps/wechat-miniprogram/utils/worthbuyNative.js apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs
git commit -m "feat: add native worthbuy detail report"
```

---

### Task 5: Route closure, generic WebView cleanup, and runtime verification

**Files:**
- Modify: `apps/wechat-miniprogram/components/native-page-nav/index.js`
- Modify: `apps/wechat-miniprogram/pages/search/index.js`
- Modify: `apps/wechat-miniprogram/pages/webview/index.js`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- Modify: `docs/modules/platform-release-and-app-shells.md`

**Interfaces:**
- Consumes: native list/detail routes completed in Tasks 2-4.
- Produces: no mini-program WorthBuy entry that falls back to WebView; generic WebView owns no WorthBuy-only state, markup, or styles.

- [ ] **Step 1: Write failing route-closure tests**

Assert settings `知物`, search results, generic `openNativeRoute`, cards, history, and shared detail paths all target the two native pages. Assert `pages/webview/index` no longer contains `nativeWorthBuyMode`, `.xf-worthbuy-detail-*`, or WorthBuy-specific request code.

- [ ] **Step 2: Verify RED**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: FAIL because settings and WebView still own legacy WorthBuy behavior.

- [ ] **Step 3: Switch every entry and remove legacy ownership**

Update route helpers and search/settings entries, then delete only WorthBuy-specific state, handlers, WXML branch, and WXSS from `pages/webview`. Preserve unrelated program, book, topic, welfare, planning, and Xiaowanzi behavior.

- [ ] **Step 4: Update module documentation**

Record the two native routes, API ownership, login/billing boundaries, and the fact that browser Web pages remain separate.

- [ ] **Step 5: Run the full targeted suite**

Run:

```bash
node --test apps/wechat-miniprogram/utils/worthbuyNative.static.test.mjs apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs apps/wechat-miniprogram/pages/worthbuy-detail/index.static.test.mjs apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
cd backend && node --test --import tsx src/routes/worthbuy.test.ts src/services/billing.test.ts
bash scripts/release/verify-mini-webview-ready.sh
git diff --check
```

Expected: all tests and readiness checks PASS.

- [ ] **Step 6: Verify in WeChat DevTools**

Open the exact native list and detail routes and verify anonymous public browsing, phone login, personal history, deletion, successful submission, point/pro failures, search/menu/card entry, and share landing. Capture screenshots for list, loading, detail, and one failure state.

- [ ] **Step 7: Verify on a physical phone**

Check capsule/safe-area spacing, long-report scrolling, reference copy, return behavior, slow-network cache visibility, and share reopening. Record any unverified path explicitly.

- [ ] **Step 8: Commit Task 5**

```bash
git add apps/wechat-miniprogram/components/native-page-nav apps/wechat-miniprogram/pages/search apps/wechat-miniprogram/pages/webview apps/wechat-miniprogram/pages/tab-webview.static.test.mjs docs/modules/platform-release-and-app-shells.md
git commit -m "refactor: route worthbuy through native pages"
```
