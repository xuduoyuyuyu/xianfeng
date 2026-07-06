# GOAL — Mini Program Native Profile Menu Parity（implementation）

> Owner: omp when available. Planned worktree `/private/tmp/xianfeng-mp-native-profile-menu`, branch `codex/mp-native-profile-menu`.
> Reviewer: codex after implementation commits. Commits stay LOCAL — pushing requires user approval.
> Current dispatch status: BLOCKED. `tmux` and `omp` are not available in PATH, and the target mini-program native files are currently part of a dirty/untracked working tree. Do not dispatch from `origin/main` until the current mini-program context is available in the implementation worktree.
> Paths relative to `/Volumes/家长先疯/xianfeng`.

## Context (read first)

Ground truth from user: the current mini-program development is migrating the mobile website experience into native mini-program pages. The specific screenshot highlights the personal/menu area around `档案管理`, `先疯智库`, `记忆`, and `设置`, and the user requires the mini-program native build to match the mobile phone web style and interaction at `https://xianfeng.xinzhi.info`.

Relevant current files:

- Web reference menu: `frontend/src/components/GlobalPublicNav.tsx:326-343`.
- Web menu tests for ordering and icon semantics: `frontend/src/components/GlobalPublicNav.test.mjs:45-65`.
- Mini-program native menu data and navigation contract: `apps/wechat-miniprogram/utils/nativeSettings.js:12-55` and `apps/wechat-miniprogram/utils/nativeSettings.js:86-110`.
- Mini-program mine page menu overlay rendering: `apps/wechat-miniprogram/pages/mine/index.wxml:44-80`.
- Mini-program mine quick actions: `apps/wechat-miniprogram/utils/profileState.js:78-82` and `apps/wechat-miniprogram/pages/mine/index.wxml:27-42`.
- Current mine page card/action styling: `apps/wechat-miniprogram/pages/mine/index.wxss:24-180`.
- Existing mini-program static regression file: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`.

Prior project context says WeChat DevTools is the acceptance surface for mini-program visual parity; static tests are necessary but not sufficient.

## Pre-triage hypotheses (verify, don't trust)

- **H1 (likely primary)**: The screenshot issue is not missing menu items; it is visual parity and grouping density in the native settings/menu panel. `nativeSettings.js:12-55` already contains the expected Web menu sequence, while `mine/index.wxml:55-78` renders generic section cards without explicitly tuning Web-like row height, card gaps, or group rhythm.
- **H2**: There are two related surfaces that must not be confused: `/pages/mine/index` quick actions only include `档案管理 / 记忆 / 设置` via `profileState.js:78-82`, while the hamburger/settings overlay renders the full menu from `nativeSettings.js`. If the user expects the full Web menu, implement on the overlay first.
- **H3**: Web and mini-program route behavior may already diverge. Web uses in-panel React state for `档案管理`, `记忆`, and `设置` in `GlobalPublicNav.tsx:330-343`; mini-program uses native pages or `openWeb` in `nativeSettings.js:98-110`. Preserve current mini-program route contracts unless the user explicitly asks to change behavior.
- **H4**: `订阅计划` visibility may differ from Web because Web gates it with `isProBillingEnabled()` while mini-program currently lists it unconditionally. Verify expected behavior before changing visibility.

## Task / Deliverables

1. Implement native mini-program visual and interaction parity for the profile/settings menu panel, scoped to:
   - `apps/wechat-miniprogram/utils/nativeSettings.js`
   - `apps/wechat-miniprogram/pages/mine/index.wxml`
   - `apps/wechat-miniprogram/pages/mine/index.wxss`
   - focused assertions in `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
   - only directly required shared mini-program menu styles/assets.
2. Match the mobile Web menu structure and interaction semantics:
   - Account row first.
   - `订阅计划`, `档案管理`.
   - `播客节目`, `先疯智库`.
   - `及阅`, `学习资料`, `教育规划`.
   - `请教一下`, `知物`, `妈妈好赚`.
   - `记忆`.
   - `设置`.
   - Preserve image/icon choices already aligned with Web tests unless visual inspection proves a mismatch.
3. Tighten visual parity to the screenshot/Web reference:
   - White card groups on light page background.
   - Consistent row height, icon size, label weight, chevron alignment.
   - Group gaps consistent with mobile Web drawer rhythm.
   - No oversized hero/header additions.
   - Text must not wrap or collide at iPhone-width viewport.
4. Preserve navigation behavior:
   - Tab pages continue using `wx.switchTab`.
   - Native subpages continue using `wx.navigateTo`.
   - Web-only routes continue using `openWeb`.
   - Login-gated rows should match existing mini-program auth behavior; if Web parity requires a behavior change, STOP and report before implementing.
5. Write implementation notes to `docs/orchestration/mp-native-profile-menu_IMPL_omp.md` with:
   - what changed
   - what was verified
   - what was not verified
   - screenshots or precise WeChat DevTools observations
   - remaining assumptions.

## Tests / Verification

Required before implementation completion:

1. `node --check apps/wechat-miniprogram/pages/mine/index.js`
2. `node --check apps/wechat-miniprogram/utils/nativeSettings.js`
3. `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
4. WeChat DevTools preview of the profile/settings menu on an iPhone-sized simulator:
   - open a first-level page
   - tap top-left hamburger/settings entry
   - compare visible menu groups against `https://xianfeng.xinzhi.info` mobile menu
   - capture or describe the rendered result.

Static tests alone do not satisfy completion.

## Guardrails

- Scope = mini-program native profile/settings menu parity only. No unrelated mini-program page redesigns.
- Do not refactor backend, billing, auth, web menu internals, or release scripts.
- Do not change production config, app IDs, domains, secrets, deployment files, or push/PR.
- Do not delete or overwrite existing dirty working-tree changes.
- If isolated worktree cannot include the current mini-program native context, STOP and report instead of reimplementing from `origin/main`.
- If a required product decision is unclear, STOP and ask:
  - Should `订阅计划` be gated like Web `isProBillingEnabled()` or always visible in mini-program?
  - Should `设置` open native `/pages/mine/settings/index` or the current Web panel route?
  - Should `/pages/mine/index` quick actions also be restyled, or only the hamburger/settings overlay?
- Redact secrets/customer data in docs. No AI signature lines in commits.
