# 小程序底栏小玩子图标对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保持小玩子图标为 `48px`，并将其可见底边与其他 `22px` 底栏图标对齐。

**Architecture:** 沿用现有自定义底栏结构，只在小玩子专属承载层增加 `translateY(-26px)`。静态测试锁定尺寸和位移契约，不修改其他四个导航项或点击区域。

**Tech Stack:** 微信小程序 WXML/WXSS、Node.js `node:test` 静态回归测试。

## Global Constraints

- 小玩子图标和承载层保持 `48px × 48px`。
- 仅小玩子承载层上移 `26px`。
- 底栏高度、五等分布局、按钮点击区域、按压动画、跳转和其他图标保持不变。
- 不替换图片素材。

---

### Task 1: 锁定并实现图标底边对齐

**Files:**
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:306-313`
- Modify: `apps/wechat-miniprogram/custom-tab-bar/index.wxss:54-81`

**Interfaces:**
- Consumes: `.xf-custom-tabbar__xiaowanzi-core` 现有专属承载层。
- Produces: `.xf-custom-tabbar__xiaowanzi-core { transform: translateY(-26px); }` 样式契约。

- [ ] **Step 1: 写失败的静态回归断言**

在底栏样式断言中加入：

```js
assert.match(wxss, /\.xf-custom-tabbar__xiaowanzi-core \{[\s\S]*transform: translateY\(-26px\);/);
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: FAIL，新增断言找不到 `.xf-custom-tabbar__xiaowanzi-core` 的 `translateY(-26px)`。

- [ ] **Step 3: 添加最小样式实现**

在共同 core 规则之后添加专属规则：

```css
.xf-custom-tabbar__xiaowanzi-core {
  transform: translateY(-26px);
}
```

- [ ] **Step 4: 运行聚焦测试并确认通过**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: PASS，0 failures。

- [ ] **Step 5: 检查差异与格式**

Run:

```bash
git diff --check
git diff -- apps/wechat-miniprogram/custom-tab-bar/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: `git diff --check` 无输出；差异只包含一个测试断言和一个专属样式规则。

- [ ] **Step 6: 微信开发者工具视觉验证**

打开任一显示自定义底栏的页面，确认：小玩子可见图形底边与普通图标底边对齐，`48px` 尺寸未改变，五个点击入口仍可用。

- [ ] **Step 7: 提交实现**

```bash
git add apps/wechat-miniprogram/custom-tab-bar/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "fix: align Xiaowanzi tab icon"
```
