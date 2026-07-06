# Xiaowanzi Native Super Mode - Codex Review

## Blocking

- [P1] Selected child is visible in the native shell, but it is not bridged into the already-loaded web chat core. The goal requires saving/selecting a child to update `xiaowanzi_last_child_id_v1`, bridge the selected child into Xiaowanzi, and keep the return path stable (`docs/orchestration/xiaowanzi-native-super-mode_GOAL.md:53-56`). The initial web bridge is URL-only: `buildChildProfileBridgeParams()` writes `xf_child_profiles` / `xf_child_id` into params (`apps/wechat-miniprogram/pages/xiaowanzi/index.js:51-59`), and those params are only applied when `buildXiaowanziSuperUrl()` builds `src` (`apps/wechat-miniprogram/pages/xiaowanzi/index.js:115-124`, `apps/wechat-miniprogram/pages/xiaowanzi/index.js:201-206`). After selection/save, `syncSelectedChildToXiaowanzi()` only writes native storage and `xiaowanzi_chat_context_v1`, then refreshes native shell state (`apps/wechat-miniprogram/pages/xiaowanzi/index.js:277-288`, called from `apps/wechat-miniprogram/pages/xiaowanzi/index.js:292-318`). The mounted `web-view` only has `src`, `bindload`, and `bindmessage` inbound handlers (`apps/wechat-miniprogram/pages/xiaowanzi/index.wxml:42-49`); there is no native-to-web delivery path. This correctly avoids `reLaunch`/`src` reset, but the active streaming chat core keeps the child context it loaded with. The implementation report also acknowledges this gap (`docs/orchestration/xiaowanzi-native-super-mode_IMPL_omp.md:57-60`). Fix needs either a documented non-refresh bridge into the web core, or the goal must explicitly accept "native shell updates now, web chat sees child on next load" as out of scope.

- [P1] Xiaowanzi share sheet is likely not renderable/clickable over the mounted `web-view` without real-device proof. The goal requires native shell ownership of share entry and native panel/sheet transitions (`docs/orchestration/xiaowanzi-native-super-mode_GOAL.md:49-52`, `docs/orchestration/xiaowanzi-native-super-mode_GOAL.md:61-64`). The page keeps the `web-view` mounted across the lower region (`apps/wechat-miniprogram/pages/xiaowanzi/index.wxml:42-49`). The share scrim is a `cover-view`, but the actual sheet and `open-type="share"` button are normal `view`/`button` nodes (`apps/wechat-miniprogram/pages/xiaowanzi/index.wxml:51-63`) styled as a fixed bottom overlay (`apps/wechat-miniprogram/pages/xiaowanzi/index.wxss:202-222`). Normal WXML views are not a safe overlay strategy above a live `web-view`; z-index alone is not enough for this native-component layering class. The implementation report says simulator/device visual inspection was not done (`docs/orchestration/xiaowanzi-native-super-mode_IMPL_omp.md:49-52`). Fix by making share invoke from a non-overlapping native shell control, temporarily removing/shrinking the webview while the sheet is open, routing to a native share page, or proving this exact structure in WeChat DevTools plus device before approving.

## Queued

- [P2] Topic share path sanitization covers the requested sensitive params, but nested target encoding is brittle. `sanitizeTopicPath()` strips `xf_token`, `token`, `secret`, and `userId` (`apps/wechat-miniprogram/pages/topics/index.js:387-393`), and the focused test covers that simple case (`apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:3624-3664`). However, `buildTopicSharePath()` interpolates the sanitized path and title into a nested `/pages/webview/index?url=...&title=...` string before passing it as the `target` query (`apps/wechat-miniprogram/pages/topics/index.js:395-405`). `pages/share/index` decodes `target` and calls `wx.reLaunch({ url: target })` for non-tab targets (`apps/wechat-miniprogram/pages/share/index.js:83-93`, `apps/wechat-miniprogram/pages/share/index.js:66-72`). A topic title or preserved path query containing `&`, `=`, or `#` can be reinterpreted as extra route params after the landing page decodes it. This is not a leak in the reviewed simple case, but it should be hardened before relying on arbitrary topic titles.

