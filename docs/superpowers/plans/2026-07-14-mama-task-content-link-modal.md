# Mama Task Content Link Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken in-mini-program Feishu navigation with a reference-matching modal whose URL can be copied by long press.

**Architecture:** Keep the existing per-assignment `contentUrl` data contract unchanged. The Mama Haozhuan page owns one boolean modal state; tapping the existing entry opens a custom WXML dialog, and the URL is rendered with `user-select="true"` instead of calling WebView navigation or the clipboard API.

**Tech Stack:** WeChat Mini Program JavaScript, WXML, WXSS, Node.js static tests.

## Global Constraints

- Only change the Mama Haozhuan mini-program task-detail surface and its focused test/documentation.
- Preserve backend/admin import behavior and the existing per-assignment `contentUrl` contract.
- Do not modify unrelated dirty mini-program files.
- User-visible copy remains Chinese.

---

### Task 1: Replace direct navigation with the selectable-link dialog

**Files:**
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.js`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxss`
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Consumes: `currentMamaTask.contentUrl: string` and `currentMamaTask.hasContentUrl: boolean`.
- Produces: `taskContentLinkOpen: boolean`, `openMamaTaskContent()`, and `closeMamaTaskContent()`.

- [x] **Step 1: Write the failing static regression test**

Assert that the page opens/closes a custom modal, exposes the URL through selectable text, contains the approved “资料链接” and “长按可复制：” copy, and no longer contains `wx.navigateTo` or `wx.setClipboardData` in `openMamaTaskContent()`.

- [x] **Step 2: Run the focused test and verify the new assertion fails**

Run: `node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

Expected: FAIL because `taskContentLinkOpen`, `closeMamaTaskContent`, and the selectable link dialog do not exist yet.

- [x] **Step 3: Implement the minimal dialog behavior**

Add `taskContentLinkOpen: false` to page data. Make `openMamaTaskContent()` set it to true only when the current task has a non-empty URL, and add `closeMamaTaskContent()` to reset it. Render the approved white modal card with a close button, task name, “长按可复制：”, and `<text user-select="true">{{currentMamaTask.contentUrl}}</text>`.

- [x] **Step 4: Add scoped modal styling**

Reuse `.xf-mama-dialog-mask` and add content-link-specific card, label, and selectable URL styles matching the supplied purple/white reference.

- [x] **Step 5: Run focused and adjacent static verification**

Run: `node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: both suites PASS.

- [x] **Step 6: Update the active snapshot**

Rewrite the Mama Haozhuan sentence in `docs/ACTIVE_CONTEXT.md` so it states that assigned users copy their private content link from a modal and open it externally.
