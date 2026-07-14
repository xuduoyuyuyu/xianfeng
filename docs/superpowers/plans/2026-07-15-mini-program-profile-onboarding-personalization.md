# Mini Program Profile Onboarding Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeat-until-complete native mini-program profile dialog that saves city, region, and child grade into the existing user/archive fields and prioritizes matching content in the four main lists.

**Architecture:** A shared mini-program profile state module remains the only client owner of the active child and personalization query. One reusable native component is mounted by the four main tab pages and emits a save event so the visible page can invalidate only its own cache and reload. The backend uses a shared, allowlisted personalization parser and Mongo aggregation score stages so matching happens before pagination while requests without profile parameters keep their existing query path and ordering.

**Tech Stack:** WeChat Mini Program CommonJS/WXML/WXSS, Node.js built-in test runner, Express, TypeScript, Mongoose/MongoDB aggregation.

## Global Constraints

- Collect only city, region, and child stage/grade; do not request phone authorization, name, or birthday.
- If no archive exists, create one with `displayName: "孩子"`; if archives exist, update the last-used child or the first child.
- Closing suppresses the dialog only for the current foreground session; incomplete data must prompt again on the next `App.onShow` cycle.
- Persist locally before remote sync; remote failure must not reopen or block the dialog.
- Logged-in saves update `User.city`, `User.region`, `User.childGrade`, and `/api/users/me/xiaowanzi-sync`.
- Personalization applies only to the ordinary Programs, Reading, Materials, and Topics main lists; search, detail, related-content, external-book-library, and admin routes remain unchanged.
- Matching priority is region, city, exact grade, then stage; zero-score content remains visible and equal scores retain the original business order.
- No-profile requests must retain the existing query path, response shape, and ordering.
- Use only existing content fields; do not add inferred content metadata or migrate production data.
- Do not touch unrelated existing changes in `apps/wechat-miniprogram/custom-tab-bar/index.wxss`, `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`, existing July 14 docs, `exports/`, or `outputs/`.

---

### Task 1: Shared Mini-Program Profile State and Grade Options

**Files:**
- Create: `apps/wechat-miniprogram/utils/profileOnboarding.js`
- Create: `apps/wechat-miniprogram/utils/profileOnboarding.test.mjs`
- Modify: `apps/wechat-miniprogram/utils/nativeSettings.js`
- Modify: `apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs`
- Modify: `apps/wechat-miniprogram/app.js`

**Interfaces:**
- Consumes: `CHILD_PROFILES_KEY`, `WEB_CHILD_PROFILES_KEY`, `mergeChildProfileRecords()` from `utils/profileState.js`; `getToken()` and `request()` from existing utilities.
- Produces: `getProfileOnboardingState()`, `saveProfileOnboardingDraft(draft)`, `buildPersonalizationQuery()`, `syncProfileOnboardingRemote()`, `dismissProfileOnboardingForSession()`, `resetProfileOnboardingSession()`, `STAGES`, `gradesFor(stage, city)`, `formatGrade(stage, gradeName)`, and `districtsFor(city)`.

- [ ] **Step 1: Write failing behavior tests for active-child selection and completeness**

```js
test("selects the last-used child and reports incomplete profile fields", () => {
  wxStorage.xiaowanzi_last_child_id_v1 = "child-2";
  wxStorage.xf_child_profiles = [
    { id: "child-1", displayName: "大宝", city: "上海", region: "徐汇区", grade: "小学三年级" },
    { id: "child-2", displayName: "二宝", city: "上海", region: "", grade: "小学一年级" },
  ];
  assert.deepEqual(profile.getProfileOnboardingState(), {
    visible: true,
    childId: "child-2",
    city: "上海",
    region: "",
    grade: "小学一年级",
  });
});

test("creates a base child named 孩子 and updates the same record on repeat save", async () => {
  await profile.saveProfileOnboardingDraft({ city: "上海", region: "徐汇区", stage: "小学", gradeName: "三年级" });
  await profile.saveProfileOnboardingDraft({ city: "上海", region: "长宁区", stage: "小学", gradeName: "四年级" });
  const children = wxStorage.xf_child_profiles;
  assert.equal(children.length, 1);
  assert.equal(children[0].displayName, "孩子");
  assert.equal(children[0].region, "长宁区");
  assert.equal(children[0].grade, "小学四年级");
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test apps/wechat-miniprogram/utils/profileOnboarding.test.mjs`

