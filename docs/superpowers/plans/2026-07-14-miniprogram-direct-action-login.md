# Mini-program Direct Action Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for each task and `superpowers:verification-before-completion` before claiming completion.

**Goal:** Remove every visible intermediate login card in the WeChat mini-program so the first tap on a protected action directly invokes `getPhoneNumber`, while preserving public browsing and safely resuming only the initiating action.

**Architecture:** Keep `components/phone-login-gate` as the shared login request/session executor, but render its `getPhoneNumber` button at the protected action site instead of opening its modal layer. Each page stores at most one explicit pending action and consumes it once after the component emits `success`. Page entry and HTTP 401 responses only update logged-out state; they never attempt to open authorization without a user gesture. Payment and destructive actions stop at their existing confirmation boundary after login.

**Tech Stack:** WeChat mini-program WXML/CommonJS, Node.js `node:test`, existing request/session/auth-expiry utilities.

## Global Constraints

- Public content remains visible when logged out.
- The first protected-action tap must be the `open-type="getPhoneNumber"` button gesture.
- Authorization rejection or login failure stays on the current page and surfaces a toast or inline error.
- A pending action is cleared before replay so success events cannot run it twice.
- Pro authorization must not create an order or start payment automatically.
- Delete and other irreversible actions must still show their existing confirmation after login.
- Do not change web login behavior or backend authentication contracts in this workstream.

---

## Task 1: Make the shared phone-login executor safe for headless use

**Files:**
- Modify: `apps/wechat-miniprogram/components/phone-login-gate/index.js`
- Modify: `apps/wechat-miniprogram/components/phone-login-gate/index.wxml`
- Modify: `apps/wechat-miniprogram/components/phone-login-gate/index.test.mjs`

- [ ] Add failing tests that expect a `failure` event for missing phone code, missing `wx.login` code, `wx.login` failure, and `/api/wechat-mini/login` rejection.
- [ ] Add a test proving the component can render a caller-owned authorization button without requiring `visible=true`; retain one and only one `getPhoneNumber` binding per rendered action.
- [ ] Run the focused test and confirm RED:

```bash
cd apps/wechat-miniprogram && node --test components/phone-login-gate/index.test.mjs
```

- [ ] Emit `failure` with `{ message, reason }` from every failed login path while preserving the existing internal message for compatibility.
- [ ] Keep session persistence, `resolveAuthExpired()`, and the `success` event unchanged.
- [ ] Run the focused test and confirm GREEN.
- [ ] Commit only this task:

```bash
git add apps/wechat-miniprogram/components/phone-login-gate
git commit -m "fix: expose direct phone login failures"
```

## Task 2: Convert Pro subscription entry to direct authorization

**Files:**
- Modify: `apps/wechat-miniprogram/pages/pro/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/pro/index.js`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

- [ ] Replace assertions expecting `bindtap="showLoginGate"` with assertions that the logged-out subscription button itself uses `open-type="getPhoneNumber"` and calls the shared login executor.
- [ ] Add an assertion that `handleLoginSuccess` refreshes billing/account state but does not call `createOrder`.
- [ ] Run the Pro-related static tests and confirm RED:

```bash
cd apps/wechat-miniprogram && node --test --test-name-pattern="Pro|subscription|pay dock" pages/tab-webview.static.test.mjs
```

- [ ] Convert the logged-out “立即订阅” button into the direct phone authorization button; remove `loginRequired` modal presentation and `showLoginGate` from this route.
- [ ] On success, keep the selected plan, refresh account/billing state, and leave the user on the confirmation-capable subscription screen.
- [ ] On failure, show a current-page toast; do not change the selected plan.
- [ ] Run the focused tests and commit:

```bash
git add apps/wechat-miniprogram/pages/pro/index.js apps/wechat-miniprogram/pages/pro/index.wxml apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "fix: authorize pro subscriptions on first tap"
```

## Task 3: Convert Worthbuy analysis and history actions

**Files:**
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.js`
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs`

- [ ] Add failing tests for direct authorization on submit/history, one-shot `pendingWorthBuyAction`, preserved input, and no visible login gate.
- [ ] Add a failure test that reports login rejection without clearing the analysis input.
- [ ] Run and confirm RED:

```bash
cd apps/wechat-miniprogram && node --test pages/worthbuy/index.static.test.mjs
```

- [ ] Render logged-out submit/history controls as `getPhoneNumber` buttons and record `{ type: "analysis" }` or `{ type: "history" }` immediately before passing the event to the shared executor.
- [ ] Consume the pending action once on success: analysis calls the existing validated `submitAnalysis`; history toggles and loads personal history.
- [ ] Treat a later 401 as logged-out state plus inline error; do not display a modal login card.
- [ ] Keep history deletion behind its existing confirmation modal; if a stale session is encountered, require a fresh explicit tap rather than replay deletion automatically.
- [ ] Run the focused tests and commit.

## Task 4: Convert Xiaowanzi from entry gate to action login

**Files:**
- Modify: `apps/wechat-miniprogram/pages/xiaowanzi/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/xiaowanzi/index.js`
- Modify: `apps/wechat-miniprogram/pages/xiaowanzi/index.static.test.mjs`

