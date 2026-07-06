# Mini Program Native Profile Menu Implementation

## What Changed

- Added mine-page-specific settings drawer classes in `apps/wechat-miniprogram/pages/mine/index.wxml` while preserving the existing `data-section-index` / `data-item-index` lookup path.
- Added local `/mine` drawer style overrides in `apps/wechat-miniprogram/pages/mine/index.wxss`:
  - wider right drawer width for mobile-web-like profile menu rhythm
  - account row first, then grouped white cards on the light background
  - removed the extra inherited card bottom margin so group spacing is consistent
  - compact `96rpx` menu rows, `40rpx` icons, fixed chevron width, and single-line ellipsis labels
- Added focused static assertions in `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` for:
  - native settings section ordering
  - `/mine` overlay-specific WXML class contract
  - compact drawer spacing, icon, label, and chevron CSS contract
- Review follow-up: changed the AppleDouble package check in `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` from cleanup-on-run behavior to a read-only assertion. It now detects `._*` files via `walkFiles` and reports them without deleting workspace files.

`apps/wechat-miniprogram/utils/nativeSettings.js` was inspected but not changed. Its current menu ordering already matches the goal and its route behavior still keeps tab pages on `switchTab`, native subpages on `navigateTo`, and web-only paths on `openWeb`.

## Verified

- Red check before implementation:
  - `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Failed as expected on the new mine drawer contract because `xf-mine-settings-mask` was not present yet.
- Syntax:
  - `node --check apps/wechat-miniprogram/pages/mine/index.js` passed.
  - `node --check apps/wechat-miniprogram/utils/nativeSettings.js` passed.
- Focused static contract:
  - `node --test --test-name-pattern "mine hamburger settings drawer" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` passed.
- Full static contract:
  - `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` passed in orchestrator verification with `39/39` tests passing.
- Review follow-up verification after making the AppleDouble check read-only:
  - Removed AppleDouble sidecars generated during local editing/inspection.
  - `node --test --test-name-pattern "AppleDouble|mine profile actions|mine hamburger settings drawer|only explicit web page boundaries" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` passed.
  - `node --test --test-name-pattern "hamburger secondary entries|hamburger expert entry|AppleDouble" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` passed.
  - `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` passed with `39/39` tests passing.
- WeChat DevTools visual check:
  - Opened `/Volumes/家长先疯/xianfeng/apps/wechat-miniprogram` in WeChat DevTools Stable v2.01.2510290.
  - Confirmed the iPhone 15 Pro Max simulator shows the native menu overlay on `pages/programs/index`.
  - Observed account row, grouped menu cards, `妈妈好赚`, `记忆`, and `设置` in the native overlay accessibility tree; screenshot viewport visibly reaches `记忆`, with `设置` below the fold.

## Not Verified

- Worker session did not run WeChat DevTools; orchestrator performed the simulator check afterward.
- No standalone screenshot artifact was saved to disk.
- The worker initially saw older full-suite failures during the review follow-up; orchestrator cleaned the detected AppleDouble sidecars, aligned the archive subpage assertion with the current native archive page, and re-ran the suite successfully.

## Remaining Assumptions And Risks

- The visual values were checked in WeChat DevTools on iPhone 15 Pro Max, but still need final human acceptance against the supplied mobile-web screenshot.
- `订阅计划` remains visible in the mini-program menu because the current native settings data already does that and the goal said to preserve route behavior unless explicitly changed.
- `nativeSettings.js` is currently untracked in this working tree; this pass did not normalize or stage that broader dirty-tree state.
