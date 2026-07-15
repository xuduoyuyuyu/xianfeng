# Mobile Guest Booklist Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return real guest booklists from the guest detail API, show at most five by default on mobile Web, and add the same expandable section to the native mini-program guest detail.

**Architecture:** The backend owns source-name parsing and returns the complete `bookLists` array only from `GET /api/guests/:id`. Web and mini-program clients consume that contract and own only presentation state. The desktop Web surface remains uncollapsed; both mobile surfaces use a five-item collapsed view and open the existing exact `/books` filter route.

**Tech Stack:** Express, Mongoose, TypeScript, React 18, WeChat Mini Program WXML/WXSS/JavaScript, Node test runner.

## Global Constraints

- Default mobile visible count is exactly `5`.
- The backend returns the full deduplicated array; it must not truncate to five.
- Only published books whose `sourceGuestId` matches the guest contribute booklists.
- Split only on Chinese and English semicolons; normalize paired `《》`; preserve first-seen order.
- Desktop Web renders every item and no expand/collapse button.
- No database migration and no production-data rewrite.
- Preserve unrelated working-tree changes, especially the existing mini-program tab-bar files.

---

### Task 1: Guest detail booklist contract

**Files:**
- Create: `backend/src/utils/bookSourceNames.ts`
- Create: `backend/src/utils/bookSourceNames.test.ts`
- Modify: `backend/src/controllers/guest.ts`
- Modify: `backend/src/controllers/guest.test.ts`
- Modify: `frontend/src/services/api.ts`

**Interfaces:**
- Produces: `uniqueBookSourceNames(values: unknown[]): string[]`.
- Produces: `loadGuestBookLists(guestId: string): Promise<string[]>`, returning `[]` if the secondary book query fails.
- Produces: `GET /api/guests/:id` response field `bookLists: string[]`.
- Produces: `PublicGuestDetail.bookLists?: string[]`.

- [ ] **Step 1: Write parser tests that fail because the backend utility does not exist**

```ts
import { uniqueBookSourceNames } from "./bookSourceNames";

it("splits and deduplicates real source names in first-seen order", () => {
  assert.deepEqual(
    uniqueBookSourceNames(["《亲子书单》；教师书单", "亲子书单; 阅读书单", null]),
    ["亲子书单", "教师书单", "阅读书单"]
  );
});
```

- [ ] **Step 2: Run the parser test and verify RED**

Run: `cd backend && node --test --import tsx src/utils/bookSourceNames.test.ts`

Expected: FAIL because `./bookSourceNames` cannot be resolved.

- [ ] **Step 3: Implement the minimal shared parser**

```ts
function normalizeBookSourceName(value: unknown): string {
  let normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.startsWith("《") && normalized.endsWith("》")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

export function uniqueBookSourceNames(values: unknown[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  values.forEach((value) => {
    if (typeof value !== "string") return;
    value.split(/[；;]/).forEach((part) => {
      const name = normalizeBookSourceName(part);
      if (!name || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
  });
  return names;
}
```

- [ ] **Step 4: Run the parser test and verify GREEN**

Run: `cd backend && node --test --import tsx src/utils/bookSourceNames.test.ts`

Expected: all parser tests pass.

- [ ] **Step 5: Add a failing guest-controller contract test**

Add source-level and focused helper assertions proving that `getByIdPublic` calls `loadGuestBookLists(id)` and returns `bookLists` without `.slice(0, 5)`. Add a helper test with a rejected injected query and assert it resolves to `[]`, so a non-core book query cannot fail the guest profile.

```ts
assert.match(detailSource, /const bookLists = await loadGuestBookLists\(id\)/);
assert.match(detailSource, /bookLists,/);
assert.doesNotMatch(detailSource, /bookLists:[\s\S]*\.slice\(0,\s*5\)/);
```

- [ ] **Step 6: Run the controller test and verify RED**

Run: `cd backend && node --test --import tsx src/controllers/guest.test.ts`

Expected: FAIL because the controller does not query `Book` or return `bookLists`.

- [ ] **Step 7: Add the detail query and public response field**

Import `Book` and `uniqueBookSourceNames`, and add a focused helper that queries only matching published rows while isolating failures:

