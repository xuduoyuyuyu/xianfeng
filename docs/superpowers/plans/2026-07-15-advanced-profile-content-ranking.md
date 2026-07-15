# Advanced Profile Content Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the four native mini-program content lists from flat text matching to deterministic field-aware profile ranking and refresh the visible list immediately after the local profile save.

**Architecture:** Extend `contentPersonalization.ts` into the single backend-owned ranking service. Controllers map only their real fields into `PersonalizedContentFields`; the service owns normalization, adjacent-grade expansion, weights, stable ordering, and optional relevant-item freshness tie-breaking. The mini-program keeps its current query contract and makes remote profile synchronization non-blocking so the saved local profile can drive the visible list request immediately.

**Tech Stack:** TypeScript, Express, Mongoose, Node test runner with `tsx`, WeChat mini-program CommonJS and static Node tests.

## Global Constraints

- Do not collect clicks, playback, favorites, or dwell time.
- Do not add vector search, model calls, inferred content tags, or persistent ranking scores.
- Personalize only ordinary Programs, local Reading, Materials, and Topics list requests.
- Explicit search, detail requests, admin lists, and the external book library retain their current order.
- Invalid or incomplete profiles retain the exact pre-feature query and ordering path.
- Rank after visibility and explicit filters but before pagination.
- Zero-score items retain original business order.
- Remote profile sync must not block the first local-profile refresh.
- Production deployment and mini-program upload remain outside this plan and require separate approval.

---

### Task 1: Field-aware profile scoring service

**Files:**
- Modify: `backend/src/services/contentPersonalization.ts`
- Modify: `backend/src/services/contentPersonalization.test.ts`

**Interfaces:**
- Produces: `PersonalizedContentFields`, `scorePersonalizedContent(fields, profile)`, and `rankPersonalizedContent(items, profile, fieldsOf, options?)`.
- Preserves: `parseContentProfile`, `profileStage`, `scorePersonalizedText`, and `rankPersonalizedItems` until all consumers are migrated in Task 2.
- `options.preserveOriginalTieOrder` disables date tie-breaking for Reading quality order.

- [ ] **Step 1: Write failing normalization and adjacency tests**

Add tests that require safe suffix normalization and same-stage neighbors:

```ts
import {
  adjacentProfileGrades,
  normalizeProfilePlace,
  rankPersonalizedContent,
  scorePersonalizedContent,
} from "./contentPersonalization";

test("normalizes only safe city and district suffixes", () => {
  assert.equal(normalizeProfilePlace("上海市", "city"), "上海");
  assert.equal(normalizeProfilePlace("浦东新区", "region"), "浦东新");
  assert.equal(normalizeProfilePlace("上", "city"), "上");
});

test("builds adjacent grades only inside the current stage", () => {
  assert.deepEqual(adjacentProfileGrades("小学三年级", "上海"), ["小学二年级", "小学四年级"]);
  assert.deepEqual(adjacentProfileGrades("小学五年级", "上海"), ["小学四年级"]);
  assert.deepEqual(adjacentProfileGrades("小学六年级", "北京"), ["小学五年级"]);
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run:

```bash
cd backend
node --test --import tsx src/services/contentPersonalization.test.ts
```

Expected: FAIL because `adjacentProfileGrades`, `normalizeProfilePlace`, `scorePersonalizedContent`, and `rankPersonalizedContent` are not exported.

- [ ] **Step 3: Add failing field-weight and stable-order tests**

Use the approved score table directly in assertions:

```ts
test("weights structured and tag matches above incidental body text", () => {
  const profile = parseContentProfile({ profileCity: "上海", profileRegion: "徐汇区", profileGrade: "小学三年级" });
  assert.ok(profile);
  assert.equal(scorePersonalizedContent({ structured: ["小学三年级"] }, profile), 840);
  assert.equal(scorePersonalizedContent({ tags: ["上海", "小学三年级"] }, profile), 1170);
  assert.equal(scorePersonalizedContent({ body: ["徐汇区"] }, profile), 600);
});

test("uses freshness only for equally relevant positive-score content", () => {
  const profile = parseContentProfile({ profileCity: "上海", profileRegion: "徐汇区", profileGrade: "小学三年级" });
  assert.ok(profile);
  const rows = [
    { id: "zero-old", fields: { body: ["通用"], publishedAt: "2024-01-01" } },
    { id: "zero-new", fields: { body: ["通用"], publishedAt: "2026-01-01" } },
    { id: "match-old", fields: { tags: ["上海"], publishedAt: "2024-01-01" } },
    { id: "match-new", fields: { tags: ["上海"], publishedAt: "2026-01-01" } },
  ];
  assert.deepEqual(
    rankPersonalizedContent(rows, profile, (row) => row.fields).map((row) => row.id),
    ["match-new", "match-old", "zero-old", "zero-new"],
  );
});
```

- [ ] **Step 4: Implement the approved deterministic scorer**

Add these types and exact weights:

```ts
export type PersonalizedContentFields = {
  structured?: unknown;
  tags?: unknown;
  title?: unknown;
  body?: unknown;
  publishedAt?: unknown;
};

