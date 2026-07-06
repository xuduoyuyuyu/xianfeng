# Mini-program Profile Half-panel Subflows - Implementation Report

## What Changed

- Shared native settings drawers now keep `档案管理 / 记忆 / 设置` inside the existing half-panel instead of right-pushing a new page or opening a web route.
- Added reusable named in-panel profile templates at `apps/wechat-miniprogram/templates/settings-profile-views.wxml`.
- Replaced include-based subview rendering with explicit `<template is="...">` branches and data binding on first-level native pages. This fixes the blank half-panel case where the drawer opened but the subview body did not render in the simulator.
- Added `settingsPanelView` state for supported native half-panels:
  - `menu` shows the original menu list.
  - `archive`, `memory`, and `settings` render the corresponding in-panel content.
  - `← 返回` returns to `menu`; closing the mask resets to `menu`.
- Shared `utils/nativeSettings.js` now owns the profile subview loaders and switches only when the current page declares `settingsProfilePanelSupported: true`.
- First-level native pages wired to the shared in-panel interaction:
  - `programs`
  - `reading`
  - `materials`
  - `topics`
  - `search`
  - `pro`
  - `mama-resource-apply`
  - `mine`
- Webview/cover-view wrappers remain fallback-only because they cannot directly host the same normal-view form/scroll structure.
- Updated static tests for the new in-panel interaction contract and for the current native/web-view boundaries.

## What Verified

- `node --check apps/wechat-miniprogram/pages/mine/index.js`
- `node --check apps/wechat-miniprogram/utils/nativeSettings.js`
- `node --check` for changed native pages:
  - `programs`, `reading`, `materials`, `topics`, `search`, `pro`, `mama-resource-apply`, `mine`
- Targeted regression first failed on missing shared subviews, then passed after implementation:
  - `COPYFILE_DISABLE=1 node --test --test-name-pattern "shared native settings drawer renders profile subviews|hamburger profile entries stay inside|fallback routes" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- Full static regression:
  - `COPYFILE_DISABLE=1 node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Passed 52/52.
- WeChat DevTools preview compile:
  - `/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project /Volumes/家长先疯/xianfeng/apps/wechat-miniprogram --qr-format terminal`
  - Passed, preview package size about 1.2 MB.
- Manual WeChat DevTools simulator click-through on `pages/topics/index`:
  - Opened the settings half-panel from the top-left menu.
  - Clicked `记忆`, `档案管理`, and `设置`.
  - All three rendered their content inside the existing half-panel; no blank white panel remained.

## Not Verified

- Real backend persistence for memory/account deletion was not expanded or verified.

## Remaining Risks

- The archive form inside the half-panel currently prioritizes interaction parity and visible structure; deeper editable field interactions may need a follow-up pass if users expect full form editing inside the drawer.
- Webview/cover-view overlay pages keep fallback route behavior for profile entries unless they are rebuilt with a compatible normal-view overlay.