Expected: FAIL because `utils/profileOnboarding.js` does not exist.

- [ ] **Step 3: Implement the minimal profile owner and extract shared option helpers**

Implement `profileOnboarding.js` so it:

```js
function activeChild(children) {
  const lastId = String(wx.getStorageSync(LAST_CHILD_ID_KEY) || "");
  return children.find((child) => child.id === lastId) || children[0] || null;
}

function isBasicProfileComplete(child) {
  return Boolean(child && trim(child.city) && trim(child.region) && trim(child.grade));
}

function buildPersonalizationQuery() {
  const child = activeChild(loadChildren());
  if (!isBasicProfileComplete(child)) return "";
  return [
    ["profileCity", child.city],
    ["profileRegion", child.region],
    ["profileGrade", child.grade],
  ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}
```

Move `STAGES`, `GRADES_BY_STAGE`, `WUSI_CITIES`, `DISTRICTS_BY_CITY`, `gradesFor`, `formatGrade`, and `districtsFor` out of `nativeSettings.js` into the new module, then import them back into `nativeSettings.js`. Do not change archive picker behavior.

`saveProfileOnboardingDraft()` must merge and write both existing storage keys, set `xiaowanzi_last_child_id_v1`, and use `displayName: "孩子"`, `draft: false`, and a stable generated id when creating the first record. Set a dedicated local retry flag only when remote sync fails; do not create a second profile payload store.

`app.onShow()` calls `resetProfileOnboardingSession()` once per foreground entry. `dismissProfileOnboardingForSession()` changes only module memory and never writes storage.

- [ ] **Step 4: Add and run tests for session dismissal, query encoding, grade options, and local-first remote failure**

```js
test("dismissal lasts only until the next foreground reset", () => {
  profile.dismissProfileOnboardingForSession();
  assert.equal(profile.getProfileOnboardingState().visible, false);
  profile.resetProfileOnboardingSession();
  assert.equal(profile.getProfileOnboardingState().visible, true);
});

test("builds encoded profile parameters only for complete profiles", () => {
  seedChild({ city: "上海", region: "浦东新区", grade: "小学三年级" });
  assert.equal(profile.buildPersonalizationQuery(), "profileCity=%E4%B8%8A%E6%B5%B7&profileRegion=%E6%B5%A6%E4%B8%9C%E6%96%B0%E5%8C%BA&profileGrade=%E5%B0%8F%E5%AD%A6%E4%B8%89%E5%B9%B4%E7%BA%A7");
});

test("keeps local save when account sync rejects", async () => {
  requestStub.rejectOnce(new Error("offline"));
  await profile.saveProfileOnboardingDraft({ city: "上海", region: "徐汇区", stage: "小学", gradeName: "三年级" });
  assert.equal(wxStorage.xf_child_profiles[0].region, "徐汇区");
  assert.equal(wxStorage.xf_profile_onboarding_sync_pending_v1, true);
});
```

Run: `node --test apps/wechat-miniprogram/utils/profileOnboarding.test.mjs apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/wechat-miniprogram/app.js apps/wechat-miniprogram/utils/profileOnboarding.js apps/wechat-miniprogram/utils/profileOnboarding.test.mjs apps/wechat-miniprogram/utils/nativeSettings.js apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs
git commit -m "feat: add mini profile onboarding state"
```

### Task 2: Reusable Native Profile Dialog

**Files:**
- Create: `apps/wechat-miniprogram/components/profile-onboarding/index.js`
- Create: `apps/wechat-miniprogram/components/profile-onboarding/index.json`
- Create: `apps/wechat-miniprogram/components/profile-onboarding/index.wxml`
- Create: `apps/wechat-miniprogram/components/profile-onboarding/index.wxss`
- Create: `apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs`
- Modify: `apps/wechat-miniprogram/app.json`

