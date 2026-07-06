# GOAL - Xiaowanzi super mode native mini-program surface (implementation)

> Owner: worker agent via Codex multi-agent, replacing the unavailable `tmux`/`omp` transport in this environment.
> Base refreshed from `origin/main` on 2026-07-03; `origin/main` observed at `891bb20`, current checkout `eff6a89`.
> Reviewer: separate Codex review agent after worker implementation. Commits stay LOCAL - pushing requires user approval.
> Paths relative to `/Volumes/家长先疯/xianfeng`.

## Context (read first)

User goal: "小玩子超能模式的样式，全部做成小程序原生页面，包含话题的分享、孩子关联页面，样式对齐移动端，功能要更丝滑，加载速度更快."

Ground truth from current checkout:

- `apps/wechat-miniprogram/pages/xiaowanzi/index.wxml:3-10` is still a `web-view` host. It only renders a native archive overlay when `settingsPanelOpen` is true.
- `apps/wechat-miniprogram/pages/xiaowanzi/index.js:74-83` builds the Xiaowanzi super-mode web URL and injects native capsule/child-profile bridge params.
- `apps/wechat-miniprogram/pages/xiaowanzi/index.js:171-197` handles web-to-native archive actions via `bindmessage` and `bindload` query markers.
- `apps/wechat-miniprogram/pages/topics/index.wxml:3-253` is already a native first-level topic/ask page with menu, ask box, list cards, filter drawer, and native settings panel.
- `apps/wechat-miniprogram/pages/topics/index.js:604-617` still opens topic detail through `openWeb(topic.path, topic.title, { userId })`.
- `apps/wechat-miniprogram/pages/share/index.js:75-121` is a native share landing/redirect page, and `apps/wechat-miniprogram/utils/share.js:78-121` owns page/webview share payload generation.
- `apps/wechat-miniprogram/pages/mine/archive/index.js:176-395` is a native child archive page; `saveProfile()` stores `xiaowanzi_last_child_id_v1`, and `openXiaowanzi()` switches back to `/pages/xiaowanzi/index`.
- `apps/wechat-miniprogram/utils/nativeSettings.js:60-64` owns the child/profile/chat-context storage keys shared by native settings and Xiaowanzi.
- `frontend/src/wel/components/XiaowanziWidget.tsx:1938-1948` still triggers native archive picker/create bridges from the web widget.
- `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:5125-5145` currently treats `pages/xiaowanzi/index` and `pages/webview/index` as the only explicit `web-view` boundaries.

Operational constraints:

- `tmux` and `omp` are not available in PATH here, so the CTO dispatch transport must be Codex multi-agent. Preserve the role split: worker implements, reviewer is read-only.
- The current checkout has many pre-existing uncommitted changes. Do not revert them. If a conflict is caused by unrelated dirty files, stop and report.
- Git currently reports a bad AppleDouble pack index such as `.git/objects/pack/._pack-...idx` during some commands. Report it if it blocks git operations; do not delete `.git` files without explicit user approval.

Memory-derived constraints to verify against code, not blindly trust:

- Prior mini-program work intentionally nativeized first-level pages first and kept some detail/search/login-heavy routes in webview.
- When Xiaowanzi `切换/关联` is under review, treat it as a native archive-picker/bridge problem, not a React-only refresh.
- For Xiaowanzi visual bugs, first verify the actual `pages/xiaowanzi/index` route and ownership of native vs web top controls before doing another CSS-only patch.

## Pre-triage hypotheses (verify, don't trust)

- **H1 (likely primary)**: the main gap is page ownership. `pages/xiaowanzi/index.wxml:3-10` is still webview-first, while the requested native experience needs a native host/shell that owns Xiaowanzi chrome, child association/switching, share entry, loading/skeleton, and return states.
- **H2**: a full native rewrite of the streaming chat engine may be too large for one pass because `frontend/src/wel/components/XiaowanziWidget.tsx` contains session, share-card, Pro-gate, mention-link, and streaming logic. If a true native chat rewrite requires new backend/API contracts, stop and report a phased plan instead of duplicating the whole React widget badly.
- **H3**: the fastest safe improvement is to make the mini-program page native-first around the webview core: native header/actions, native child binding/switching page, native share/selection sheet or landing, native loading/cache states, and a thinner webview content area only where the streaming chat core remains necessary.
- **H4**: topic sharing likely belongs in the native `topics`/`share` boundary, not in a generic web share card path. Existing share helpers can be extended, but sensitive params such as tokens must stay stripped.

