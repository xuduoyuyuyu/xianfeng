# Profile Onboarding Login Conflict Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve anonymous onboarding data until login, then safely match, add, or discard it without overwriting any existing child profile.

**Architecture:** `profileOnboarding.js` owns an isolated pending draft and a pure reconciliation decision over remote children. The mounted onboarding component fetches account sync data after login, renders the confirmation state, and applies the user's choice; the existing native settings login path only notifies that component. Existing backend GET/PATCH endpoints and models remain unchanged.

**Tech Stack:** WeChat Mini Program JavaScript/WXML/WXSS, Node.js built-in test runner, existing `/api/users/me` and `/api/users/me/xiaowanzi-sync` APIs.

## Global Constraints

- Never overwrite an existing child profile with anonymous onboarding data.
- Compare only trimmed `city`, `region`, and `grade`; all three must match.
- A different pending profile requires explicit confirmation before creation.
- Closing the confirmation keeps pending data for the next entry.
- New default names are `孩子`, `孩子2`, `孩子3`, choosing the first unused value.
- Do not change backend schemas or endpoints.
- Preserve the user's existing uncommitted tab-bar files and unrelated worktree content.

---

### Task 1: Pending Draft and Pure Reconciliation Rules

**Files:**
- Modify: `apps/wechat-miniprogram/utils/profileOnboarding.js`
- Test: `apps/wechat-miniprogram/utils/profileOnboarding.test.mjs`

**Interfaces:**
- Produces: `PENDING_PROFILE_KEY`, `readPendingProfileOnboarding()`, `reconcilePendingProfileOnboarding(children)`, `applyPendingProfileOnboardingDecision(action, children)`, and the existing `saveProfileOnboardingDraft(draft)` / `buildPersonalizationQuery()` with pending-aware behavior.
- Reconciliation result: `{ status: "none" | "matched" | "created" | "confirm", children, childId, pending }`.

- [ ] **Step 1: Write failing tests for anonymous storage and matching**

Add focused tests that assert:

```js
test("anonymous onboarding stays pending and does not overwrite formal children", async () => {
  const existing = [{ id: "old", displayName: "大宝", city: "上海", region: "徐汇区", grade: "小学三年级" }];
  const { profile, storage } = loadProfile({ xf_child_profiles: existing });

  await profile.saveProfileOnboardingDraft({ city: "上海", region: "长宁区", stage: "小学", gradeName: "一年级" });

  assert.deepEqual(storage.xf_child_profiles, existing);
  assert.deepEqual(profile.readPendingProfileOnboarding(), {
    city: "上海", region: "长宁区", grade: "小学一年级"
  });
});

test("reconciliation matches an existing child without changing the list", async () => {
  const children = [
    { id: "one", displayName: "大宝", city: "上海", region: "徐汇区", grade: "小学三年级" },
    { id: "two", displayName: "二宝", city: "上海", region: "长宁区", grade: "小学一年级" },
  ];
  const { profile } = loadProfile({
    xf_profile_onboarding_pending_v1: { city: " 上海 ", region: "长宁区", grade: "小学一年级" },
  });

  const result = profile.reconcilePendingProfileOnboarding(children);
  assert.equal(result.status, "matched");
  assert.equal(result.childId, "two");
  assert.deepEqual(result.children, children);
});
```

- [ ] **Step 2: Run the utility tests and verify RED**

Run:

```bash
node --test apps/wechat-miniprogram/utils/profileOnboarding.test.mjs
```

Expected: FAIL because pending/reconciliation exports do not exist and the current save overwrites the selected child.

- [ ] **Step 3: Implement pending storage and pure reconciliation**

In `profileOnboarding.js`:

