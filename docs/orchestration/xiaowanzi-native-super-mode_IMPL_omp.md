# Xiaowanzi Native Super Mode - Implementation Report

## What changed

- `apps/wechat-miniprogram/pages/xiaowanzi/index.*`
  - Added a mini-program native shell for Xiaowanzi super mode: native top area, child association card, add-child entry, share sheet, skeleton/loading state, and an explicit lower webview chat-core boundary.
  - Kept the existing streaming chat core in the webview for this pass. The webview is visually subordinate and starts below the native shell.
  - Changed child select/save behavior so it updates `xiaowanzi_last_child_id_v1` and `xiaowanzi_chat_context_v1` without `reLaunch` and without resetting `src`.
  - Preserved existing web-to-native archive actions from `bindmessage` and `xf_native_action`.
- `apps/wechat-miniprogram/pages/topics/index.*`
  - Added a compact native share button on topic cards while leaving topic detail open behavior on `openWeb(topic.path, topic.title, { userId })`.
  - Added topic-specific share payloads that land through the native share page and strip sensitive web params such as `xf_token`, `token`, `secret`, and `userId`.
- `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Updated Xiaowanzi ownership tests from immersive full-page webview to native-shell-plus-explicit-webview-boundary.
  - Added child switch/save no-refresh assertions.
  - Added topic card native share payload sanitization assertions.

## Verified

- Red-green focused test flow:
  - Initial focused run failed as expected because Xiaowanzi had no native shell and topic card share still returned the default page share.
  - After implementation:
    - `COPYFILE_DISABLE=1 node --test --test-name-pattern "Xiaowanzi tab page uses a native shell|topics cards share native landing paths" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
    - Result: exit 0, 2 matching tests passed.
- Syntax checks:
  - `node --check apps/wechat-miniprogram/pages/xiaowanzi/index.js`
  - `node --check apps/wechat-miniprogram/pages/topics/index.js`
  - `node --check apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Result: all exit 0.
- Focused static test file:
  - `COPYFILE_DISABLE=1 node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Result: 66 passed, 1 failed.
  - The only failing subtest is `mini program package does not include AppleDouble resource fork files`, due to existing/generated `._*` files listed below.
- AppleDouble scan:
  - `find apps/wechat-miniprogram -name '._*' -print`
  - Found:
    - `apps/wechat-miniprogram/pages/xiaowanzi/._index.js`
    - `apps/wechat-miniprogram/pages/xiaowanzi/._index.wxml`
    - `apps/wechat-miniprogram/pages/xiaowanzi/._index.wxss`
    - `apps/wechat-miniprogram/pages/topics/._index.js`
    - `apps/wechat-miniprogram/pages/topics/._index.wxml`
    - `apps/wechat-miniprogram/pages/topics/._index.wxss`
    - `apps/wechat-miniprogram/pages/webview/._index.js`
    - `apps/wechat-miniprogram/pages/._tab-webview.static.test.mjs`
- WeChat DevTools CLI:
  - `/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project /Volumes/家长先疯/xianfeng/apps/wechat-miniprogram`
  - Result: exit 0, preview succeeded, package size reported as 1.5 MB.

## Not verified

- Did not visually inspect the WeChat simulator or a real device route after preview.
- Did not scan or run broad frontend/backend tests outside the mini-program focused static surface.
- Did not delete AppleDouble files because the task explicitly said not to delete files.
- Did not migrate the streaming chat engine to native WXML/JS; it remains the explicit webview chat-core boundary.
- Did not deploy, push, open a PR, or touch production/server configuration.

## Risks

- The native shell can update local child storage/context without refreshing the webview, but the already-loaded web chat core cannot receive a native-to-web message through a documented mini-program channel in this pass. It will see the child bridge params on the next webview load; the current visible native shell updates immediately.
- `web-view` layering remains a real-device risk. The native shell positions the webview below the shell, but share/archive overlays still need simulator/device visual verification.
- AppleDouble files remain in the mini-program tree and block the package-clean static assertion. They may also confuse DevTools depending on compile mode.
- Git commands continue to report `error: non-monotonic index .git/objects/pack/._pack-...idx`; this was not repaired because it requires deleting `.git` AppleDouble files, which was outside the approved scope.

## Round 2 review fixes

### What changed

- Addressed P1 child-context review finding by making the non-refresh boundary explicit instead of pretending a native-to-mounted-webview bridge exists.
  - Verified from code that the current Xiaowanzi contract has URL-param initialization plus web-to-native `bindmessage`, but no native-to-web delivery channel that can update the mounted web chat core without changing `src`.
  - Child select/save still updates `xiaowanzi_last_child_id_v1`, `xiaowanzi_chat_context_v1`, and the native shell immediately.
  - Added visible native status copy: `已切换为{childName}，当前对话不刷新，新对话生效`.
  - Updated `docs/orchestration/xiaowanzi-native-super-mode_GOAL.md` to record this accepted first-pass boundary.
