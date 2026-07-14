# Direct Login on Auth Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native welfare page's expired-login error copy with the existing WeChat phone-login flow and reload welfare data after successful authentication.

**Architecture:** The shared native request client emits a deduplicated auth-expired event whenever a request returns `401`. The welfare page subscribes while mounted, shows a page-owned full-screen phone-login gate, saves the returned session, and reloads campaign data after login. Web and mini-program WebView authentication routing remain unchanged.

**Tech Stack:** WeChat Mini Program CommonJS, WXML/WXSS, Node.js built-in test runner.

## Global Constraints

- Public pages and public data must remain anonymously accessible.
- A `401` must open login UI instead of rendering “未登录或登录已过期”.
- Do not automatically replay write operations after login.
- Reuse `/api/wechat-mini/login` and the existing `open-type="getPhoneNumber"` login flow.
- Concurrent `401` responses must emit only one pending login request.

---

### Task 1: Native auth-expiry event boundary

**Files:**
- Create: `apps/wechat-miniprogram/utils/authExpiry.js`
- Modify: `apps/wechat-miniprogram/utils/request.js`
- Test: `apps/wechat-miniprogram/utils/request.authExpiry.test.mjs`

**Interfaces:**
- Produces: `subscribeAuthExpired(listener: () => void): () => void`
- Produces: `notifyAuthExpired(): void`
- Produces: `resolveAuthExpired(): void`
- Consumes: `clearSession()` from `utils/session.js`

- [ ] **Step 1: Write failing tests**

Add tests that load `authExpiry.js` in a clean module context and prove that two `notifyAuthExpired()` calls notify a listener once until `resolveAuthExpired()` is called. Add a request test where `wx.request` returns `401` and assert that the session is cleared and the subscribed listener runs.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test apps/wechat-miniprogram/utils/request.authExpiry.test.mjs`

Expected: FAIL because `utils/authExpiry.js` and request-layer notification do not exist.

- [ ] **Step 3: Implement the event boundary**

Implement one module-scoped `Set` of listeners and one `pending` boolean. `notifyAuthExpired()` returns immediately while pending; otherwise it marks pending and calls each listener. `resolveAuthExpired()` clears pending. `subscribeAuthExpired()` adds the listener and returns an unsubscribe function. In `request.js`, handle `401` by calling `clearSession()` and `notifyAuthExpired()` before rejecting the original request.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test apps/wechat-miniprogram/utils/request.authExpiry.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/wechat-miniprogram/utils/authExpiry.js apps/wechat-miniprogram/utils/request.js apps/wechat-miniprogram/utils/request.authExpiry.test.mjs
git commit -m "feat(miniprogram): notify pages on auth expiry"
```

### Task 2: Welfare phone-login gate and reload

**Files:**
- Modify: `apps/wechat-miniprogram/pages/welfare/index.js`
- Modify: `apps/wechat-miniprogram/pages/welfare/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/welfare/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: `subscribeAuthExpired`, `resolveAuthExpired` from `utils/authExpiry.js`
- Consumes: `setSession(payload)` from `utils/session.js`
- Produces page method: `loginWithPhone(event)`
- Produces page state: `loginRequired`, `bindingPhone`, `loginMessage`

- [ ] **Step 1: Write failing welfare tests**

Extend the welfare static/runtime tests to assert that the page subscribes on load, unsubscribes on unload, displays a full-screen `open-type="getPhoneNumber"` button when a `401` arrives, does not put the backend authentication message into `message`, saves a successful login payload, clears the login gate, resolves the pending auth event, and calls `loadCampaigns()`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="welfare.*login|welfare opens" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: FAIL because the welfare page has no auth-expiry subscription or phone-login gate.

- [ ] **Step 3: Implement the welfare gate**

Subscribe in `onLoad` and store the returned unsubscribe function on the page instance. On notification set `loginRequired: true`, `loading: false`, and clear `message`. Unsubscribe in `onUnload`. Add a full-screen WXML button that calls `loginWithPhone`, and match the existing Xiaowanzi/WebView login-gate visual treatment in page-local WXSS. Implement `loginWithPhone` using `wx.login`, `POST /api/wechat-mini/login`, `setSession(payload)`, optional `getApp().setLoginSession(payload)`, `resolveAuthExpired()`, and `loadCampaigns()` after success. Authorization refusal and login failures keep the gate visible and write only to `loginMessage`.

- [ ] **Step 4: Keep non-auth errors unchanged**

In both welfare load and claim catches, return early for `statusCode === 401` after showing the login gate. Keep the current `404` and non-auth friendly error behavior. Do not retry a failed claim automatically after login.

- [ ] **Step 5: Run focused and full mini-program tests**

Run:

```bash
find apps/wechat-miniprogram -name '._*' -delete
node --test --test-name-pattern="welfare.*login|welfare opens" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
node --test apps/wechat-miniprogram/utils/request.authExpiry.test.mjs
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/wechat-miniprogram/pages/welfare/index.js apps/wechat-miniprogram/pages/welfare/index.wxml apps/wechat-miniprogram/pages/welfare/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "fix(miniprogram): open login on welfare auth expiry"
```

### Task 3: Cross-surface regression check

**Files:**
- Verify only: `frontend/src/services/api.ts`
- Verify only: `frontend/src/components/LoginModalProvider.tsx`
- Verify only: `apps/wechat-miniprogram/pages/webview/index.js`
- Verify only: `apps/wechat-miniprogram/pages/xiaowanzi/index.js`

**Interfaces:**
- Consumes existing Web `xf-show-login-modal` event.
- Consumes existing mini-program WebView and Xiaowanzi login gates.

- [ ] **Step 1: Run existing authentication regressions**

Run:

```bash
node --test frontend/src/services/api.authPersistence.test.mjs
node --test frontend/src/components/LoginModalProvider.mp-webview.test.mjs
node --test apps/wechat-miniprogram/utils/webview.static.test.mjs
```

Expected: all tests PASS without changing Web or WebView source.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff --check main...HEAD`

Expected: no whitespace errors. Confirm that no public-page entry guard, backend auth message, or write-operation replay was added.