```js
const PENDING_PROFILE_KEY = "xf_profile_onboarding_pending_v1";

function normalizeBasicProfile(value) {
  return {
    city: trim(value && value.city),
    region: trim(value && value.region),
    grade: trim(value && value.grade),
  };
}

function readPendingProfileOnboarding() {
  const pending = normalizeBasicProfile(wx.getStorageSync(PENDING_PROFILE_KEY));
  return isBasicProfileComplete(pending) ? pending : null;
}

function sameBasicProfile(left, right) {
  const a = normalizeBasicProfile(left);
  const b = normalizeBasicProfile(right);
  return a.city === b.city && a.region === b.region && a.grade === b.grade;
}

function nextDefaultChildName(children) {
  const used = new Set(children.map((child) => trim(child && child.displayName)));
  if (!used.has("孩子")) return "孩子";
  let index = 2;
  while (used.has(`孩子${index}`)) index += 1;
  return `孩子${index}`;
}
```

Change `saveProfileOnboardingDraft` to always store only pending and return immediately, even if a token already exists; account ownership must be established from the remote read before any formal write. Make `buildPersonalizationQuery()` prefer a complete pending draft, then fall back to the active formal child. Implement `reconcilePendingProfileOnboarding(children)` without writes:

- no pending -> `none`;
- exact match -> `matched` with matching `childId`;
- empty children -> construct one new child and return `created`;
- otherwise -> `confirm` without altering children.

- [ ] **Step 4: Add failing tests for add, discard, naming, and idempotence**

Add tests that exercise `applyPendingProfileOnboardingDecision`:

```js
test("confirming a different pending profile appends a uniquely named child", () => {
  const children = [
    { id: "one", displayName: "孩子", city: "上海", region: "徐汇区", grade: "小学三年级" },
    { id: "two", displayName: "孩子2", city: "上海", region: "静安区", grade: "小学五年级" },
  ];
  const { profile, storage } = loadProfile({
    xf_profile_onboarding_pending_v1: { city: "上海", region: "长宁区", grade: "小学一年级" },
  });

  const result = profile.applyPendingProfileOnboardingDecision("create", children);
  assert.equal(result.children.length, 3);
  assert.equal(result.children[2].displayName, "孩子3");
  assert.deepEqual(result.children.slice(0, 2), children);
  assert.equal(storage.xf_profile_onboarding_pending_v1, undefined);
});

test("discarding pending onboarding preserves every formal child", () => {
  const children = [{ id: "one", displayName: "大宝" }];
  const { profile, storage } = loadProfile({
    xf_profile_onboarding_pending_v1: { city: "上海", region: "长宁区", grade: "小学一年级" },
  });
  const result = profile.applyPendingProfileOnboardingDecision("discard", children);
  assert.deepEqual(result.children, children);
  assert.equal(storage.xf_profile_onboarding_pending_v1, undefined);
});
```

- [ ] **Step 5: Run tests to verify RED, implement decision writes, then verify GREEN**

Implementation requirements:

- `create` re-runs exact matching before appending, preventing duplicate creation on repeated callbacks.
- `discard` clears only pending.
- `matched`/`created`/`create` saves formal children, updates `xiaowanzi_last_child_id_v1`, and clears pending.
- Logged-in direct onboarding submits pending first and immediately invokes the same remote reconciliation path; it never uses the old selected-child overwrite path.

Run:

```bash
node --test apps/wechat-miniprogram/utils/profileOnboarding.test.mjs
```