- Addressed P1 share-overlay review finding.
  - Removed the normal `view` share sheet and scrim above the mounted `web-view`.
  - Changed the topbar share control to direct native `open-type="share"`.
- Addressed P2 topic nested share encoding.
  - Encodes the nested `/pages/webview/index` `url`, `title`, and `topicId` params before placing that target inside `/pages/share/index`.
  - Preserves sanitized topic path query/hash while stripping sensitive params.
- Updated focused assertions in `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`.
  - Tests now require no normal share sheet overlay above Xiaowanzi `web-view`.
  - Tests now require the child-context boundary notice after select/save while preserving unchanged `src`.
  - Tests now parse nested topic share target params with `&/#/=` in topic title/path.

### Verified

- Focused red-green:
  - Before Round 2 implementation, focused tests failed on the old share overlay and broken nested topic target.
  - After Round 2 implementation:
    - `COPYFILE_DISABLE=1 node --test --test-name-pattern "Xiaowanzi tab page uses a native shell|topics cards share native landing paths" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
    - Result: exit 0, 2 matching tests passed.

### Not verified yet in Round 2

- WeChat DevTools simulator visual inspection and real-device verification were not run in Round 2.

### Round 2 verification

- Syntax checks:
  - `node --check apps/wechat-miniprogram/pages/xiaowanzi/index.js`
  - `node --check apps/wechat-miniprogram/pages/topics/index.js`
  - `node --check apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Result: all exit 0.
- Focused tests:
  - `COPYFILE_DISABLE=1 node --test --test-name-pattern "Xiaowanzi tab page uses a native shell|topics cards share native landing paths" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Result: exit 0, 2 matching tests passed.
- Full focused static file:
  - `COPYFILE_DISABLE=1 node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Result: 66 passed, 1 failed.
  - The only failing subtest remains `mini program package does not include AppleDouble resource fork files`.
- AppleDouble scan:
  - `find apps/wechat-miniprogram -name '._*' -print`
  - Still found:
    - `apps/wechat-miniprogram/pages/xiaowanzi/._index.js`
    - `apps/wechat-miniprogram/pages/xiaowanzi/._index.wxml`
    - `apps/wechat-miniprogram/pages/xiaowanzi/._index.wxss`
    - `apps/wechat-miniprogram/pages/topics/._index.js`
    - `apps/wechat-miniprogram/pages/topics/._index.wxml`
    - `apps/wechat-miniprogram/pages/topics/._index.wxss`
    - `apps/wechat-miniprogram/pages/webview/._index.js`
    - `apps/wechat-miniprogram/pages/._tab-webview.static.test.mjs`

## Orchestrator final verification

- Independent reviewer `codex` re-reviewed Round 2 and appended `approve` to `docs/orchestration/xiaowanzi-native-super-mode_REVIEW_codex.md`.
- Re-ran syntax checks:
  - `node --check apps/wechat-miniprogram/pages/xiaowanzi/index.js`
  - `node --check apps/wechat-miniprogram/pages/topics/index.js`
  - `node --check apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Result: all exit 0.
- Re-ran focused tests:
  - `COPYFILE_DISABLE=1 node --test --test-name-pattern "Xiaowanzi tab page uses a native shell|topics cards share native landing paths" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Result: exit 0, 2 matching tests passed.
- Re-ran full static mini-program test file:
  - `COPYFILE_DISABLE=1 node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - Result: exit 0, 67/67 passed.
- Re-ran AppleDouble scan:
  - `find apps/wechat-miniprogram -name '._*' -print`
  - Result: no output.
- Re-ran WeChat DevTools CLI preview:
  - `/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project /Volumes/家长先疯/xianfeng/apps/wechat-miniprogram`
  - Result: exit 0, preview succeeded, package size 1.5 MB / 1537172 bytes.

## Remaining final risks

- WeChat DevTools CLI preview passed, but no simulator click-through screenshot or real-device visual acceptance was captured in this orchestration pass.
- The first-pass Xiaowanzi native shell intentionally keeps the streaming chat core in `web-view`. Child select/save updates native shell/storage/context immediately and does not refresh the current conversation; the already-loaded web chat core applies the selected child on a new conversation or next webview load.
- Git still reports `error: non-monotonic index .git/objects/pack/._pack-...idx` during some git commands. This is a `.git` AppleDouble metadata issue and was not repaired because deleting `.git` files requires explicit approval.