```ts
export async function loadGuestBookLists(guestId: string): Promise<string[]> {
  try {
    const bookRows = await Book.find(
      { sourceGuestId: new mongoose.Types.ObjectId(guestId), status: "published" },
      { sourceName: 1 }
    ).sort({ createdAt: 1, _id: 1 }).lean();
    return uniqueBookSourceNames(bookRows.map((book: any) => book?.sourceName));
  } catch (error) {
    console.error("[guest-detail] failed to load booklists", error);
    return [];
  }
}
```

Call `const bookLists = await loadGuestBookLists(id)`, add it beside `relatedPrograms` in the JSON response, and add `bookLists?: string[]` to `PublicGuestDetail`.

- [ ] **Step 8: Run backend target tests and build**

Run: `cd backend && node --test --import tsx src/utils/bookSourceNames.test.ts src/controllers/guest.test.ts`

Run: `cd backend && npm run build`

Expected: both commands exit 0.

- [ ] **Step 9: Commit the backend contract**

```bash
git add backend/src/utils/bookSourceNames.ts backend/src/utils/bookSourceNames.test.ts backend/src/controllers/guest.ts backend/src/controllers/guest.test.ts frontend/src/services/api.ts
git commit -m "feat: return guest booklists from detail API"
```

### Task 2: Mobile Web five-item collapse

**Files:**
- Modify: `frontend/src/pages/ExpertDetailPage.tsx`
- Modify: `frontend/src/pages/ExpertDetailPage.test.mjs`

**Interfaces:**
- Consumes: `PublicGuestDetail.bookLists?: string[]` from Task 1.
- Produces: `MOBILE_BOOKLIST_LIMIT = 5` and local `bookListsExpanded` state.

- [ ] **Step 1: Add failing source-contract tests for responsive collapse**

```js
assert.match(source, /const MOBILE_BOOKLIST_LIMIT = 5/);
assert.match(source, /const \[bookListsExpanded, setBookListsExpanded\] = useState\(false\)/);
assert.match(source, /bookGroups\.slice\(0, MOBILE_BOOKLIST_LIMIT\)/);
assert.match(source, /展开其余.*bookGroups\.length - MOBILE_BOOKLIST_LIMIT/);
assert.match(source, /md:hidden/);
```

Also assert the state resets inside an effect keyed by `id`.

- [ ] **Step 2: Run the page test and verify RED**

Run: `cd frontend && node --test src/pages/ExpertDetailPage.test.mjs`

Expected: new collapse assertions fail.

- [ ] **Step 3: Implement the minimal responsive presentation state**

Add:

```tsx
const MOBILE_BOOKLIST_LIMIT = 5;
const [bookListsExpanded, setBookListsExpanded] = useState(false);
useEffect(() => setBookListsExpanded(false), [id]);
```

Build `bookGroups` from `guest.bookLists` and retain authored-source exclusion. Render two responsive branches: mobile uses the sliced/full array based on state; desktop maps the complete array. Render the toggle only in the mobile branch when `bookGroups.length > 5`, with text `展开其余 ${bookGroups.length - 5} 条` or `收起`.

- [ ] **Step 4: Remove the recommendation-only whole-library dependency**

Keep the existing book request only while authored books still require it. Ensure `bookGroups` no longer derives from `boundBooks`, then remove `boundBooks` state and related filtering if no other section consumes it.

- [ ] **Step 5: Run the page test and verify GREEN**

Run: `cd frontend && node --test src/pages/ExpertDetailPage.test.mjs src/utils/bookSourceNames.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the Web behavior**

```bash
git add frontend/src/pages/ExpertDetailPage.tsx frontend/src/pages/ExpertDetailPage.test.mjs
git commit -m "feat: collapse mobile guest booklists"
```

### Task 3: Native mini-program recommended-booklists card

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.js`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: `guest.bookLists` from Task 1.
- Produces: `nativeExpert.bookLists`, `visibleBookLists`, `bookListsExpanded`, and `hiddenBookListCount`.
- Produces handlers: `toggleNativeExpertBookLists()` and `openNativeExpertBookList(event)`.

- [ ] **Step 1: Add failing normalization and markup assertions**

Add tests that evaluate `normalizeExpertDetail` with seven booklists and assert five visible, two hidden, and collapsed state. Assert WXML includes a recommended-books card, a five-item list, the toggle handler, and the open handler.

