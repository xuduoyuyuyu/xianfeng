# Guest Booklist Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every real, unique booklist bound to a guest and make each card open only the books belonging to that list.

**Architecture:** Add one pure frontend utility that parses the legacy semicolon-delimited `sourceName` field into normalized list names. `ExpertDetailPage` uses it to build unique cards, while `BooksPage` uses the same membership rule to filter books selected from those cards; backend data and API contracts remain unchanged.

**Tech Stack:** React 18, TypeScript, React Router 6, Node test runner, Vite.

## Global Constraints

- Split only on Chinese `；` and English `;` semicolons.
- Trim whitespace and one pair of wrapping Chinese book-title marks `《》`; do not use fuzzy matching.
- Preserve first-seen order while deduplicating exact normalized names.
- Do not mutate production data or change backend API contracts.
- Keep changes inside `frontend/` plus the matching governed documentation.
- Use test-first red/green cycles and do not modify unrelated working-tree changes.

---

### Task 1: Shared Book Source Parser

**Files:**
- Create: `frontend/src/utils/bookSourceNames.ts`
- Create: `frontend/src/utils/bookSourceNames.test.mjs`

**Interfaces:**
- Consumes: legacy `Book.sourceName` values as `unknown`.
- Produces: `parseBookSourceNames(value: unknown): string[]`, `uniqueBookSourceNames(values: unknown[]): string[]`, and `hasBookSourceName(value: unknown, target: unknown): boolean`.

- [ ] **Step 1: Write the failing parser tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  hasBookSourceName,
  parseBookSourceNames,
  uniqueBookSourceNames,
} from "./bookSourceNames.ts";

test("splits and normalizes legacy book source names", () => {
  assert.deepEqual(
    parseBookSourceNames(" 总书单；《小班书单》; 原创书单；；总书单 "),
    ["总书单", "小班书单", "原创书单"]
  );
  assert.deepEqual(parseBookSourceNames(null), []);
});

test("deduplicates source names across books in first-seen order", () => {
  assert.deepEqual(
    uniqueBookSourceNames(["总书单；小班书单", "《小班书单》;原创书单"]),
    ["总书单", "小班书单", "原创书单"]
  );
});

