# Mini Program Native Mine Quick Actions Goal

> Owner: worker agent through Codex multi-agent when `omp`/`tmux` are unavailable.
> Planned scope: current dirty workspace only; do not rebase or recreate from `origin/main` until the active mini-program native worktree is clean.
> Status: DISPATCH READY.

## Context

The previous orchestration pass aligned the native hamburger/profile settings overlay with the mobile-web menu rhythm. The remaining adjacent surface is the `/pages/mine/index` page itself: it still renders `档案管理 / 记忆 / 设置` as a product-card style quick-action block, while the supplied mobile-web reference uses compact white list rows with simple line icons and right chevrons.

Ground truth from current files:

- `/pages/mine/index` renders the quick actions at `apps/wechat-miniprogram/pages/mine/index.wxml:27-42`.
- Quick action data comes from `apps/wechat-miniprogram/utils/profileState.js:78-82`.
- Quick action routing is in `apps/wechat-miniprogram/pages/mine/index.js:63-77` and `apps/wechat-miniprogram/pages/mine/index.js:123-134`.
- Current quick action styling is `apps/wechat-miniprogram/pages/mine/index.wxss:133-195`.
- The newly aligned menu overlay styles begin at `apps/wechat-miniprogram/pages/mine/index.wxss:197`.
- Focused static coverage for mine profile actions starts near `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:1777`.

Prior project context says WeChat DevTools is the acceptance surface for mini-program visual parity; static tests are necessary but not sufficient.

## Hypotheses To Verify

- **H1:** The next visual mismatch is the `/mine` quick-action block, not the already-aligned overlay. It should read like the mobile-web profile/menu rows: white list/card rows, compact vertical rhythm, line-icon tone, clear chevron, no heavy purple/product-card emphasis.
- **H2:** Route behavior should not change. `archive` remains native `/pages/mine/archive/index`; `memory` remains `/pages/mine/memory/index` behind login; `settings` keeps the current settings behavior unless tests prove the current contract is already different.
- **H3:** The quick-action block should remain limited to the three personal actions. Do not add the full hamburger menu to the page body unless the user explicitly asks.
- **H4:** Existing overlay class contracts from the previous pass must keep passing.

## Deliverables

1. Restyle `/pages/mine/index` quick actions to match the mobile-web menu/list rhythm:
   - compact white grouped block or separated white rows;
   - line-icon sizing aligned with the overlay direction;
   - bold but not oversized Chinese labels;
   - subtitle either removed or visually secondary enough that the row does not become a product card;
   - stable chevron width and no text overflow on iPhone-width screens.
2. Preserve the route contract:
   - `档案管理` opens archive native page;
   - `记忆` requires login then opens memory native page;
   - `设置` follows the current settings contract verified by tests.
3. Add or update focused static assertions in `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` for:
   - quick-action WXML class contract;
   - row density / icon / title / chevron CSS contract;
   - route contract remains unchanged.
4. Write implementation notes to `docs/orchestration/mp-native-mine-quick-actions_IMPL_omp.md` with:
   - files changed;
   - tests run and exact pass/fail status;
   - WeChat DevTools visual check status;
   - anything intentionally left unchanged.

## Required Verification

Run at minimum:

1. `node --check apps/wechat-miniprogram/pages/mine/index.js`
2. `node --check apps/wechat-miniprogram/utils/profileState.js`
3. `node --test --test-name-pattern "mine profile actions|mine quick actions|mine hamburger settings drawer|AppleDouble" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
4. `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
5. WeChat DevTools preview on an iPhone-sized simulator:
   - open the Mine tab/page;
   - verify the account card, stats, and quick-action rows do not overlap;
   - verify `档案管理 / 记忆 / 设置` read as compact mobile-web-like rows;
   - verify hamburger/settings overlay still opens and remains visually intact.

## Guardrails

- Scope = `/pages/mine/index` quick-action visual/interaction parity only, plus focused tests and implementation note.
- Do not redesign archive, memory, or settings subpages in this pass.
- Do not change backend APIs, auth/session storage, billing, or web frontend.
- Do not remove previous overlay classes or route tests.
- Do not delete user/runtime data. AppleDouble `._*` files may be reported; if cleanup is required, report it rather than hiding it in tests.
- Commit locally only if explicitly asked. Do not push or deploy.

## Stop And Report

Stop instead of implementing if:

- the working tree lacks the current previous-pass overlay changes;
- the route contract in tests contradicts this goal;
- WeChat DevTools shows the mine page is not reachable or is loading a different native route;
- satisfying visual parity requires adding or removing menu items rather than styling the existing quick actions.