- [P2] AppleDouble files remain a release/package blocker, not a product-behavior blocker. The package-clean test is explicit (`apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:74-78`) and fails only on `._*` files in the mini-program tree. Current scan found:
  `apps/wechat-miniprogram/pages/xiaowanzi/._index.js`,
  `apps/wechat-miniprogram/pages/xiaowanzi/._index.wxml`,
  `apps/wechat-miniprogram/pages/xiaowanzi/._index.wxss`,
  `apps/wechat-miniprogram/pages/topics/._index.js`,
  `apps/wechat-miniprogram/pages/topics/._index.wxml`,
  `apps/wechat-miniprogram/pages/topics/._index.wxss`,
  `apps/wechat-miniprogram/pages/webview/._index.js`,
  `apps/wechat-miniprogram/pages/._tab-webview.static.test.mjs`.
  Because the review instruction forbids deleting them, this should be cleaned under explicit approval before release/upload, but it does not by itself prove the Xiaowanzi implementation logic is wrong.

## Advisory

- [P3] Test coverage is useful but over-indexed on regex/static structure. It locks native shell ownership, explicit webview boundary, no `src` reset, and share param sanitization (`apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:450-661`, `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:3624-3664`). It does not catch the live-child bridge gap because it asserts `src` stays unchanged without asserting that the web core receives a replacement child context (`apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:599-611`). It also does not cover `web-view` overlay rendering, which needs simulator/device verification.

- [P3] Scope in the reviewed files is aligned with the goal: Xiaowanzi native shell, topic share, and focused tests. I did not find production/deploy edits in the reviewed path set. The overall worktree is very dirty and includes unrelated deployment/script files in `git status --short`, so any eventual commit must isolate only the intended files.

## Verification

- Read:
  - `docs/orchestration/xiaowanzi-native-super-mode_GOAL.md`
  - `docs/orchestration/xiaowanzi-native-super-mode_IMPL_omp.md`
  - `apps/wechat-miniprogram/pages/xiaowanzi/index.js`
  - `apps/wechat-miniprogram/pages/xiaowanzi/index.wxml`
  - `apps/wechat-miniprogram/pages/xiaowanzi/index.wxss`
  - `apps/wechat-miniprogram/pages/topics/index.js`
  - `apps/wechat-miniprogram/pages/topics/index.wxml`
  - `apps/wechat-miniprogram/pages/topics/index.wxss`
  - `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
  - `apps/wechat-miniprogram/utils/nativeSettings.js`
  - `apps/wechat-miniprogram/utils/share.js`
  - `apps/wechat-miniprogram/pages/share/index.js`
- Ran:
  - `node --check apps/wechat-miniprogram/pages/xiaowanzi/index.js` - pass.
  - `node --check apps/wechat-miniprogram/pages/topics/index.js` - pass.
  - `node --check apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` - pass.
  - `COPYFILE_DISABLE=1 node --test --test-name-pattern "Xiaowanzi tab page uses a native shell|topics cards share native landing paths" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` - pass, 2 matching tests passed.
  - `COPYFILE_DISABLE=1 node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` - fail, 66 passed / 1 failed; only failure is AppleDouble package-clean assertion.
  - `find apps/wechat-miniprogram -name '._*' -print` - found the AppleDouble files listed above.
- Not run:
  - WeChat DevTools simulator visual verification.
  - Real-device verification.
  - Broad frontend/backend test suites.
  - Any destructive cleanup of AppleDouble files.

## Verdict

request-changes

The implementation correctly does not pretend the streaming chat engine is native, and the topic share path is directionally native/sanitized. It is not ready to approve because child switching is not bridged into the live web chat core, and the Xiaowanzi share sheet relies on an unsafe normal-view overlay above a mounted `web-view` without visual/device proof.

---

## Round 2

## Blocking

- None.

## Queued

- [P2] True native-to-mounted-webview child-context delivery remains a product follow-up if the required behavior is "the current streaming conversation immediately adopts the new child." The revised goal now explicitly accepts the first-pass boundary: native shell/storage/chat-context update immediately, no `reLaunch`, no `src` reset, and the loaded web chat session is not refreshed (`docs/orchestration/xiaowanzi-native-super-mode_GOAL.md:46-57`). The implementation matches that revised contract: the selected child is stored in `xiaowanzi_last_child_id_v1` and `xiaowanzi_chat_context_v1` (`apps/wechat-miniprogram/pages/xiaowanzi/index.js:272-283`), and the UI shows `已切换为{childName}，当前对话不刷新，新对话生效` (`apps/wechat-miniprogram/pages/xiaowanzi/index.js:285-290`, `apps/wechat-miniprogram/pages/xiaowanzi/index.wxml:32`). Under the revised goal this is not blocking, but it is still not the same as a live web-chat bridge.

- [P2] Simulator/device visual verification is still missing. The previous unsafe share sheet is gone, but the Xiaowanzi page still combines a native shell and an explicit lower `web-view` boundary (`apps/wechat-miniprogram/pages/xiaowanzi/index.wxml:3-51`). Static tests cannot prove final WeChat rendering, touch routing, or archive-panel geometry on device.

## Advisory

- [P3] The share overlay blocking finding is addressed. The topbar share control is now a direct native share button (`apps/wechat-miniprogram/pages/xiaowanzi/index.wxml:12-17`), and the former normal share sheet/scrim nodes are absent from WXML. The tests assert `open-type="share"` and reject `openNativeSharePanel`, `closeNativeSharePanel`, `xf-xiaowanzi-share-panel`, and `xf-xiaowanzi-share-scrim` (`apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:498-500`, `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:533-536`).

- [P3] The nested topic share encoding finding is addressed for the reviewed cases. `sanitizeTopicPath()` strips `xf_token`, `token`, `secret`, and `userId` while preserving query/hash (`apps/wechat-miniprogram/pages/topics/index.js:387-393`), and `buildTopicSharePath()` now encodes the nested `url`, `title`, and `topicId` before putting them into the `/pages/share/index` target (`apps/wechat-miniprogram/pages/topics/index.js:395-405`). The updated test covers `&`, `#`, and `=` in both title and path, then parses the nested target back out (`apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:3628-3677`).