Expected: all utility tests PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/wechat-miniprogram/utils/profileOnboarding.js apps/wechat-miniprogram/utils/profileOnboarding.test.mjs
git commit -m "fix: preserve pending onboarding profiles"
```

---

### Task 2: Login Reconciliation and Confirmation UI

**Files:**
- Modify: `apps/wechat-miniprogram/components/profile-onboarding/index.js`
- Modify: `apps/wechat-miniprogram/components/profile-onboarding/index.wxml`
- Modify: `apps/wechat-miniprogram/components/profile-onboarding/index.wxss`
- Test: `apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs`
- Test: `apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs`

**Interfaces:**
- Consumes: Task 1 reconciliation functions.
- Produces: component method `reconcileAfterLogin()`, actions `createPendingChild()`, `discardPendingProfile()`, and state `conflictVisible`, `reconciling`.

- [ ] **Step 1: Write failing component tests**

Add tests proving:

```js
assert.match(wxml, /发现已有孩子档案/);
assert.match(wxml, /建立新档案/);
assert.match(wxml, /丢弃本次填写/);
assert.match(wxml, /bindtap="createPendingChild"/);
assert.match(wxml, /bindtap="discardPendingProfile"/);
```

Load the component definition with stubbed request/reconciliation functions and assert:

- GET `/api/users/me/xiaowanzi-sync` runs after `reconcileAfterLogin()`;
- `confirm` makes the conflict UI visible without PATCH;
- `matched` and `created` emit `saved` with `{ reason: "reconciled" }`;
- closing the conflict only hides it and does not clear pending.
- saving the form while already logged in stores pending and calls `reconcileAfterLogin()` instead of emitting a completed save before the remote comparison.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
node --test apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs
```

Expected: FAIL because the conflict state and actions are absent.

- [ ] **Step 3: Implement reconciliation orchestration**

In the component:

```js
async reconcileAfterLogin() {
  if (!getToken() || !readPendingProfileOnboarding() || this.data.reconciling) return;
  this.setData({ reconciling: true, message: "" });
  try {
    const remote = await request({ url: "/api/users/me/xiaowanzi-sync" });
    const children = mergeChildProfileRecords(remote && remote.childProfiles, [], { avatarFallback: CHILD_AVATAR });
    const result = reconcilePendingProfileOnboarding(children);
    if (result.status === "confirm") {
      this.remoteChildren = children;
      this.setData({ conflictVisible: true, visible: false });
      return;
    }
    await persistReconciledProfile(result);
    this.triggerEvent("saved", { reason: "reconciled", childId: result.childId });
  } catch (_error) {
    this.setData({ message: "登录资料读取失败，稍后将再次确认" });
  } finally {
    this.setData({ reconciling: false });
  }
}
```

Use the repository's existing `request`, profile merge helpers, and avatar constant rather than duplicating HTTP or normalization behavior. `persistReconciledProfile` must PATCH sync only for `created`/confirmed create; matched/discarded outcomes perform no remote child overwrite. PATCH `/api/users/me` only when a new child becomes active.

- [ ] **Step 4: Implement the confirmation card**

Render a second card inside the existing mask when `conflictVisible`:

```xml
<view wx:if="{{conflictVisible}}" class="xf-profile-onboarding-card" catchtap="noop">
  <button class="xf-profile-onboarding-close" bindtap="closeConflict" aria-label="关闭">×</button>
  <image class="xf-profile-onboarding-avatar" src="/assets/wel-avatar/wizard.png" mode="aspectFit" />
  <text class="xf-profile-onboarding-title">发现已有孩子档案</text>
  <text class="xf-profile-onboarding-subtitle">刚才填写的信息与已有档案不同，是否为另一个孩子建立新档案？</text>
  <button class="xf-profile-onboarding-submit" bindtap="createPendingChild">建立新档案</button>
  <button class="xf-profile-onboarding-secondary" bindtap="discardPendingProfile">丢弃本次填写</button>
</view>
```

Reuse existing card spacing and add only the secondary button style required by this state.

- [ ] **Step 5: Run component tests and verify GREEN**

Run:

```bash
node --test apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs
```

Expected: all component/static tests PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/wechat-miniprogram/components/profile-onboarding/index.js apps/wechat-miniprogram/components/profile-onboarding/index.wxml apps/wechat-miniprogram/components/profile-onboarding/index.wxss apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs
git commit -m "feat: confirm onboarding profile conflicts"
```

---

### Task 3: Notify Onboarding After Phone Login and Refresh Content

**Files:**
- Modify: `apps/wechat-miniprogram/utils/nativeSettings.js`
- Modify: `apps/wechat-miniprogram/pages/programs/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/reading/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/materials/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/topics/index.wxml`
- Test: `apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs`
- Test: `apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: component method `reconcileAfterLogin()` and existing page `onProfileOnboardingSaved()` handlers.
- Produces: one stable component id, `profileOnboarding`, on all four primary list pages.