**Interfaces:**
- Consumes: Task 1 profile state and option helpers.
- Produces: globally registered `<profile-onboarding bind:saved="onProfileOnboardingSaved" />` component and `saved` event with `{ city, region, grade }`.

- [ ] **Step 1: Write a failing component contract test**

```js
test("dialog contains the required fields and no auth or extra child fields", () => {
  assert.match(wxml, /城市/);
  assert.match(wxml, /区域/);
  assert.match(wxml, /学段/);
  assert.match(wxml, /年级/);
  assert.doesNotMatch(wxml, /getPhoneNumber|手机号|出生日期|孩子姓名/);
  assert.match(js, /dismissProfileOnboardingForSession/);
  assert.match(js, /saveProfileOnboardingDraft/);
  assert.match(js, /this\.triggerEvent\("saved"/);
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `node --test apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs`

Expected: FAIL because the component files do not exist.

- [ ] **Step 3: Implement the minimal dialog**

Register the component globally in `app.json`:

```json
"usingComponents": {
  "profile-onboarding": "/components/profile-onboarding/index"
}
```

The component must initialize from `getProfileOnboardingState()` in `pageLifetimes.show`, use native `picker` controls, prevent mask taps from closing it, and expose only two exits:

```js
close() {
  dismissProfileOnboardingForSession();
  this.setData({ visible: false, message: "" });
},