- [P3] There is minor stale CSS: `.xf-xiaowanzi-share-primary::after` and `.xf-xiaowanzi-share-secondary::after` still appear in the button border reset selector even though the share sheet markup was removed (`apps/wechat-miniprogram/pages/xiaowanzi/index.wxss:51-55`). This is harmless dead styling and not worth blocking.

## Verification

- Read:
  - `docs/orchestration/xiaowanzi-native-super-mode_GOAL.md`
  - `docs/orchestration/xiaowanzi-native-super-mode_IMPL_omp.md`
  - `docs/orchestration/xiaowanzi-native-super-mode_REVIEW_codex.md`
  - `apps/wechat-miniprogram/pages/xiaowanzi/index.js`
  - `apps/wechat-miniprogram/pages/xiaowanzi/index.wxml`
  - `apps/wechat-miniprogram/pages/xiaowanzi/index.wxss`
  - `apps/wechat-miniprogram/pages/topics/index.js`
  - `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- Ran:
  - `node --check apps/wechat-miniprogram/pages/xiaowanzi/index.js` - pass.
  - `node --check apps/wechat-miniprogram/pages/topics/index.js` - pass.
  - `node --check apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` - pass.
  - `COPYFILE_DISABLE=1 node --test --test-name-pattern "Xiaowanzi tab page uses a native shell|topics cards share native landing paths" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` - pass, 2 matching tests passed.
  - `COPYFILE_DISABLE=1 node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` - pass, 67/67 tests passed.
  - `find apps/wechat-miniprogram -name '._*' -print` - no output in this run.
- Not run:
  - WeChat DevTools simulator visual verification.
  - Real-device verification.
  - Broad frontend/backend test suites.

## Verdict

approve

Round 2 addresses the two blocking findings under the revised goal. The no-live-web-bridge limitation is now explicit in goal, report, UI, and tests; Xiaowanzi share no longer uses a normal overlay above the mounted `web-view`; topic share encoding is hardened for reserved characters and sensitive params; and the full focused static suite passes.