const PROFILE_FIELD_WEIGHTS = {
  structured: { region: 2400, city: 900, exactGrade: 720, adjacentGrade: 260, stage: 120 },
  tags: { region: 1600, city: 600, exactGrade: 480, adjacentGrade: 180, stage: 90 },
  title: { region: 1200, city: 450, exactGrade: 360, adjacentGrade: 140, stage: 70 },
  body: { region: 600, city: 220, exactGrade: 180, adjacentGrade: 70, stage: 35 },
} as const;
```

Implement helpers with these rules:

- Flatten each layer into normalized strings.
- Strip only terminal `市` for cities and terminal `区|县|市` for regions when the remaining value has at least two characters.
- Match normalized full phrases; never score an isolated digit or one-character place token.
- Use existing grade stage vocabulary, with city-aware five-four grade sequences.
- Score each signal at most once per layer.
- Exact-grade and adjacent-grade are mutually exclusive within a layer; either can still add stage points.
- Rank by score descending; when equal and positive, rank valid `publishedAt` descending; otherwise retain input index.
- When `preserveOriginalTieOrder` is true, retain input index for equal scores regardless of date.

- [ ] **Step 5: Run the service test and verify GREEN**

Run the command from Step 2. Expected: all service tests PASS, including the existing invalid-profile and legacy stable-order tests.

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/src/services/contentPersonalization.ts backend/src/services/contentPersonalization.test.ts
git commit -m "feat: add field-aware profile ranking"
```

---

### Task 2: Map the four public list types into the shared scorer

**Files:**
- Modify: `backend/src/controllers/program.ts`
- Modify: `backend/src/controllers/book.ts`
- Modify: `backend/src/controllers/learningMaterial.ts`
- Modify: `backend/src/routes/topic.ts`
- Modify: `backend/src/controllers/book.metadata.test.mjs`
- Create: `backend/src/services/contentPersonalization.integration.test.ts`

**Interfaces:**
- Consumes: `rankPersonalizedContent` and `scorePersonalizedContent` from Task 1.
- Programs, Materials, and Topics use `publishedAt`/`createdAt` tie-breaking.
- Reading calls the scorer with `preserveOriginalTieOrder: true`, then uses existing quality comparison for equal profile scores.

- [ ] **Step 1: Write failing mapping contract tests**

Create a source-level integration test that reads the four handlers and asserts the real field mapping:

```ts
test("maps only approved real fields into advanced profile ranking", () => {
  assert.match(programSource, /structured:\s*\[\]/);
  assert.match(programSource, /tags:\s*\[item\.summary\?\.tags, item\.programShow\]/);
  assert.match(programSource, /title:\s*\[item\.title\]/);
  assert.match(programSource, /body:\s*\[item\.description, item\.summary\?\.headline, item\.summary\?\.body\]/);

  assert.match(bookSource, /structured:\s*\[plain\?\.grade\]/);
  assert.match(bookSource, /tags:\s*\[plain\?\.categoryLabel, plain\?\.topic, plain\?\.sourceName\]/);
  assert.match(bookSource, /preserveOriginalTieOrder:\s*true/);

  assert.match(materialSource, /tags:\s*\[item\.category\]/);
  assert.match(topicSource, /structured:\s*\[item\.suitableGrades\]/);
  assert.match(topicSource, /tags:\s*\[item\.tags\]/);
});
```

Also update `book.metadata.test.mjs` to expect `scorePersonalizedContent` rather than `scorePersonalizedText`.

- [ ] **Step 2: Run handler contract tests and verify RED**

```bash
cd backend
node --test --import tsx src/services/contentPersonalization.integration.test.ts
node --test src/controllers/book.metadata.test.mjs
```

Expected: FAIL because handlers still pass undifferentiated text arrays.

- [ ] **Step 3: Replace each flat text mapper with approved fields**

Programs:

```ts
rankPersonalizedContent(foundPrograms, profile, (item: any) => ({
  structured: [],
  tags: [item.summary?.tags, item.programShow],
  title: [item.title],
  body: [item.description, item.summary?.headline, item.summary?.body],
  publishedAt: item.publishedAt || item.createdAt,
}))
```

