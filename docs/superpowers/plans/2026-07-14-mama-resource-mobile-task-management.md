# Mama Resource Mobile Task Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/mama-resources/apply` show the same profile-status routing, task list, task detail, selectable content link, and proof submission flow as the native mini-program page.

**Architecture:** Keep the existing route and backend contracts. `MamaResourceApplyPage` loads `/mama-resources/me/tasks` after login, derives one explicit page mode from `profile`, and renders focused local components for approved-account tasks and task detail while retaining the current profile editor for new or existing profiles.

**Tech Stack:** React 18, TypeScript, Tailwind utility classes, Axios API service, Node static source tests, Vite.

## Global Constraints

- Preserve `/api/mama-resources/applications` as the profile save owner.
- Reuse the existing task, claim, upload, and submission APIs; do not change backend or admin behavior.
- Only `profile: null` means the user has not submitted a profile.
- Network errors must not fall back to the submission form.
- The content link opens as a selectable-text dialog and must not embed Feishu.
- Do not include unrelated dirty workspace changes in commits.

---

### Task 1: Add profile hydration and authenticated state routing

**Files:**
- Modify: `frontend/src/pages/MamaResourceApplyPage.test.mjs`
- Modify: `frontend/src/pages/MamaResourceApplyPage.tsx`
- Modify: `frontend/src/services/api.ts`

**Interfaces:**
- Consumes: `publicApi.getMyMamaResourceTasks()` returning `{ profile, tasks, availableTasks }`.
- Produces: `PageMode = "loading" | "apply" | "reviewing" | "tasks" | "detail" | "error"`, `formStateFromProfile(profile)`, and hydrated `profile`, `tasks`, and `availableTasks` state.

- [ ] **Step 1: Write failing source tests for load and routing**

Add assertions that the page calls `getMyMamaResourceTasks`, treats `profile: null` as `apply`, maps `approved` to `tasks`, maps other profile statuses to `reviewing`, exposes a retry state, and invokes the loader after inline login success.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`

Expected: FAIL because the page has no `PageMode`, loader, or profile hydration.

- [ ] **Step 3: Implement profile-to-form conversion and load state**

Add `formStateFromProfile(profile, loggedInMobile)` to map `displayName`, contact fields, child fields, `socialAccount`, extra `mediaAccounts`, `accountPositioning`, `categories`, `rateCard.blockedCategories`, and `consentAccepted` into `FormState`. Add authenticated loader state and render explicit loading/error branches.

- [ ] **Step 4: Route logged-in users by returned profile state**

On success set `apply` only for `profile === null`, `tasks` for `profile.status === "approved"`, and `reviewing` otherwise. On login success call the same loader. The review card shows status, `reviewNote.note`, and a “资料管理” action.

- [ ] **Step 5: Run the focused test**

Run: `node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`

Expected: PASS.

---

### Task 2: Render the approved account home and task detail

**Files:**
- Modify: `frontend/src/pages/MamaResourceApplyPage.test.mjs`
- Modify: `frontend/src/pages/MamaResourceApplyPage.tsx`
- Modify: `frontend/src/services/api.ts`

**Interfaces:**
- Consumes: hydrated `MamaResourceProfile`, `MamaResourceTask[]`, `availableTasks`, and `PageMode` from Task 1.
- Produces: `MamaResourceAccountCard`, `MamaResourceTaskCard`, `MamaResourceTaskDetail`, selected-task state, and `MamaResourceTask.contentUrl?: string`.

- [ ] **Step 1: Write failing source tests for approved task UI**

Assert that approved mode contains “账号已通过”, “资料管理”, task price, traffic fee, promotion count, remaining claim count, “内容已下发”, task-detail fields, and a back-to-list action.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`

Expected: FAIL because the Web page has no task cards or detail view.

- [ ] **Step 3: Add task display helpers and typed content URL**

Extend `MamaResourceTask` with `contentUrl?: string`. Add focused money, status, promotion-count, remaining-count, and task-id helpers matching the mini-program semantics.

- [ ] **Step 4: Implement approved account and task cards**

Render the approved account card first, then assigned and available tasks without duplicating task IDs. A task card click selects the task and switches to `detail`; “资料管理” opens the hydrated profile editor. An empty task set shows “暂时没有可接任务”.

- [ ] **Step 5: Implement task detail and claim behavior**

Render project information, requirement, settlement standard, example images, and pricing. For claimable tasks call `claimMamaResourceTask(taskId)`, replace the task with the returned assignment, and keep the user in detail mode.

- [ ] **Step 6: Run the focused test**

Run: `node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`

Expected: PASS.

---

### Task 3: Add selectable content link and proof submission

**Files:**
- Modify: `frontend/src/pages/MamaResourceApplyPage.test.mjs`
- Modify: `frontend/src/pages/MamaResourceApplyPage.tsx`
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Consumes: selected task and public API methods from Tasks 1-2.
- Produces: link-dialog state, `proofLink`, `proofScreenshotUrl`, upload state, and submit state.

- [ ] **Step 1: Write failing source tests for link and proof actions**

Assert that the detail view contains “你的专属任务内容”, “资料链接”, “长按可复制：”, selectable content URL text, completion-link input, image upload, and calls to `uploadMamaResourceScreenshot` and `submitMamaResourceTaskProof`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`

Expected: FAIL because the link dialog and proof controls do not exist.

- [ ] **Step 3: Implement the content-link dialog**

Show the entry only when `selectedTask.contentUrl` is non-empty. Clicking it opens an in-page modal with title “资料链接”, selected task title, “长按可复制：”, and a selectable URL block. Overlay and close button dismiss it; no iframe or navigation is used.

- [ ] **Step 4: Implement proof upload and submission**

Keep proof fields initialized from the selected task. Upload with `uploadMamaResourceScreenshot`; submit with `submitMamaResourceTaskProof(taskId, { proofLink, proofScreenshotUrl })`; disable duplicate actions, preserve fields on errors, and update both detail and list on success.

- [ ] **Step 5: Update current project context**

Rewrite the Mama Haozhuan current-focus sentence in `docs/ACTIVE_CONTEXT.md` to include Web/mobile task-management parity.

- [ ] **Step 6: Run focused test and frontend build**

Run: `node --test frontend/src/pages/MamaResourceApplyPage.test.mjs`

Run: `npm run build` from `frontend/`.

Expected: both commands exit 0.

- [ ] **Step 7: Verify mobile rendering**

Start the existing local frontend, open `/mama-resources/apply` at a mobile viewport, and capture the approved account home, task detail, and content-link dialog. Compare hierarchy and visible fields with the supplied mini-program reference before reporting visual completion.