test("matches one real list without fuzzy matching", () => {
  assert.equal(hasBookSourceName("总书单；小班书单", "小班书单"), true);
  assert.equal(hasBookSourceName("总书单；小班书单", "小班"), false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test frontend/src/utils/bookSourceNames.test.mjs`

Expected: FAIL because `frontend/src/utils/bookSourceNames.ts` does not exist.

- [ ] **Step 3: Implement the minimal shared utility**

```ts
function normalizeBookSourceName(value: unknown): string {
  let normalized = String(value || "").trim();
  if (normalized.startsWith("《") && normalized.endsWith("》")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

export function parseBookSourceNames(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const seen = new Set<string>();
  const names: string[] = [];
  value.split(/[；;]/).forEach((part) => {
    const name = normalizeBookSourceName(part);
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });
  return names;
}

export function uniqueBookSourceNames(values: unknown[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  values.forEach((value) => {
    parseBookSourceNames(value).forEach((name) => {
      if (seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
  });
  return names;
}

export function hasBookSourceName(value: unknown, target: unknown): boolean {
  const normalizedTarget = normalizeBookSourceName(target);
  return Boolean(normalizedTarget) && parseBookSourceNames(value).includes(normalizedTarget);
}
```

- [ ] **Step 4: Run the parser tests and verify GREEN**

Run: `node --test frontend/src/utils/bookSourceNames.test.mjs`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the parser**

```bash
git add frontend/src/utils/bookSourceNames.ts frontend/src/utils/bookSourceNames.test.mjs
git commit -m "feat: parse guest booklist sources"
```

---

### Task 2: Guest Detail Unique Booklist Cards

**Files:**
- Modify: `frontend/src/pages/ExpertDetailPage.tsx:1-370,710-745`
- Modify: `frontend/src/pages/ExpertDetailPage.test.mjs`

**Interfaces:**
- Consumes: `uniqueBookSourceNames(values: unknown[]): string[]` from Task 1 and books already filtered by `sourceGuestId`.
- Produces: unique booklist card names and `/books?...&sourceName=<name>` links.

- [ ] **Step 1: Add failing source-contract tests**

Append:

```js
test("guest detail splits and deduplicates real booklists", () => {
  assert.match(source, /import \{ uniqueBookSourceNames \} from "\.\.\/utils\/bookSourceNames";/);
  assert.match(source, /const authoredSourceNames = new Set\(\s*uniqueBookSourceNames\(authoredBooks\.map/);
  assert.match(source, /return uniqueBookSourceNames\(boundBooks\.map/);
  assert.match(source, /\.filter\(\(sourceName\) => !authoredSourceNames\.has\(sourceName\)\)/);
  assert.match(source, /\{bookGroups\.length > 0 \? \(/);
});

test("each guest booklist card links to its exact source filter", () => {
  assert.match(source, /bookGroups\.map\(\(sourceName, index\) =>/);
  assert.match(source, /sourceName=\$\{encodeURIComponent\(sourceName\)\}/);
  assert.match(source, /\{sourceName\}/);
});
```

- [ ] **Step 2: Run the detail test and verify RED**

Run: `node --test frontend/src/pages/ExpertDetailPage.test.mjs`

Expected: the two new tests fail because the page still groups whole source strings and omits the selected source from links.

- [ ] **Step 3: Replace whole-string grouping with the shared parser**

Add:

```ts
import { uniqueBookSourceNames } from "../utils/bookSourceNames";
```

Remove `hasBoundBooks` state and every `setHasBoundBooks(...)` call. Replace `bookGroups` with:

```ts
const bookGroups = useMemo(() => {
  const authoredSourceNames = new Set(
    uniqueBookSourceNames(authoredBooks.map((book) => book.sourceName))
  );
  return uniqueBookSourceNames(boundBooks.map((book) => book.sourceName))
    .filter((sourceName) => !authoredSourceNames.has(sourceName));
}, [boundBooks, authoredBooks]);
```

Keep the existing Recommended Books wrapper and copy, but change its condition and card loop to:

```tsx
{bookGroups.length > 0 ? (
  <div className="mt-6 space-y-3">
    {bookGroups.map((sourceName, index) => (
      <Link
        key={sourceName}
        to={`/books?sourceGuestId=${encodeURIComponent(guest._id || "")}&guest=${encodeURIComponent(guest.name || "")}&sourceName=${encodeURIComponent(sourceName)}`}
        className="flex items-center justify-between rounded-[1.1rem] border border-[#e8e0f2] bg-[#fcfaff] px-4 py-3 transition hover:border-[#b79bff] hover:bg-white"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5b3fa1]">#{index + 1}</div>
          <div className="mt-1 text-base font-black text-[#241a3a]">{sourceName}</div>
        </div>
        <span className="material-symbols-outlined shrink-0 text-[#5e17eb]">arrow_outward</span>
      </Link>
    ))}
  </div>
) : null}
```

Retain the complete existing section heading, description, wrapper classes, and sibling sections; change only its condition, iteration value, label, key, and URL.

- [ ] **Step 4: Run parser and detail tests and verify GREEN**

Run: `node --test frontend/src/utils/bookSourceNames.test.mjs frontend/src/pages/ExpertDetailPage.test.mjs`

Expected: all tests pass, 0 fail.

- [ ] **Step 5: Commit guest detail behavior**

```bash
git add frontend/src/pages/ExpertDetailPage.tsx frontend/src/pages/ExpertDetailPage.test.mjs
git commit -m "fix: deduplicate guest booklists"
```

---

### Task 3: Book List Membership Filtering

**Files:**
- Modify: `frontend/src/pages/BooksPage.tsx:1-280`
- Modify: `frontend/src/pages/BooksPage.test.mjs`

**Interfaces:**
- Consumes: `hasBookSourceName(value: unknown, target: unknown): boolean` from Task 1 and the existing `sourceName` query parameter.
- Produces: a filtered book list containing every book whose parsed sources include the selected real list.

- [ ] **Step 1: Change the exact-match test to require membership matching**

```js
test("books page matches one named list inside combined source values", () => {
  assert.match(source, /import \{ hasBookSourceName \} from "\.\.\/utils\/bookSourceNames";/);
  assert.match(source, /const bySourceName = !boundSourceName \|\| hasBookSourceName\(item\.sourceName, boundSourceName\);/);
  assert.match(source, /return bySourceName && byGrade && byTopic && byKeyword;/);
  assert.doesNotMatch(source, /normalizeText\(item\.sourceName\) === boundSourceName/);
});
```

Keep the existing assertions proving that `sourceName` is read, stored, and preserved in the URL.

- [ ] **Step 2: Run the books-page test and verify RED**

Run: `node --test frontend/src/pages/BooksPage.test.mjs`

Expected: FAIL because the page still compares the complete legacy source string.

- [ ] **Step 3: Use the shared membership function**

Add:

```ts
import { hasBookSourceName } from "../utils/bookSourceNames";
```

Replace only the source predicate:

```ts
const bySourceName = !boundSourceName || hasBookSourceName(item.sourceName, boundSourceName);
```

Do not change guest, grade, topic, keyword, ordering, grouping, or pagination behavior.

- [ ] **Step 4: Run all focused tests and verify GREEN**

Run: `node --test frontend/src/utils/bookSourceNames.test.mjs frontend/src/pages/ExpertDetailPage.test.mjs frontend/src/pages/BooksPage.test.mjs`

Expected: all tests pass, 0 fail.

- [ ] **Step 5: Commit list membership filtering**

```bash
git add frontend/src/pages/BooksPage.tsx frontend/src/pages/BooksPage.test.mjs
git commit -m "fix: filter books by parsed source list"
```

---

### Task 4: Governed Documentation and End-to-End Verification

**Files:**
- Modify: `docs/modules/frontend-web.md`
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Consumes: completed behavior from Tasks 1-3.
- Produces: current module ownership notes and reproducible verification evidence.

- [ ] **Step 1: Record the durable frontend behavior**

Add under `docs/modules/frontend-web.md` → `Evolution` → `Active`:

```md
- Guest detail booklists parse legacy semicolon-delimited `sourceName` values
  into exact normalized names. Cards are deduplicated in first-seen order and
  `/books` filters by membership in the parsed source list rather than by whole
  legacy-string equality.
```

Rewrite the relevant `docs/ACTIVE_CONTEXT.md` focus/decision text so it records the same current behavior without turning the snapshot into a journal.

- [ ] **Step 2: Run focused regression tests**

Run: `node --test frontend/src/utils/bookSourceNames.test.mjs frontend/src/pages/ExpertDetailPage.test.mjs frontend/src/pages/BooksPage.test.mjs`

Expected: all tests pass, 0 fail.

- [ ] **Step 3: Run the frontend production build**

Run from `frontend/`: `npm run build`

Expected: Tailwind screen builds, TypeScript compilation, and Vite production build all exit 0. Generated `frontend/public/screens/*.css` changes caused only by the build must not be committed unless required by the source change.

- [ ] **Step 4: Verify the real interaction when a local frontend is available**

Open the 魏智渊 guest detail in a mobile viewport and verify:

1. “推荐书目” contains no duplicate normalized names.
2. Combined values such as `总书单；小班书单` produce separate cards.
3. Selecting “小班书单” puts `sourceName=小班书单` in the URL.
4. Every visible result contains “小班书单” in its parsed source list.
5. Browser console has no runtime errors.

If no local server is available, report this visual/runtime step as not verified rather than inferring success from tests.

- [ ] **Step 5: Check scope and commit documentation**

```bash
git diff --check
git status --short
git diff -- frontend/src/utils/bookSourceNames.ts frontend/src/utils/bookSourceNames.test.mjs frontend/src/pages/ExpertDetailPage.tsx frontend/src/pages/ExpertDetailPage.test.mjs frontend/src/pages/BooksPage.tsx frontend/src/pages/BooksPage.test.mjs docs/modules/frontend-web.md docs/ACTIVE_CONTEXT.md
git add docs/modules/frontend-web.md docs/ACTIVE_CONTEXT.md
git commit -m "docs: record guest booklist parsing"
```

Expected: no whitespace errors; diff contains only this capability plus pre-existing user changes shown separately by `git status`.
