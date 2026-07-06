# Xiaowanzi Native Chat Core Goal

Date: 2026-07-03

## Background

Phase 1 made `pages/xiaowanzi` a native mini-program shell, native share entry,
and native child archive panel, but the actual chat core still loads
`/index-xiaowanzi.html` in `web-view`.

The original user goal is broader: Xiaowanzi super mode should feel like a
native mini-program page, include topic sharing and child association, align
with mobile styling, feel smoother, and load faster.

## Pushback And Phase Boundary

Do not attempt a full one-shot migration of every web-side Xiaowanzi feature in
this phase. Full parity would include streaming SSE, web browsing layer,
multi-session history UI, generated share-card download, rich inline links, and
all docked-web behavior. That scope crosses too many contracts at once.

This phase targets the highest-impact native boundary:

- Replace the remaining Xiaowanzi chat core `web-view` with a native
  mini-program chat surface.
- Keep the existing native child archive/association panel.
- Keep native page share behavior.
- Preserve the existing backend `tutorbot` contract and Pro billing behavior.

Browsing-layer parity and advanced generated share-card parity are deferred
unless they are already trivial after the native chat core is complete.

## Current Contracts To Preserve

Read and preserve these before editing:

- `apps/wechat-miniprogram/pages/xiaowanzi/index.js`
- `apps/wechat-miniprogram/pages/xiaowanzi/index.wxml`
- `apps/wechat-miniprogram/pages/xiaowanzi/index.wxss`
- `apps/wechat-miniprogram/utils/request.js`
- `apps/wechat-miniprogram/utils/session.js`
- `apps/wechat-miniprogram/utils/profileState.js`
- `apps/wechat-miniprogram/utils/nativeSettings.js`
- `frontend/src/wel/components/XiaowanziWidget.tsx`
- `frontend/src/wel/components/XiaowanziWidget.logic.ts`
- `backend/src/routes/tutorbot.ts`
- `backend/src/routes/user.ts`
- `backend/src/middlewares/requirePro.ts`
- `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Important observed contracts:

- `POST /api/v1/tutorbot` creates or starts `xiaowanzi_debug_bot`.
- `GET /api/v1/tutorbot/xiaowanzi_debug_bot/history?limit=100` returns history.
- `POST /api/v1/tutorbot/xiaowanzi_debug_bot/messages` is authenticated and
  gated by `requirePro("xiaowanzi")`.
- The message endpoint already supports non-stream JSON when `stream` is false
  or omitted, returning `{ type: "content", content: reply }`.
- `requirePro` returns 401 for expired login and 402 with
  `code: "PRO_REQUIRED"` for insufficient entitlement or points.
- React currently sends a contextual `content`, not just raw user text. The
  native page must preserve equivalent child/profile context:
  - active child profile summary
  - parent role from stored user where available
  - memory summary from `/api/users/me/child-memories/:childId`
  - user question
- After a successful child-bound chat reply, React merges memory through
  `POST /api/users/me/child-memories/:childId/merge`.

## Success Criteria

The Xiaowanzi tab route `pages/xiaowanzi/index` must:

1. Render the primary chat experience as native WXML/WXSS, not as a `web-view`.
2. Load without waiting for `/index-xiaowanzi.html`.
3. Show the selected child card and keep native archive/association actions.
4. Send user prompts with native `wx.request` through `utils/request.js`.
5. Use `/api/v1/tutorbot/xiaowanzi_debug_bot/messages` with `stream: false`
   or no stream flag. Do not implement a custom streaming client in this phase.
6. Preserve the Pro and auth branches:
   - 401: clear session or send the user to native login state.
   - 402 / `PRO_REQUIRED`: show upgrade guidance and provide a path to
     `/pages/pro/index`.
   - 403: show no-permission copy.
   - network/backend error: keep the user prompt visible and show a retryable
     assistant/error state.
7. Preserve child context:
   - no selected child should block normal child-specific questions and open or
     prompt the archive panel, matching the current web behavior.
   - switching or saving a child should affect the next native request without
     requiring a page reload.
8. Preserve child memory where feasible:
   - read memory before building contextual content when a child is active.
   - call memory merge after a successful assistant reply when memory is
     enabled.
9. Preserve share:
   - `onShareAppMessage` and `onShareTimeline` still share
     `/pages/xiaowanzi/index`.
   - no normal `view` overlay should be used above `web-view` because the
     chat core should no longer be a `web-view`.
10. Keep styling aligned with the existing mobile Xiaowanzi surface and native
    mini-program pages:
    - stable topbar/capsule spacing
    - compact child card
    - fast skeleton/empty state
    - readable message bubbles
    - safe-area-aware composer
11. Avoid backend changes unless a contract gap is proven. If backend changes
    are necessary, keep them minimal and add targeted backend tests.

## Explicit Non-Goals

- Do not migrate all embedded browsing pages in this phase.
- Do not implement native SSE or streaming unless there is already a proven,
  tiny existing helper.
- Do not redesign global navigation or unrelated mini-program pages.
- Do not delete or rewrite existing web Xiaowanzi code.
- Do not clean unrelated dirty files.
- Do not touch production deployment or server state.

## Suggested Implementation Shape

Prefer small local helpers in `apps/wechat-miniprogram/pages/xiaowanzi/index.js`
unless a helper is reused by tests or another page.

Likely native data state:

- `messages`: user and assistant messages with stable ids and timestamps.
- `inputValue`
- `sending`
- `statusText`
- `errorText`
- `canUseBot`
- `quickPrompts`
- `activeChild...` fields already present.

Likely request flow:

1. On load/show, sync active child and call `ensureBotReady`.
2. Load backend history if logged in, otherwise use local cached native history.
3. On send:
   - require login.
   - require child for child-bound mode.
   - append the user message immediately.
   - build contextual content using the active child, parent role, memory
     summary, and raw user prompt.
   - call `POST /api/v1/tutorbot/xiaowanzi_debug_bot/messages` with
     `{ content: contextualContent, stream: false }`.
   - append assistant reply.
   - cache history and merge child memory when applicable.

## Tests And Verification

Add or update focused static tests in
`apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` or a smaller new
test file under `apps/wechat-miniprogram/pages/xiaowanzi/`.

Required checks:

- `pages/xiaowanzi/index.wxml` does not contain `<web-view` for the primary chat
  core.
- `pages/xiaowanzi/index.js` calls `/api/v1/tutorbot/xiaowanzi_debug_bot/messages`.
- Native request body uses `stream: false` or omits streaming.
- `PRO_REQUIRED` / 402 handling is present and routes or guides to Pro.
- 401 handling clears or redirects login state.
- child profile summary/context is included in the prompt payload.
- child memory read and merge contracts are present when child is active.
- native share entry remains `button open-type="share"`.
- AppleDouble files are absent from `apps/wechat-miniprogram`.

Run at minimum:

```sh
node --check apps/wechat-miniprogram/pages/xiaowanzi/index.js
node --check apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
COPYFILE_DISABLE=1 node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
find apps/wechat-miniprogram -name '._*' -print
```

If feasible, also run WeChat DevTools preview for
`apps/wechat-miniprogram` and inspect `pages/xiaowanzi/index`.

## Acceptance Notes

Completion is not "the shell is native." Completion for this phase means the
visible chat core in `pages/xiaowanzi/index` is native and can send a real
non-stream Xiaowanzi message through the authenticated backend contract.

If any part cannot be completed because the backend contract or WeChat runtime
blocks it, stop and write the exact blocker plus the smallest next contract
change needed.