Materials:

```ts
rankPersonalizedContent(materials, profile, (item: any) => ({
  structured: [],
  tags: [item.category],
  title: [item.title],
  body: [item.description],
  publishedAt: item.publishedAt || item.createdAt,
}))
```

Topics:

```ts
rankPersonalizedContent(foundTopics, profile, (item: any) => ({
  structured: [item.suitableGrades],
  tags: [item.tags],
  title: [item.title, item.subtitle],
  body: [item.description, item.shortSummary],
  publishedAt: item.createdAt,
}))
```

Reading keeps its existing `qualityScore` tuple. Replace `profileScore` with:

```ts
profileScore: profile ? scorePersonalizedContent({
  structured: [plain?.grade],
  tags: [plain?.categoryLabel, plain?.topic, plain?.sourceName],
  title: [plain?.title],
  body: [plain?.description],
  publishedAt: plain?.publishedAt || plain?.createdAt,
}, profile) : 0,
```

Keep its comparator as profile score, then existing quality score, then original index. Do not add date comparison to Reading.

- [ ] **Step 4: Verify pagination and search boundaries remain intact**

Extend the integration test to assert:

```ts
assert.match(programSource, /const profile = q \? null : parseContentProfile/);
assert.match(topicSource, /const profile = search \? null : parseContentProfile/);
assert.match(programSource, /rankPersonalizedContent[\s\S]*\.slice\(skip, skip \+ pageSize\)/);
assert.match(topicSource, /rankPersonalizedContent[\s\S]*\.slice\(\(pageNum - 1\) \* limitNum, pageNum \* limitNum\)/);
assert.doesNotMatch(bookExternalHandlerSource, /profileCity|rankPersonalizedContent/);
```

- [ ] **Step 5: Run backend target tests and verify GREEN**

```bash
cd backend
node --test --import tsx src/services/contentPersonalization.test.ts src/services/contentPersonalization.integration.test.ts
node --test src/controllers/book.metadata.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/src/controllers/program.ts backend/src/controllers/book.ts backend/src/controllers/learningMaterial.ts backend/src/routes/topic.ts backend/src/controllers/book.metadata.test.mjs backend/src/services/contentPersonalization.integration.test.ts
git commit -m "feat: rank public content by profile fields"
```

---

### Task 3: Refresh immediately after local profile persistence

**Files:**
- Modify: `apps/wechat-miniprogram/utils/profileOnboarding.js`
- Modify: `apps/wechat-miniprogram/utils/profileOnboarding.test.mjs`
- Modify: `apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs`

**Interfaces:**
- `saveProfileOnboardingDraft(draft)` resolves after local child storage and pending-sync state are established, not after remote PATCH requests finish.
- Existing `saved` component event remains the page refresh trigger.
- Remote sync retains its current internal error handling and `SYNC_PENDING_KEY` retry contract.

- [ ] **Step 1: Write a failing non-blocking save test**

Add a deferred remote request to `profileOnboarding.test.mjs`:

```js
test("local profile save resolves before remote synchronization", async () => {
  let releaseRemote;
  const remotePending = new Promise((resolve) => { releaseRemote = resolve; });
  requestImpl = () => remotePending;
  storage.token = "signed-in";

  const savePromise = saveProfileOnboardingDraft({
    city: "上海",
    region: "徐汇区",
    stage: "小学",
    gradeName: "三年级",
  });

  const result = await Promise.race([
    savePromise,
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 20)),
  ]);
  assert.notEqual(result, "blocked");
  assert.equal(buildPersonalizationQuery().includes("profileCity="), true);
  releaseRemote({ ok: true });
});
```

- [ ] **Step 2: Run the utility test and verify RED**

```bash
node --test apps/wechat-miniprogram/utils/profileOnboarding.test.mjs
```

Expected: FAIL because the current save awaits both remote PATCH requests.

- [ ] **Step 3: Make remote sync non-blocking after local persistence**

Replace the awaited sync tail with:

```js
dismissedForSession = true;
wx.setStorageSync(SYNC_PENDING_KEY, true);
void syncProfileOnboardingRemote(children, child);
return { city, region, grade, childId: child.id };
```

The sync function already catches remote failures, clears the pending key on success, and keeps it on failure. Do not add another profile copy or swallow local storage errors.

- [ ] **Step 4: Strengthen page refresh contracts**

In `profile-onboarding.static.test.mjs`, assert every handler returns its first-page reload and resets the relevant cache. Keep the exact page-specific operations:

