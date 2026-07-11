# 及阅可购买卡片标签筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让可购买及阅卡片的主题标签点击筛选，同时保留卡片其余区域的购买跳转。

**Architecture:** 删除 WXML 中按 `miniProgramShortLink` 将标签降级为普通文本的分支，所有主题标签统一复用现有 `catchtap="onReadingTagTap"`。卡片根节点继续使用 `bindtap="openBook"`，由 `catchtap` 自然隔离标签筛选和购买跳转。

**Tech Stack:** 微信小程序 WXML、Node.js `node:test` 静态测试。

## Global Constraints

- 主题标签点击只筛选，不触发购买跳转。
- 卡片其余区域和购物车按钮继续跳转购买。
- 推荐方文字不参与筛选。
- 不修改筛选算法或购买链接处理。

---

### Task 1: 统一可购买卡片主题标签交互

**Files:**
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- Modify: `apps/wechat-miniprogram/pages/reading/index.wxml`

**Interfaces:**
- Consumes: `onReadingTagTap(event)` 和卡片 `openBook(event)`。
- Produces: 所有 `item.displayTags` 统一携带 `data-tag="{{tag}}"` 与 `catchtap="onReadingTagTap"`。

- [ ] **Step 1: 写失败测试**

将原来断言购买标签为普通文本的测试改为断言 `displayTags` 内不存在 `wx:if="{{item.miniProgramShortLink}}"` 分支，并断言统一标签节点包含 `data-tag` 和 `catchtap`。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: FAIL，当前 WXML 仍包含购买标签普通文本分支。

- [ ] **Step 3: 写最小实现**

删除购买标签的条件节点及 `wx:else`，保留一个统一的主题标签节点；不修改 JavaScript。

- [ ] **Step 4: 验证**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: PASS，失败数为 0。

Run: `node --check apps/wechat-miniprogram/pages/reading/index.js`

Expected: exit 0。

Run: `git diff --check -- apps/wechat-miniprogram/pages/reading/index.wxml apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: exit 0。
