# Mini Program Tabbar Xiaowanzi Icon Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enlarge the mini-program custom tabbar Xiaowanzi icon from 42px to 48px so its visible proportion more closely matches the mobile Web tabbar.

**Architecture:** Keep the existing custom tabbar markup, image assets, layout, and interaction unchanged. Lock the selected 48px size in the existing static contract test, then update only the Xiaowanzi icon and orb dimensions in WXSS.

**Tech Stack:** WeChat Mini Program WXML/WXSS, Node.js built-in test runner

## Global Constraints

- Keep the existing Xiaowanzi image asset.
- Do not change the tabbar height, five-column layout, click target, pressed animation, navigation behavior, or the other four icons.
- Set both the Xiaowanzi icon and its orb to exactly `48px × 48px`.

---

### Task 1: Lock and implement the 48px Xiaowanzi icon size

**Files:**
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:309-312`
- Modify: `apps/wechat-miniprogram/custom-tab-bar/index.wxss:78-91`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: Existing selectors `.xf-custom-tabbar__icon.is-xiaowanzi-icon` and `.xf-custom-tabbar__orb`.
- Produces: A static style contract requiring both selectors to use `48px` width and height.

- [ ] **Step 1: Write the failing static contract**

Replace the existing Xiaowanzi size assertion and add an orb assertion:

```js
assert.match(wxss, /\.xf-custom-tabbar__icon\.is-xiaowanzi-icon \{[\s\S]*width: 48px;[\s\S]*height: 48px;/);
assert.match(wxss, /\.xf-custom-tabbar__orb \{[\s\S]*width: 48px;[\s\S]*height: 48px;/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: FAIL because `index.wxss` still declares `42px` for the Xiaowanzi icon and orb.

- [ ] **Step 3: Implement the minimum WXSS change**

Update only the two Xiaowanzi-specific size declarations:

```css
.xf-custom-tabbar__icon.is-xiaowanzi-icon {
  width: 48px;
  height: 48px;
}

.xf-custom-tabbar__orb {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  box-shadow: none;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: PASS with no failed tests.

- [ ] **Step 5: Check the scoped diff**

Run:

```bash
git diff --check -- apps/wechat-miniprogram/custom-tab-bar/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git diff -- apps/wechat-miniprogram/custom-tab-bar/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: no whitespace errors; the diff contains only the two `42px` to `48px` declarations and the matching test contract.

- [ ] **Step 6: Commit the scoped implementation**

```bash
git add apps/wechat-miniprogram/custom-tab-bar/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "fix(miniprogram): enlarge Xiaowanzi tab icon"
```