- [ ] Add failing tests proving logged-out users can see the Xiaowanzi page, the send and quick-prompt buttons are direct authorization gestures, and no visible `xiaowanziLoginRequired` gate remains.
- [ ] Add behavior tests for preserving typed text/attachments and replaying exactly one `send` action after successful login.
- [ ] Add a test that `onShow` does not request authorization or blank the public shell.
- [ ] Run the Xiaowanzi focused test and confirm RED.
- [ ] Change `requireXiaowanziLogin()` into a state check that never raises a modal on page entry.
- [ ] Introduce a one-shot `pendingXiaowanziAction` for send/quick prompt and route logged-out action buttons through `getPhoneNumber`.
- [ ] On success, initialize the authenticated session first, then consume the pending send once without clearing composer content before submission.
- [ ] Keep history/archive/personal controls direct-authorized when their data is account-bound; local public shell and prompts remain browseable.
- [ ] On rejection, show a toast and preserve the composer.
- [ ] Run focused tests and commit.

## Task 5: Convert Mama Resource actions without restoring a login-only page

**Files:**
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.js`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

- [ ] Add failing tests that logged-out state renders the existing public/apply shell rather than an empty `mamaResourceView === "login"` block or visible login gate.
- [ ] Add direct authorization tests for save profile, claim task, and submit proof.
- [ ] Add one-shot replay tests: safe saves may resume once; task claim resumes once; proof submission preserves entered link/screenshot.
- [ ] Run the Mama Resource focused test and confirm RED.
- [ ] Replace `mamaResourceView: "login"` transitions with an explicit logged-out flag plus the appropriate public/apply/detail view already available to the user.
- [ ] Add `pendingMamaResourceAction` carrying only the action type and stable task id; read current form values only when replaying.
- [ ] Route protected buttons through direct phone authorization and consume the pending action once after `onNativeSettingsLoginSuccess` finishes loading account state.
- [ ] Convert 401 handling to logged-out state and an inline message, without opening a login card.
- [ ] Run focused tests and commit.

## Task 6: Convert native WebView expert actions and eliminate login-entry overlays

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/webview/index.js`
- Modify: `apps/wechat-miniprogram/utils/webview.static.test.mjs`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- Inspect and modify only confirmed callers from: `apps/wechat-miniprogram/pages/**/*.js`

- [ ] Inventory every caller that navigates to `/pages/webview/index?...login=1`; record the exact caller list in the test description before editing.
- [ ] Add failing tests that the native expert login/send action is itself a `getPhoneNumber` gesture, typed/suggested questions survive login, and no visible `webviewLoginRequired` gate remains.
- [ ] Replace old tests that expect `options.login === "1"` to display a gate with tests that entry state remains visible and logged-out.
- [ ] Run WebView tests and confirm RED:

```bash
cd apps/wechat-miniprogram && node --test utils/webview.static.test.mjs pages/tab-webview.static.test.mjs
```

- [ ] Add a one-shot `pendingWebviewAction` for native expert questions; success reloads the expert session and submits the preserved question once.
- [ ] Make 401 and `login=1` update auth state only. Where a caller requires authentication before opening a pure web page, move direct `getPhoneNumber` authorization to that caller’s explicit entry button.
- [ ] On rejection, remain on the current native page and show a toast.
- [ ] Run focused tests and commit.

## Task 7: Global regression guard and documentation closeout

**Files:**
- Add or modify: `apps/wechat-miniprogram/utils/direct-action-login.static.test.mjs`
- Modify: `docs/superpowers/specs/2026-07-14-miniprogram-direct-action-login-design.md` only if implementation reveals an approved clarification
- Modify: `docs/ACTIVE_CONTEXT.md`

- [ ] Add a static inventory test for protected-action pages that rejects visible `phone-login-gate` bindings and legacy `showLoginGate` tap handlers.
- [ ] Add positive assertions for direct `getPhoneNumber` ownership on Pro, Worthbuy, Xiaowanzi, Mama Resource, WebView expert, and Welfare actions.
- [ ] Confirm all pending-action success handlers clear pending state before replay and payment handlers never auto-run.
- [ ] Run the complete mini-program test suite:

```bash
cd apps/wechat-miniprogram && node --test
```

- [ ] Run the package validation/build command defined by the repository package scripts.
- [ ] Open the real routes in WeChat Developer Tools and verify on a logged-out simulator/device:
  - first protected tap immediately opens the bottom WeChat authorization sheet;
  - rejection leaves content and input intact;
  - successful Worthbuy/Xiaowanzi/expert actions resume once;
  - successful Pro login does not create an order;
  - no page-entry white login card appears.
- [ ] Rewrite `docs/ACTIVE_CONTEXT.md` as the concise closed-workstream snapshot, noting any real-device-only authorization behavior not verified locally.
- [ ] Run `git diff --check`, inspect `git status --short`, and commit the regression guard/docs.

## Plan Self-review

- Spec coverage: public browsing, first-tap native authorization, one-shot continuation, rejection behavior, 401 behavior, and payment/destructive boundaries are assigned to explicit tasks.
- Placeholder scan: no implementation placeholder or unowned “handle globally” step remains; the only inventory-dependent edit is constrained to confirmed `login=1` callers in Task 6.
- Type/state consistency: every page uses one nullable pending-action object, clears it before replay, and leaves credentials/session ownership in the shared component.
- Scope guard: backend APIs, web login, payment creation, and unrelated UI are outside scope.