## Task / Deliverables

Round 2 implementation boundary:

- WeChat mini-program `web-view` provides the current codebase a web-to-native
  message channel (`bindmessage`) and URL-param initialization, but no verified
  native-to-mounted-webview JavaScript delivery channel. Therefore child
  switch/save must not fake an instant live web-chat bridge.
- The accepted first-pass boundary is: native shell, storage, and chat-context
  update immediately without `reLaunch` or `src` reset; the current loaded web
  chat session is not refreshed; UI must explicitly tell the user that the
  selected child applies to a new conversation / next webview load.
- Xiaowanzi sharing must be invoked from a native topbar `open-type="share"`
  control, not from a normal `view` sheet layered above a mounted `web-view`.

1. Understanding gate before implementation:
   - First reply with the exact files/contracts you expect to touch and the biggest risks.
   - Do not edit until the orchestrator confirms the understanding is aligned.
2. Implement a mini-program-native Xiaowanzi super-mode surface:
   - Native page shell owns visible style, loading/skeleton, top actions, child binding/switching entry, share entry, and panel/sheet transitions.
   - Preserve existing login, Pro, child-profile, and chat-context semantics. Do not invent new backend behavior without evidence.
   - If the streaming chat core must remain webview for this pass, make that boundary explicit and visually subordinate to the native shell rather than the whole page reading as a webview wrapper.
3. Native child association page/flow:
   - `切换/关联` must open a native archive picker/create flow without refreshing or relaunching the Xiaowanzi session.
   - Saving or selecting a child must update `xiaowanzi_last_child_id_v1`, bridge the selected child into Xiaowanzi, and keep return path stable.
   - Reuse `apps/wechat-miniprogram/pages/mine/archive/index.*`, `apps/wechat-miniprogram/templates/settings-profile-views.wxml`, and `utils/nativeSettings.js` where that is the simpler path.
4. Native topic share flow:
   - Topic cards or Xiaowanzi-mentioned topics should expose a native share path where appropriate.
   - Share payloads must use native mini-program page paths, preserve topic identity/user-safe context, and strip sensitive web params.
   - Keep `pages/share/index` useful as a native landing/redirect surface if it remains part of the design.
5. Smoothness and loading:
   - Avoid unnecessary `src` resets of the Xiaowanzi webview/core when only child panel state changes.
   - Add cache-first or skeleton-first rendering where data already exists locally.
   - Prefer native transitions/panels over web modal overlays for child association and sharing.
6. Style parity:
   - Align to the current mobile mini-program native language: compact spacing, light cards, restrained purple accents, no raw Material Symbols ligature text, no oversized decorative labels.
   - Check against existing native first-level pages (`programs`, `topics`, `mine`, `pro`) instead of designing a new visual system.
7. Tests:
   - Add/update focused static tests under `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` and/or relevant utility tests.
   - Cover the native Xiaowanzi ownership contract, child association no-refresh path, share payload sanitization, and explicit webview boundary if the chat core remains webview.
   - Run `node --check` for changed mini-program JS files.
   - Run targeted `COPYFILE_DISABLE=1 node --test ...` tests that cover the changed contracts.
   - Run `find apps/wechat-miniprogram -name '._*' -print` and report any AppleDouble files.
8. Render/device verification:
   - If WeChat DevTools CLI/simulator is available, compile/preview and verify `pages/xiaowanzi/index`, child association, and topic share surfaces.
   - If not available, explicitly state what was not rendered and provide static/test evidence only.
9. Implementation report:
   - Write `docs/orchestration/xiaowanzi-native-super-mode_IMPL_omp.md` with:
     - What changed.
     - What verification actually ran.
     - What was not verified.
     - Remaining assumptions/risks.

## Guardrails

- Scope = Xiaowanzi super-mode mini-program native surface, native child association, native topic/share flow, and focused tests/docs.
- Do not deploy, push, open PRs, delete files, or modify production/server configuration.
- Do not rewrite unrelated first-level pages except for shared utilities/templates required by Xiaowanzi.
- Do not break existing first-level native page contracts or native tabbar behavior.
- Do not remove `web-view` from `pages/webview/index` or unrelated detail routes unless the need is proven and documented.
- If a true all-native chat rewrite needs new backend streaming/session APIs, stop and report the needed contracts instead of building a fragile duplicate.
- Redact secrets/customer data in docs. No AI signature lines in commits.
