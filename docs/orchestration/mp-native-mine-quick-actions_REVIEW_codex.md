# Mini Program Native Mine Quick Actions Review Ledger

## Round 1

### Blocking

- **B1: Quick-action icons render as raw Material Symbols ligature text in WeChat DevTools.**
  - Evidence: Orchestrator visual check on WeChat DevTools Stable v2.01.2510290, iPhone 15 Pro Max simulator, route `pages/mine/index`, showed the quick-action icon column as literal `badge`, `psychology`, and `settings` text beside `档案管理 / 记忆 / 设置`.
  - Relevant files:
    - `apps/wechat-miniprogram/pages/mine/index.wxml:36` renders `{{item.icon}}` inside `material-symbols-rounded`.
    - `apps/wechat-miniprogram/utils/profileState.js:78-82` stores `badge`, `psychology`, and `settings` ligature names.
    - `apps/wechat-miniprogram/assets/menu/line-badge.png`, `line-psychology.png`, and `line-settings.png` already exist and are used by the hamburger overlay through `apps/wechat-miniprogram/utils/nativeSettings.js:16-17`, `46`, and `52`.
  - Required fix: render quick-action icons with local image assets or another simulator-proven native mechanism; do not rely on raw Material Symbols text for this surface.

### Queued

- None.

### Advisory

- After the icon fix, update the static quick-actions test so it would catch raw ligature fallback on this page.

### Status

- Verdict: request-changes.

## Round 2

### Blocking

- **B2: Required full static suite is still red after the icon fix.**
  - AppleDouble files reappeared during local runs and must be absent before Verified status.
  - Additional current failures are in unrelated webview/share assertions inside `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`:
    - `webview detail wrapper keeps the native bottom menu below website content` expects `context.data.selected === 0` for `/materials`, but current `inferSelectedTab` maps `/materials` to selected tab `3`.
    - `share landing page is registered and uses the logo asset` expects `inferTargetTitle(target, fallback)`, which is not present in current `pages/share/index.js`.
  - These failures are outside the mine quick-actions product scope, but they block the required full-suite verification.

### Fixed

- **B1 fixed:** quick-action icons now use local image paths from `profileState.js` and render with `<image>` in `mine/index.wxml`, avoiding raw `badge` / `psychology` / `settings` ligature text.

### Queued

- None.

### Advisory

- Treat B2 as test triage first. Do not implement unrelated share/webview behavior unless the test is proven to represent an intended existing contract.

### Status

- Verdict: request-changes until B2 is resolved and the full suite is green.

## Round 2 Worker Fix

### Fixed

- **B1 code-level fix applied: quick-action icons no longer render Material Symbols ligature text.**
  - `apps/wechat-miniprogram/utils/profileState.js:78-82` now provides local image paths for `archive`, `memory`, and `settings`.
  - `apps/wechat-miniprogram/pages/mine/index.wxml:36` now renders `<image class="xf-mine-action-icon" src="{{item.image}}" mode="aspectFit" />`.
  - `apps/wechat-miniprogram/pages/mine/index.wxss:164-168` keeps a fixed `40rpx` image slot without font/ligature styling.
  - `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:2005-2010` asserts the image path contract, and `:2078-2079` asserts image rendering plus no `xf-mine-action-icon material-symbols-rounded` fallback.

### Remaining Verification Gap

- WeChat DevTools visual recheck was not run in this worker pass, so simulator-level acceptance remains pending.
- Required static tests pass in the final worker rerun. An earlier transient AppleDouble resource fork at `apps/wechat-miniprogram/pages/mine/._index.wxss` caused one failed run, but final `find apps/wechat-miniprogram -name '._*' -print` returned no paths and the worker did not run a delete command.

### Status

- Verdict: ready-for-review; simulator-level visual acceptance still needs WeChat DevTools recheck.

## Round 3 B2 Test Triage

### Fixed

- **B2 static-suite blocker triaged without expanding product scope.**
  - `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` already reflects the current `/materials` native tab contract: the webview wrapper test now asserts `context.data.selected === 3`, matching `inferSelectedTab('/materials')`.
  - `apps/wechat-miniprogram/pages/share/index.js` already defines `inferTargetTitle(target, fallback)` and the share landing test passes against that contract.
  - The full suite also exposed a test harness gap in `topics tab blocks unfinished topics from opening a generated detail page`: the completed-topic branch calls `openWeb`, which legitimately reads `wx.getStorageSync` through `getToken()`. The test stub now returns an empty token instead of crashing.
  - The remaining filesystem blocker was `docs/orchestration/._mp-native-mine-quick-actions_REVIEW_codex.md`, confirmed by `file` as `AppleDouble encoded Macintosh file`; it was removed as explicit cleanup, not hidden inside test code.

### Test Vs Code Decision

- Treated the webview/share failures as stale review state rather than product-code failures because the current source and focused/full test output both agree with existing behavior.
- Treated the topics failure as test drift because production code already uses the shared `openWeb` helper and the test needed the same minimal `wx.getStorageSync` surface provided by the file-level default stub.
- Did not edit `/pages/mine` quick-action route behavior or visual contract.
- Did not edit backend or web frontend.

### Verification

- Final verification to trust is the worker's fresh command output after this section was added.

### Status

- Verdict: approve for B2 static verification if final `find` returns no AppleDouble paths and both required `node --test` commands pass.

## Round 4 B2 Follow-up

### Fixed

- **Stale Xiaowanzi WXML assertion updated to the current product contract.**
  - Current `apps/wechat-miniprogram/pages/webview/index.wxml` renders the Xiaowanzi super webview native topbar with `xf-xiaowanzi-native-topbar`, `xf-xiaowanzi-native-back`, `xf-xiaowanzi-native-actions`, `xf-xiaowanzi-native-menu`, `xf-xiaowanzi-native-avatar`, `xf-xiaowanzi-native-title`, and `xf-xiaowanzi-native-agent`.
  - The stale `xf-xiaowanzi-web-close` / `aria-label="关闭"` expectation in `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` has been replaced with assertions for the native topbar/back/title/webview-offset contract.
  - No product WXML/WXSS/JS was changed.

### AppleDouble Inventory

- AppleDouble sidecars are still present in docs/orchestration in the final required `find` output:
  - `docs/orchestration/._mp-native-mine-quick-actions_IMPL_omp.md`
  - `docs/orchestration/._mp-native-mine-quick-actions_REVIEW_codex.md`
- `apps/wechat-miniprogram/pages/webview/._index.js` was seen in the initial pre-edit `find`, but was not present in the final required `find` output.
- `apps/wechat-miniprogram/pages/._tab-webview.static.test.mjs` appeared during intermediate verification, but was not present in the final required `find` output.
- The test code still correctly treats mini-program sidecars as a package blocker; no deletion logic was added to the test harness.

### Status

- Verdict: approve for this narrow B2 follow-up. The stale Xiaowanzi assertion is fixed, and both required `node --test` commands pass. Remaining AppleDouble output is limited to docs sidecars outside the mini-program package test scope.
