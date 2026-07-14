# Welfare Claim Link Direct Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the welfare claim dialog's “点击获取” button directly open a configured WeChat mini-program short link.

**Architecture:** Keep the existing `openClaimLink` implementation as the single owner of mini-program navigation and fallback behavior. Change only the conditional button binding so mini-program short links use `openClaimLink`, while ordinary links continue to use `copyClaimLink`.

**Tech Stack:** WeChat Mini Program WXML/JavaScript, Node.js built-in test runner

## Global Constraints

- Only `#小程序://` links use direct mini-program navigation.
- Ordinary HTTP links retain the existing copy behavior.
- Do not change backend fields, claim APIs, dialog styling, or other pages.

---

### Task 1: Route the Conditional Claim Button to the Correct Handler

**Files:**
- Modify: `apps/wechat-miniprogram/pages/welfare/index.wxml:88-90`
- Test: `apps/wechat-miniprogram/pages/welfare/index.test.mjs`

**Interfaces:**
- Consumes: `claimDialogIsMiniProgramLink: boolean`, existing page methods `openClaimLink()` and `copyClaimLink()`.
- Produces: A WXML button whose `catchtap` handler is selected from the link type.

- [ ] **Step 1: Write the failing test**

Add this assertion to the welfare page test:

```js
test("welfare claim link button opens mini-program links and copies ordinary links", () => {
  assert.match(
    wxml,
    /<button catchtap="\{\{claimDialogIsMiniProgramLink \? 'openClaimLink' : 'copyClaimLink'\}\}">\{\{claimDialogIsMiniProgramLink \? '点击获取' : '复制链接'\}\}<\/button>/
  );
  assert.doesNotMatch(
    wxml,
    /<button catchtap="copyClaimLink">\{\{claimDialogIsMiniProgramLink \? '点击获取' : '复制链接'\}\}<\/button>/
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test --test-name-pattern="opens mini-program links" apps/wechat-miniprogram/pages/welfare/index.test.mjs
```

Expected: FAIL because the button is still statically bound to `copyClaimLink`.

- [ ] **Step 3: Implement the minimal WXML change**

Replace the button with:

```xml
<button catchtap="{{claimDialogIsMiniProgramLink ? 'openClaimLink' : 'copyClaimLink'}}">{{claimDialogIsMiniProgramLink ? '点击获取' : '复制链接'}}</button>
```

- [ ] **Step 4: Run focused and page-level verification**

Run:

```bash
node --test apps/wechat-miniprogram/pages/welfare/index.test.mjs
node --test --test-name-pattern="welfare" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git diff --check -- apps/wechat-miniprogram/pages/welfare/index.wxml apps/wechat-miniprogram/pages/welfare/index.test.mjs
```

Expected: all selected tests pass and `git diff --check` emits no output.

- [ ] **Step 5: Commit the implementation**

```bash
git add apps/wechat-miniprogram/pages/welfare/index.wxml apps/wechat-miniprogram/pages/welfare/index.test.mjs docs/superpowers/plans/2026-07-14-welfare-claim-link-open.md
git commit -m "fix: open welfare mini links directly"
```