async save() {
  if (!this.data.city || !this.data.region || !this.data.stage || !this.data.gradeName) {
    this.setData({ message: "请完整选择城市、区域和年级" });
    return;
  }
  if (this.data.saving) return;
  this.setData({ saving: true, message: "" });
  const result = await saveProfileOnboardingDraft(this.data);
  this.setData({ saving: false, visible: false });
  this.triggerEvent("saved", result);
}
```

Use `/assets/tabbar/xiaowanzi.png` for the top image and match the supplied reference with a dark mask, centered white rounded card, top-right close button, purple primary action, and disabled/saving states. Reuse picker option labels from Task 1; do not hardcode a second city/grade table in the component.

- [ ] **Step 4: Run the component contract test**

Run: `node --test apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/wechat-miniprogram/app.json apps/wechat-miniprogram/components/profile-onboarding
git commit -m "feat: add mini profile onboarding dialog"
```

### Task 3: Mount the Dialog and Personalize the Four Main List Requests

**Files:**
- Modify: `apps/wechat-miniprogram/pages/programs/index.js`
- Modify: `apps/wechat-miniprogram/pages/programs/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/reading/index.js`
- Modify: `apps/wechat-miniprogram/pages/reading/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/materials/index.js`
- Modify: `apps/wechat-miniprogram/pages/materials/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/topics/index.js`
- Modify: `apps/wechat-miniprogram/pages/topics/index.wxml`
- Create: `apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs`
- Modify: `apps/wechat-miniprogram/utils/readingPreload.js`

**Interfaces:**
- Consumes: `<profile-onboarding>`, `buildPersonalizationQuery()`, and existing page reload/cache functions.
- Produces: profile-aware ordinary list URLs and `onProfileOnboardingSaved()` on all four main pages.

- [ ] **Step 1: Write failing source-contract tests for all four pages**

```js
for (const page of [programs, reading, materials, topics]) {
  assert.match(page.wxml, /<profile-onboarding bind:saved="onProfileOnboardingSaved"\s*\/>/);
  assert.match(page.js, /buildPersonalizationQuery/);
  assert.match(page.js, /onProfileOnboardingSaved\(\)/);
}
assert.doesNotMatch(programs.js, /profileCity.*openSearch|openSearch.*profileCity/s);
assert.doesNotMatch(topics.js, /profileCity.*searchUrl|searchUrl.*profileCity/s);
```

- [ ] **Step 2: Run the source-contract test and verify RED**

Run: `node --test apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs`

Expected: FAIL because the component is not mounted and list URLs lack personalization.

- [ ] **Step 3: Add profile parameters only to ordinary main-list URLs**

Use one URL helper pattern on each page:

```js
function appendProfileQuery(url) {
  const profileQuery = buildPersonalizationQuery();
  if (!profileQuery) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${profileQuery}`;
}
```

Apply it to:

- `/api/programs?page=...&pageSize=...` in normal initial/load-more requests.
- Native `/api/books?current=...&size=...` preload and page requests; do not modify `/api/books/external`.
- `/api/learning-materials` normal list request.
- `buildTopicListUrl()` only when it is called for the ordinary main list; explicitly omit the profile query for `search`, generated-topic, detail, node, progress, and admin paths.

Profile-aware list cache identity must include the exact encoded profile query. Do not clear unrelated cache keys.

- [ ] **Step 4: Handle save by invalidating only four list caches and reloading the visible page**

Each page implements the same small page-owned reaction:

```js
onProfileOnboardingSaved() {
  wx.removeStorageSync(CURRENT_PAGE_CACHE_KEY);
  this.loadPrograms({ showRefreshing: true }); // use the matching page loader name
}
```

For Reading, invalidate the native first-page/full-library preload entries through a focused exported `clearReadingProfileCaches()` helper instead of duplicating private preload cache details in the page.

- [ ] **Step 5: Run mini-program tests**

Run: `node --test apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs apps/wechat-miniprogram/pages/tab-webview.static.test.mjs apps/wechat-miniprogram/utils/profileOnboarding.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/wechat-miniprogram/pages/programs/index.js apps/wechat-miniprogram/pages/programs/index.wxml apps/wechat-miniprogram/pages/reading/index.js apps/wechat-miniprogram/pages/reading/index.wxml apps/wechat-miniprogram/pages/materials/index.js apps/wechat-miniprogram/pages/materials/index.wxml apps/wechat-miniprogram/pages/topics/index.js apps/wechat-miniprogram/pages/topics/index.wxml apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs apps/wechat-miniprogram/utils/readingPreload.js
git commit -m "feat: personalize mini content list requests"
```

### Task 4: Backend Personalization Parser and Stable Mongo Sort Stages

**Files:**
- Create: `backend/src/services/contentPersonalization.ts`
- Create: `backend/src/services/contentPersonalization.test.ts`

**Interfaces:**
- Consumes: raw Express query values and per-model Mongo text expressions.
- Produces: `parseContentProfile(query): ContentProfile | null`, `profileStage(grade): string`, and `buildPersonalizedSortStages(profile, searchableExpressions, originalSort): PipelineStage[]`.

- [ ] **Step 1: Write failing parser and priority tests**

```ts
test("normalizes bounded profile query text", () => {
  assert.deepEqual(parseContentProfile({
    profileCity: " 上海市 ",
    profileRegion: "徐汇区",
    profileGrade: "小学三年级",
  }), { city: "上海市", region: "徐汇区", grade: "小学三年级", stage: "小学" });
});

test("builds score priority region then city then exact grade then stage", () => {
  const stages = buildPersonalizedSortStages(profile, ["$title", "$description", "$tags"], { publishedAt: -1, _id: -1 });
  assert.deepEqual(extractWeights(stages), { region: 1000, city: 100, grade: 10, stage: 1 });
  assert.deepEqual(stages.at(-1), { $sort: { __profileScore: -1, publishedAt: -1, _id: -1 } });
});

test("rejects partial and overlong profiles", () => {
  assert.equal(parseContentProfile({ profileCity: "上海", profileRegion: "", profileGrade: "小学三年级" }), null);
  assert.equal(parseContentProfile({ profileCity: "上".repeat(81), profileRegion: "徐汇区", profileGrade: "小学三年级" }), null);
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run from `backend/`: `node --test --import tsx src/services/contentPersonalization.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement allowlisted parsing and aggregation stages**

```ts
export type ContentProfile = { city: string; region: string; grade: string; stage: "学前" | "小学" | "初中" | "高中" };

export function parseContentProfile(query: Record<string, unknown>): ContentProfile | null {
  const city = clean(query.profileCity, 80);
  const region = clean(query.profileRegion, 80);
  const grade = clean(query.profileGrade, 80);
  const stage = profileStage(grade);
  return city && region && grade && stage ? { city, region, grade, stage } : null;
}
```

`buildPersonalizedSortStages()` must:

- concatenate only caller-supplied, allowlisted Mongo expressions;
- compute case-insensitive substring presence without interpolating raw query keys;
- add weights `1000`, `100`, `10`, and `1`;
- sort by `__profileScore` then every key from the caller's original sort;
- project out `__profileScore` and temporary text fields before returning documents.

Do not use `$where`, JavaScript evaluation, raw query object spread, or regular expressions constructed from unescaped user input.

- [ ] **Step 4: Run the service tests**

Run from `backend/`: `node --test --import tsx src/services/contentPersonalization.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add backend/src/services/contentPersonalization.ts backend/src/services/contentPersonalization.test.ts
git commit -m "feat: add stable content personalization scoring"
```

### Task 5: Integrate Pre-Pagination Ranking into Four Public Endpoints

**Files:**
- Modify: `backend/src/controllers/program.ts`
- Modify: `backend/src/controllers/program.public-status.test.mjs`
- Modify: `backend/src/controllers/book.ts`
- Modify: `backend/src/controllers/book.metadata.test.mjs`
- Modify: `backend/src/controllers/learningMaterial.ts`
- Create: `backend/src/controllers/learningMaterial.personalization.test.ts`
- Modify: `backend/src/routes/topic.ts`
- Create: `backend/src/routes/topic.personalization.test.ts`

**Interfaces:**
- Consumes: Task 4 parser and aggregation stages.
- Produces: personalized ordinary public list responses with unchanged schemas and pre-pagination stable ordering.

- [ ] **Step 1: Add failing endpoint/controller contract tests**

Add assertions that each ordinary list handler:

```js
assert.match(source, /parseContentProfile\(req\.query/);
assert.match(source, /buildPersonalizedSortStages/);
assert.match(source, /profile\s*\?.*aggregate/s);
assert.match(source, /:\s*.*find\(/s); // preserve no-profile legacy path
```

The TypeScript route tests must seed four records whose original order conflicts with region/city/grade/stage scores, request page 1 with `limit=2`, and assert that the two highest-scoring records are returned before pagination. A second request without profile parameters must assert the original order.

- [ ] **Step 2: Run targeted tests and verify RED**

Run from `backend/`:

```bash
node --test --import tsx \
  src/services/contentPersonalization.test.ts \
  src/controllers/learningMaterial.personalization.test.ts \
  src/routes/topic.personalization.test.ts
node --test src/controllers/program.public-status.test.mjs src/controllers/book.metadata.test.mjs
```

Expected: FAIL because public handlers do not use the new profile sorter.

- [ ] **Step 3: Integrate Programs and Topics without changing no-profile behavior**

Programs profile fields:

```ts
["$title", "$description", "$summary.headline", "$summary.body", "$summary.tags"]
```

Original program sort remains `{ publishedAt: -1, createdAt: -1, _id: -1 }`. Apply `$skip` and `$limit` only after the personalization `$sort`. Keep `attachDictionaryEntriesToPrograms()` and `attachGuestBindingsToPrograms()` after selection.

Topics profile fields:

```ts
["$title", "$subtitle", "$description", "$shortSummary", "$tags", "$suitableGrades"]
```

Preserve the current `createdAt`/`viewCount` selection and the special current-user pending-topic priority. Search requests must stay on the existing path and must not apply profile ranking even if profile parameters are present.

- [ ] **Step 4: Integrate Books and Learning Materials**

Books profile fields:

```ts
["$title", "$categoryLabel", "$topic", "$description", "$grade", "$sourceName"]
```

Preserve the existing quality-score order as the secondary business order. Extend `findPagedPublicBooksPrioritizingDescriptions()` to accept `ContentProfile | null`, calculate profile score before slicing, compare profile score first, then `compareBookQualityScores()`, then existing index. Do not personalize `/api/books/external`.

Learning Material profile fields:

```ts
["$title", "$description", "$category"]
```

Keep the legacy array response. With profile parameters, aggregate and sort before returning; without them, retain the current `find({ status: "published" }).sort({ publishedAt: -1 })` path exactly.

- [ ] **Step 5: Run all targeted backend tests**

Run from `backend/`:

```bash
node --test --import tsx \
  src/services/contentPersonalization.test.ts \
  src/controllers/learningMaterial.personalization.test.ts \
  src/routes/topic.personalization.test.ts
node --test src/controllers/program.public-status.test.mjs src/controllers/book.metadata.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add backend/src/services/contentPersonalization.ts backend/src/controllers/program.ts backend/src/controllers/program.public-status.test.mjs backend/src/controllers/book.ts backend/src/controllers/book.metadata.test.mjs backend/src/controllers/learningMaterial.ts backend/src/controllers/learningMaterial.personalization.test.ts backend/src/routes/topic.ts backend/src/routes/topic.personalization.test.ts
git commit -m "feat: prioritize profile-matched public content"
```

### Task 6: Persist Personal Profile Fields and Retry Archive Sync

**Files:**
- Modify: `backend/src/controllers/user.ts`
- Modify: `backend/src/controllers/user.location.test.ts`
- Modify: `apps/wechat-miniprogram/utils/profileOnboarding.js`
- Modify: `apps/wechat-miniprogram/utils/profileOnboarding.test.mjs`
- Modify: `apps/wechat-miniprogram/app.js`

**Interfaces:**
- Consumes: `PATCH /api/users/me`, `PATCH /api/users/me/xiaowanzi-sync`, and current mini-program session setter.
- Produces: `childGrade` in `/api/users/me` update/response and automatic retry from the app's successful login/session restoration entrypoints.

- [ ] **Step 1: Write failing user-route and login-retry tests**

```ts
test("patchMeCompat stores childGrade separately from legacy grade", async () => {
  await request(app).patch("/api/users/me").set(auth).send({ city: "上海", region: "徐汇区", childGrade: "小学三年级" }).expect(200);
  const user = await User.findById(userId).lean();
  assert.equal(user?.childGrade, "小学三年级");
});
```

```js
test("successful session setup retries pending profile sync once", async () => {
  wxStorage.xf_profile_onboarding_sync_pending_v1 = true;
  await app.setLoginSession(loginPayload);
  assert.equal(requests.filter((item) => item.url === "/api/users/me").length, 1);
  assert.equal(requests.filter((item) => item.url === "/api/users/me/xiaowanzi-sync").length, 1);
  assert.equal(wxStorage.xf_profile_onboarding_sync_pending_v1, undefined);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend && node --test --import tsx src/controllers/user.location.test.ts
node --test apps/wechat-miniprogram/utils/profileOnboarding.test.mjs
```

Expected: FAIL because `patchMeCompat` ignores `childGrade` and login does not retry onboarding sync.

- [ ] **Step 3: Implement exact user-field update and response compatibility**

In `patchMeCompat`:

```ts
if (typeof body.childGrade === "string") user.childGrade = body.childGrade.trim().slice(0, 80);
```

Expose `childGrade` explicitly in `buildWelProfile()` while retaining `grade: user.grade || user.childGrade || ""` for compatibility. Do not overwrite legacy `grade` when onboarding saves `childGrade`.

On a logged-in onboarding save, issue both remote requests from one helper:

```js
await Promise.all([
  request({ url: "/api/users/me", method: "PATCH", data: { city, region, childGrade: grade } }),
  request({ url: "/api/users/me/xiaowanzi-sync", method: "PATCH", data: { childProfiles: children } }),
]);
```

After `app.setLoginSession()` or successful `app.refreshMe()`, call `syncProfileOnboardingRemote()` only if the pending flag exists or local profile differs from the returned account fields. Keep `utils/session.js` synchronous and storage-only. Deduplicate by child id; never append a second `孩子` record during retry.

- [ ] **Step 4: Run user and mini-program tests**

Run:

```bash
cd backend && node --test --import tsx src/controllers/user.location.test.ts
node --test apps/wechat-miniprogram/utils/profileOnboarding.test.mjs apps/wechat-miniprogram/utils/request.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add backend/src/controllers/user.ts backend/src/controllers/user.location.test.ts apps/wechat-miniprogram/utils/profileOnboarding.js apps/wechat-miniprogram/utils/profileOnboarding.test.mjs apps/wechat-miniprogram/app.js
git commit -m "feat: sync onboarding fields to account profile"
```

### Task 7: Governance Docs and Full Verification

**Files:**
- Modify: `docs/modules/backend-api.md`
- Modify: `docs/modules/platform-release-and-app-shells.md`
- Modify: `docs/roadmap/active-roadmap.md`
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Consumes: completed Tasks 1-6 and their verified behavior.
- Produces: current source-of-truth documentation and final runtime evidence.

- [ ] **Step 1: Update durable ownership docs**

Document these boundaries:

- mini-program profile onboarding owns local prompting, active-child selection, local-first persistence, and profile query attachment;
- backend public list endpoints own pre-pagination scoring and stable fallback ordering;
- `User` and Xiaowanzi sync remain the only remote profile stores;
- search/detail/admin/external-library ordering is excluded;
- no production migration is required.

Add one active roadmap capability naming the components above. Rewrite `docs/ACTIVE_CONTEXT.md` as a concise snapshot; do not append a journal entry.

- [ ] **Step 2: Run all focused automated verification**

Run from repository root:

```bash
node --test \
  apps/wechat-miniprogram/utils/profileOnboarding.test.mjs \
  apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs \
  apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs \
  apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs \
  apps/wechat-miniprogram/pages/tab-webview.static.test.mjs \
  apps/wechat-miniprogram/utils/request.test.mjs
```

Run from `backend/`:

```bash
node --test --import tsx \
  src/services/contentPersonalization.test.ts \
  src/controllers/learningMaterial.personalization.test.ts \
  src/routes/topic.personalization.test.ts \
  src/controllers/user.location.test.ts
node --test src/controllers/program.public-status.test.mjs src/controllers/book.metadata.test.mjs
npm run build
```

Expected: all tests PASS and TypeScript build exits 0.

- [ ] **Step 3: Run WeChat Developer Tools verification**

Open the local mini-program project and verify on the real native routes:

1. Clear the two child-profile storage keys and enter `pages/programs/index`; dialog appears.
2. Close it, switch across all four tabs; it does not reappear in the same foreground session.
3. Background and foreground the mini program; dialog reappears.
4. Save Shanghai / Xuhui / Primary grade 3 while logged out; storage contains one `孩子` profile and no auth prompt appears.
5. Confirm the visible list reloads and its request contains the three encoded profile parameters.
6. Background and foreground; completed profile suppresses the dialog.
7. Log in by phone; confirm `/api/users/me` and `/api/users/me/xiaowanzi-sync` each succeed and no duplicate child is created.
8. Inspect Programs, Reading, Materials, and Topics requests and visible first-page order; matching records precede zero-score records without missing/duplicate pagination items.
9. Run a search and open a detail; confirm neither request carries profile parameters and their existing ordering/behavior remains unchanged.

Record any simulator-layer failure separately from application failures. Do not claim device verification unless a real device was used.

- [ ] **Step 4: Inspect final diff and working-tree scope**

Run:

```bash
git diff --check
git status --short
git diff --stat HEAD~7..HEAD
```

Expected: no whitespace errors; only task files are included; pre-existing unrelated dirty files remain untouched.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/modules/backend-api.md docs/modules/platform-release-and-app-shells.md docs/roadmap/active-roadmap.md docs/ACTIVE_CONTEXT.md
git commit -m "docs: record profile personalization ownership"
```

## Completion Report Requirements

Report exactly:

1. What changed: dialog trigger/persistence, dual sync, four endpoint ranking, cache behavior, and docs.
2. What verification actually ran: list every automated command and Developer Tools route checked.
3. What was not verified: explicitly distinguish simulator from physical-device and production verification.
4. Remaining assumptions/risks: content metadata coverage, Mongo aggregation performance observed locally, and any existing AppleDouble Git pack warnings.