```js
assert.match(programs, /onProfileOnboardingSaved\(\)[\s\S]*removeStorageSync\(PROGRAM_CACHE_KEY\)[\s\S]*loadPrograms\(\{ showRefreshing: true \}\)/);
assert.match(reading, /onProfileOnboardingSaved\(\)[\s\S]*clearReadingProfileCaches\(\)[\s\S]*loadBooks\(\{ showRefreshing: true \}\)/);
assert.match(materials, /onProfileOnboardingSaved\(\)[\s\S]*removeStorageSync\(MATERIAL_CACHE_KEY\)[\s\S]*loadMaterials\(\{ showRefreshing: true \}\)/);
assert.match(topics, /onProfileOnboardingSaved\(\)[\s\S]*removeStorageSync\(TOPIC_CACHE_KEY\)[\s\S]*loadTopics\(\{ showRefreshing: true \}\)/);
```

- [ ] **Step 5: Run mini-program target tests and verify GREEN**

```bash
node --test apps/wechat-miniprogram/utils/profileOnboarding.test.mjs apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/wechat-miniprogram/utils/profileOnboarding.js apps/wechat-miniprogram/utils/profileOnboarding.test.mjs apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs
git commit -m "fix: refresh content after local profile save"
```

---

### Task 4: Durable contracts and full verification

**Files:**
- Modify: `docs/modules/backend-api.md`
- Modify: `docs/modules/platform-release-and-app-shells.md`
- Modify: `docs/ACTIVE_CONTEXT.md`
- Modify: `docs/roadmap/active-roadmap.md`

**Interfaces:**
- Documents the approved field-aware ranking contract and non-blocking local refresh.
- Does not mark production deployment, mini-program upload, review, or publication complete.

- [ ] **Step 1: Update durable documentation**

Replace the flat “region, city, exact grade, then stage” backend contract with:

```md
Profile-aware public list ranking uses field-layer weights for region, city,
exact grade, adjacent same-stage grade, and stage. Structured grade fields and
tags outweigh incidental body text. Positive equal-score items may use real
publish time as a tie-breaker, while zero-score items retain business order;
Reading retains quality order for equal profile scores. Ranking occurs before
pagination and explicit search bypasses personalization.
```

Record in the mini-program shell module that local persistence emits the saved event before remote account synchronization completes.

- [ ] **Step 2: Run backend target tests**

```bash
cd backend
node --test --import tsx src/services/contentPersonalization.test.ts src/services/contentPersonalization.integration.test.ts
node --test src/controllers/book.metadata.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run mini-program regression tests**

From the repository root:

```bash
node --test apps/wechat-miniprogram/utils/profileOnboarding.test.mjs apps/wechat-miniprogram/pages/profile-onboarding.static.test.mjs apps/wechat-miniprogram/components/profile-onboarding/index.test.mjs apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: all tests PASS and the AppleDouble package test reports no `._*` files. If macOS generated scoped resource forks while editing, remove only `apps/wechat-miniprogram/**/._*` and rerun.

- [ ] **Step 4: Run backend type/build verification**

Run the backend TypeScript build defined in `backend/package.json`:

```bash
cd backend
npm run build
```

Expected: exit 0.

- [ ] **Step 5: Verify the local runtime request and response order**

In WeChat Developer Tools using a local backend build containing this branch:

1. Open a main native list with an incomplete local child profile.
2. Save `上海 / 徐汇区 / 小学三年级`.
3. Confirm the modal closes without waiting for account sync.
4. Confirm the next visible-list request contains all three encoded profile parameters.
5. Confirm the page returns to page 1 and replaces the visible rows.
6. Repeat with `北京 / 海淀区 / 初中七年级`; confirm a different positive-match order when matching data exists.
7. Remove only the profile query from the same request and confirm the original baseline order remains.

- [ ] **Step 6: Compare production without mutating it**

Before any deployment, issue read-only requests against production with no profile and with two synthetic profile parameter sets. Record that production remains unchanged until a separately approved backend deployment. Do not deploy or upload from this task.

- [ ] **Step 7: Commit Task 4**

```bash
git add docs/modules/backend-api.md docs/modules/platform-release-and-app-shells.md docs/ACTIVE_CONTEXT.md docs/roadmap/active-roadmap.md
git commit -m "docs: record advanced profile ranking contract"
```

## Completion Gate

Implementation is complete only when:

- Service, handler, mini-program, and broad static tests pass.
- Backend build/type verification exits 0.
- Developer Tools shows the saved event causing a new profiled first-page request.
- Two different complete profiles can produce different ordering when real matching content exists.
- No-profile ordering remains unchanged.
- Production deployment and mini-program upload are reported as not performed unless the user separately approves them.