```js
assert.deepEqual(expert.visibleBookLists.map((item) => item.name), ["书单1", "书单2", "书单3", "书单4", "书单5"]);
assert.equal(expert.hiddenBookListCount, 2);
assert.equal(expert.bookListsExpanded, false);
```

- [ ] **Step 2: Run the mini-program target test and verify RED**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: new native booklist assertions fail.

- [ ] **Step 3: Normalize complete and visible native booklists**

In `normalizeExpertDetail`, normalize string entries, deduplicate exactly, and map them to stable view rows:

```js
const bookLists = Array.from(new Set(
  (Array.isArray(item.bookLists) ? item.bookLists : []).map((name) => firstText([name], "")).filter(Boolean)
)).map((name, index) => ({ name, order: index + 1 }));
```

Return the four fields with `visibleBookLists: bookLists.slice(0, 5)`.

- [ ] **Step 4: Add native expand/collapse behavior**

```js
toggleNativeExpertBookLists() {
  const expert = this.data.nativeExpert || {};
  const expanded = !expert.bookListsExpanded;
  const bookLists = Array.isArray(expert.bookLists) ? expert.bookLists : [];
  this.setData({
    nativeExpert: {
      ...expert,
      bookListsExpanded: expanded,
      visibleBookLists: expanded ? bookLists : bookLists.slice(0, 5)
    }
  });
},
```

Import `openWeb` from `../../utils/webview`. Add `openNativeExpertBookList(event)` that reads `data-name` and calls:

```js
openWeb("/books", "及阅", {
  sourceGuestId: expert.id,
  guest: expert.name,
  sourceName: name
});
```

This reuses the shell's token, native-chrome, and URL-encoding behavior.

- [ ] **Step 5: Add WXML and scoped WXSS**

Insert the card after native public-content cards and before the AI card. Render `nativeExpert.visibleBookLists`, continuous `#N` labels, name, arrow, and a toggle only when `hiddenBookListCount > 0`. Add only `xf-expert-detail-booklists*` selectors, reusing existing card colors, radii, and typography tokens.

- [ ] **Step 6: Run the mini-program test and verify GREEN**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: all assertions pass.

- [ ] **Step 7: Commit only the native-detail hunks**

Because `tab-webview.static.test.mjs` already has unrelated user edits, inspect and stage only the new booklist hunks. Do not stage `custom-tab-bar/index.wxss` or unrelated tab-bar tests.

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/webview/index.wxml apps/wechat-miniprogram/pages/webview/index.wxss
git add -p apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: add native guest booklist section"
```

### Task 4: Governance and full verification

**Files:**
- Modify: `docs/modules/frontend-web.md`
- Modify: `docs/modules/backend-api.md`
- Modify: `docs/modules/platform-release-and-app-shells.md`
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Documents the public detail contract and both presentation owners.

- [ ] **Step 1: Update durable module boundaries**

Record that backend guest detail owns complete normalized `bookLists`, frontend mobile owns the five-item responsive fold, and native guest detail mirrors the same fold without persisting expansion state. Rewrite `ACTIVE_CONTEXT.md` as a snapshot, preserving other active workstreams.

- [ ] **Step 2: Run all focused verification fresh**

```bash
cd backend && node --test --import tsx src/utils/bookSourceNames.test.ts src/controllers/guest.test.ts
cd backend && npm run build
cd frontend && node --test src/pages/ExpertDetailPage.test.mjs src/utils/bookSourceNames.test.mjs
cd frontend && npm run build
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: every command exits 0 with zero failed tests.

- [ ] **Step 3: Perform runtime visual checks if local services are available**

Verify one guest with more than five real lists at a phone viewport and in WeChat DevTools. Capture default-five and expanded screenshots. Confirm desktop Web displays all lists without a toggle. If runtime or DevTools is unavailable, report that explicitly rather than substituting static tests.

- [ ] **Step 4: Review scope and working tree**

Run `git diff --check`, inspect `git status --short`, and confirm pre-existing tab-bar/doc/export changes remain untouched and uncommitted.

- [ ] **Step 5: Commit governance updates**

```bash
git add docs/modules/frontend-web.md docs/modules/backend-api.md docs/modules/platform-release-and-app-shells.md docs/ACTIVE_CONTEXT.md
git commit -m "docs: record guest booklist presentation ownership"
```
