# GOAL - Mini-program half-panel profile subflows match mobile web panels (implementation)

> Owner: worker agent. Worktree `/Volumes/家长先疯/xianfeng`, current dirty branch.
> Reviewer: codex-style read-only review after implementation. Commits stay LOCAL - pushing requires user approval.
> Paths relative to `/Volumes/家长先疯/xianfeng`.

## Context (read first)

User ground truth: the mini-program native experience must match the mobile website interaction, especially the profile/menu flows shown in the three supplied screenshots.

**Correction from user after initial dispatch**: the interaction strategy is not "tap in the half-panel and push/navigate to a new page." It must be: tap inside the existing half-screen/right-side panel and show the next-level content directly in that same panel. The `← 返回` inside the profile subflow returns to the half-panel menu list. Closing the mask returns to the underlying page.

- `档案管理`: right-side panel with dimmed left scrim, header `← 返回` + centered title, child tabs, insight card, basic info form, chips, `保存档案` and `找小玩子`.
- `个性化回答`: same panel shell, memory switch card, `管理记忆 >` row, and explanatory copy.
- `设置`: same panel shell, settings card with `绑定手机`, `字体大小`, `应用管理 / 清理缓存 >`, logout button, and red `注销账户` near the bottom.

Mobile-web source of truth is `frontend/src/components/GlobalPublicNav.tsx:400-445`:

- `ChildrenPanel` renders the archive/profile form and child tabs.
- `MemoryPanel` renders the personalized-answer memory settings.
- `SettingsPanel` renders the settings card and account actions.

Current mini-program state:

- `apps/wechat-miniprogram/pages/mine/index.*` already has compact quick-action rows for `档案管理 / 记忆 / 设置`.
- `apps/wechat-miniprogram/pages/mine/archive/index.*` is native but currently renders a profile summary/list, not the mobile-web edit panel.
- `apps/wechat-miniprogram/pages/mine/memory/index.*` and `apps/wechat-miniprogram/pages/mine/settings/index.*` are still `web-view` wrappers.
- `apps/wechat-miniprogram/pages/mine/profile-panel.wxss` already contains reusable panel/form/memory/settings classes. Reuse it where possible instead of inventing another design system.
- `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:1981-2156` currently encodes the old wrapper contract for memory/settings and must be updated with focused assertions for native parity.
- `apps/wechat-miniprogram/utils/nativeSettings.js` and the repeated `settingsPanelOpen/settingsSections/openSettingsItem` blocks are the shared half-panel menu contract across first-level pages. The fix must not leave the common menu path pushing profile subpages.

## Pre-triage hypotheses (verify, don't trust)

- **H1 (likely primary)**: the interaction bug lives in the shared settings menu contract. `openSettingsItem()` currently closes the panel and navigates/switches for every item; profile items need to set an in-panel state instead.
- **H2**: the current standalone `pages/mine/archive|memory|settings` pages can remain fallback routes, but they are not the primary acceptance path for the half-panel interaction.
- **H3**: if a backend/API contract for memory toggle or delete account is unavailable in mini-program utilities, implement the native UI and local state safely, then document the unverified backend behavior instead of inventing a new API layer.

## Task / Deliverables

1. Convert the shared half-panel menu into a two-state panel:
   - `settingsPanelView: "menu" | "archive" | "memory" | "settings"` or equivalent.
   - Opening the hamburger/menu starts on `"menu"`.
   - Tapping `档案管理`, `记忆`, or `设置` inside the half-panel changes the same panel to that view; it must not call `wx.navigateTo`, `wx.switchTab`, or `openWeb` for these three profile subflows.
   - `← 返回` in a profile subflow returns to `"menu"` without closing the mask.
   - Mask close closes the panel and resets the view to `"menu"`.
2. Implement the three in-panel profile views using the mobile-web source of truth:
   - Archive/profile form: child tabs, insight card, basic info fields, chips, save/bind buttons.
   - Memory: `开启记忆功能` switch, `管理记忆 >`, explanatory copy.
   - Settings: phone, font size, cache row, logout/login, red delete-account action.
3. Keep fallback standalone pages only if needed for direct routes/share, but do not make them the primary menu flow.
4. Match mobile-web interaction and visual rhythm:
   - 72-74vw right panel with left dim/blur scrim where feasible.
   - Header row: purple `← 返回`, centered title, stable right spacer.
   - Rounded white cards, light gray page background, purple active state, compact mobile typography.
   - No raw Material Symbols ligature text visible in the mini-program UI.
5. Keep behavior scoped:
   - No backend rewrites.
   - No unrelated first-level page changes.
   - No broad refactors or formatting churn.
6. Tests:
   - Update `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` so it asserts the in-panel state-switching contract.
   - Add focused assertions that `archive/memory/settings` menu items no longer navigate or open web from the shared half-panel menu.
   - Assert visible labels/classes for the three in-panel views.
   - Assert direct/fallback standalone routes only if they intentionally remain.
   - Run targeted tests around `mine profile actions`, profile subpages, and AppleDouble checks.
7. Visual verification:
   - If WeChat DevTools is available, inspect the three pages in iPhone simulator and record whether each matches the supplied screenshots.
   - If not available, state that explicitly and provide static evidence only.
8. Implementation report:
   - Write `docs/orchestration/mp-native-profile-subpages_IMPL_omp.md` with what changed, what verification actually ran, what was not verified, and remaining assumptions/risks.

## Dispatch notes

- Superseded dispatch: the earlier independent-page route strategy was stopped after user correction.
- Next worker owns the shared half-panel state-switching model and should repair any half-finished tests from the stopped route-based dispatch.

## Guardrails

- Scope = native profile subpages and their focused static tests/docs only.
- Do not touch production deploy scripts, backend models/routes, or unrelated mini-program list pages.
- Do not delete user/runtime data. macOS `._*` files may be reported, but do not add destructive cleanup logic into tests.
- If route parity conflicts with existing tests or callers, STOP and document the conflict rather than silently changing unrelated callers.
- Follow repository `AGENTS.md`: simple, surgical changes; verify honestly; no AI signature lines.