- [ ] **Step 1: Write failing login-notification tests**

Add static assertions:

```js
for (const source of [programsWxml, readingWxml, materialsWxml, topicsWxml]) {
  assert.match(source, /<profile-onboarding id="profileOnboarding" bind:saved="onProfileOnboardingSaved"/);
}
assert.match(nativeSettingsSource, /selectComponent\("#profileOnboarding"\)/);
assert.match(nativeSettingsSource, /reconcileAfterLogin\(\)/);
```

Retain the existing assertion that each page's saved handler clears its visible list cache and reloads page one.

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```bash
node --test apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs
```

Expected: FAIL because the component has no stable id and login does not notify it.

- [ ] **Step 3: Add the single login notification hook**

After `setSession(payload)` and existing page-specific login success callback, call:

```js
const onboarding = typeof this.selectComponent === "function"
  ? this.selectComponent("#profileOnboarding")
  : null;
if (onboarding && typeof onboarding.reconcileAfterLogin === "function") {
  void onboarding.reconcileAfterLogin();
}
```

Add `id="profileOnboarding"` to the four existing component tags. Do not add new page-specific merge functions.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:

```bash
node --test apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: all tests PASS, including current list refresh assertions.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/wechat-miniprogram/utils/nativeSettings.js apps/wechat-miniprogram/pages/programs/index.wxml apps/wechat-miniprogram/pages/reading/index.wxml apps/wechat-miniprogram/pages/materials/index.wxml apps/wechat-miniprogram/pages/topics/index.wxml apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "fix: reconcile onboarding after login"
```

---

### Task 4: Regression Verification and Governance Update

**Files:**
- Modify: `docs/modules/platform-release-and-app-shells.md`
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Documents the durable pending-vs-formal profile ownership and the login confirmation rule.

- [ ] **Step 1: Remove generated AppleDouble files before package tests**

Run:

```bash
find apps/wechat-miniprogram -name '._*' -type f -delete
```

Expected: no output; `find apps/wechat-miniprogram -name '._*' -type f -print` returns nothing.

- [ ] **Step 2: Run the focused and broad mini-program tests**

Run:

```bash
node --test \
  apps/wechat-miniprogram/utils/profileOnboarding.test.mjs \
  apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs \
  apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs \
  apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs \
  apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: all tests PASS with zero failures and the AppleDouble guard PASS.

- [ ] **Step 3: Update governance docs**

Add these exact durable rules:

- Anonymous onboarding fields are pending personalization context, not a formal child archive.
- Login reconciliation reads remote child profiles before any write.
- Different pending data requires an explicit create-or-discard decision and never overwrites an existing child.

Keep `docs/ACTIVE_CONTEXT.md` a concise current snapshot rather than a journal.

- [ ] **Step 4: Run diff and status checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Only planned implementation/docs plus the user's pre-existing unrelated modifications and untracked outputs are present.

- [ ] **Step 5: Perform WeChat DevTools runtime verification when available**

Verify on a primary list route:

1. Logged out: submit onboarding fields and observe immediate personalized reload.
2. Authorize an account with an exact matching child: no dialog and no duplicate.
3. Authorize an account with a different existing child: confirmation appears.
4. Close confirmation: existing child unchanged; reopen/foreground prompts again.
5. Choose discard: pending disappears; existing child remains active; content reloads.
6. Repeat with fresh pending and choose create: old child remains byte-for-byte unchanged; new uniquely named child is active; content reloads using the new fields.

If DevTools authentication cannot reach the real login environment, report this step as not verified rather than inferring success from unit tests.

- [ ] **Step 6: Commit Task 4**

```bash
git add docs/modules/platform-release-and-app-shells.md docs/ACTIVE_CONTEXT.md
git commit -m "docs: record onboarding conflict ownership"
```
