# Mini Program Native Mine Quick Actions Implementation

## Files Changed

- `apps/wechat-miniprogram/pages/mine/index.wxml`
- `apps/wechat-miniprogram/pages/mine/index.wxss`
- `apps/wechat-miniprogram/utils/profileState.js`
- `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- `docs/orchestration/mp-native-mine-quick-actions_IMPL_omp.md`
- `docs/orchestration/mp-native-mine-quick-actions_REVIEW_codex.md`

## Implementation

- Replaced quick-action Material Symbols ligature data with local image paths:
  - `/assets/menu/line-badge.png`
  - `/assets/menu/line-psychology.png`
  - `/assets/menu/line-settings.png`
- Rendered `/pages/mine/index` quick-action icons with native `<image>` nodes instead of text ligatures.
- Kept each `/pages/mine/index` quick action subtitle from the existing `quickActions` data.
- Tightened quick-action rows from the previous product-card feel into a compact white grouped list:
  - `88rpx` minimum row height;
  - fixed `40rpx` local image icon slot;
  - single-line title and subtitle ellipsis;
  - fixed-width centered chevron.
- Kept the existing `data-key="{{item.key}}"` and `bindtap="handleQuickAction"` contract.
- Did not change `/pages/mine/index.js` route methods.

## Tests

- RED check:
  - `node --test --test-name-pattern "mine quick actions" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Failed before implementation because the quick action WXML still rendered `<text class="xf-mine-action-icon material-symbols-rounded">{{item.icon}}</text>`.
- GREEN check:
  - `node --test --test-name-pattern "mine quick actions" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - PASS: 1 matching test passed, 41 skipped.
- `node --check apps/wechat-miniprogram/pages/mine/index.js`
  - PASS: exit 0.
- `node --check apps/wechat-miniprogram/utils/profileState.js`
  - PASS: exit 0.
- `node --test --test-name-pattern "mine quick actions|mine profile actions|AppleDouble" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - PASS: 3 matching tests passed, 39 skipped.
- `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - PASS: 42 passed / 0 failed.

## AppleDouble Files Reported

- Final `find apps/wechat-miniprogram -name '._*' -print` returned no paths.
- Earlier in this pass, `apps/wechat-miniprogram/pages/mine/._index.wxss` appeared during a static-test run and caused the AppleDouble assertion to fail. It was not deleted by this worker, and it was absent on the final `find` plus final rerun.

## WeChat DevTools Visual Check

- Not run in this worker pass.
- Pending orchestrator visual check after static verification.

## Intentionally Left Unchanged

- Quick-action item count and order remain `档案管理 / 记忆 / 设置`.
- Archive still opens `/pages/mine/archive/index`.
- Memory still requires login and then opens `/pages/mine/memory/index`.
- Settings still uses the current settings web-panel contract.

## B2 Test Triage Follow-up

- No product-code change was needed for the Round 2 webview/share failures:
  - `/materials` webview wrapper selection is currently `3`, matching the native materials tab.
  - `pages/share/index.js` currently includes `inferTargetTitle(target, fallback)`.
- Updated only the static test harness for the completed-topic branch so `openWeb -> getToken()` can read an empty `wx.getStorageSync` value during the test.
- Removed the explicit AppleDouble sidecar reported at `docs/orchestration/._mp-native-mine-quick-actions_REVIEW_codex.md`.
- Required verification should be judged by the final fresh worker rerun, not the stale Round 2 failure notes.

## Round 2 B2 Follow-up

- No product WXML/WXSS/JS change was needed for the Xiaowanzi super webview failure.
- Updated only `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` so the Xiaowanzi webview test matches the current native topbar contract in `apps/wechat-miniprogram/pages/webview/index.wxml`:
  - `xf-xiaowanzi-native-topbar`
  - `xf-xiaowanzi-native-back` with `aria-label="返回"`
  - `xf-xiaowanzi-native-actions`
  - `xf-xiaowanzi-native-menu`
  - `xf-xiaowanzi-native-avatar`
  - `xf-xiaowanzi-native-title`
  - `xf-xiaowanzi-native-agent`
- The test now explicitly rejects the old `xf-xiaowanzi-web-close` close-overlay contract.
- AppleDouble sidecars observed during this follow-up:
  - Initial pre-edit `find` reported:
    - `apps/wechat-miniprogram/pages/webview/._index.js`
    - `apps/wechat-miniprogram/pages/._tab-webview.static.test.mjs`
  - Final required `find apps/wechat-miniprogram docs/orchestration -name '._*' -type f -print` reported only docs sidecars:
    - `docs/orchestration/._mp-native-mine-quick-actions_IMPL_omp.md`
    - `docs/orchestration/._mp-native-mine-quick-actions_REVIEW_codex.md`
- Per follow-up scope, no AppleDouble deletion logic was added to tests.
- The focused Xiaowanzi/mine/AppleDouble pattern and full `tab-webview.static.test.mjs` suite both passed after the mini-program sidecars disappeared.
