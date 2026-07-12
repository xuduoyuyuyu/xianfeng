# Book Description Priority Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make paged `/api/books` return every published book with a real metadata or base-record description before books without descriptions.

**Architecture:** Keep pagination ownership in `backend/src/controllers/book.ts`. Build one MongoDB priority predicate from approved metadata book IDs plus non-blank base `description`, use that predicate for both the priority count and priority query, then fill the remaining page capacity from the inverse predicate. Preserve the existing response contract and within-group `publishedAt`, `_id` descending order.

**Tech Stack:** TypeScript, Express, Mongoose, Node.js test runner

## Global Constraints

- A book counts as described when it has either an approved metadata description or a non-blank base `description`.
- Described books sort before undescribed books across the complete published collection.
- Each group remains sorted by `publishedAt` and `_id` descending.
- Do not generate descriptions or modify book data, metadata, review state, frontend code, or the unpaged API response shape.

---

### Task 1: Lock the global description-priority pagination contract

**Files:**
- Modify: `backend/src/controllers/book.metadata.test.mjs`
- Test: `backend/src/controllers/book.metadata.test.mjs`

**Interfaces:**
- Consumes: source text of `backend/src/controllers/book.ts`
- Produces: regression assertions requiring a shared `describedBookFilter`, its inverse, and stable two-group pagination

- [ ] **Step 1: Write the failing regression assertions**

Add these assertions to the existing public metadata list test:

```js
assert.match(
  controllerSource,
  /const describedBookFilter = \{[\s\S]*_id: \{ \$in: approvedBookIds \}[\s\S]*description: \{ \$regex: \/\\S\/ \}[\s\S]*\};/,
  "paged public books should treat approved metadata or a non-blank base description as described"
);
assert.match(
  controllerSource,
  /const undescribedBookFilter = \{ \$nor: describedBookFilter\.\$or \};/,
  "undescribed pagination should be the exact inverse of the shared description predicate"
);
assert.match(
  controllerSource,
  /countDocuments\(\{ \.\.\.publishedFilter, \.\.\.describedBookFilter \}\)[\s\S]*Book\.find\(\{ \.\.\.publishedFilter, \.\.\.describedBookFilter \}\)[\s\S]*Book\.find\(\{ \.\.\.publishedFilter, \.\.\.undescribedBookFilter \}\)/,
  "counting and both page segments should use the same global description partition"
);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd backend && node --test --import tsx src/controllers/book.metadata.test.mjs`

Expected: FAIL on the new assertion because the controller currently prioritizes only approved metadata IDs.

- [ ] **Step 3: Commit the failing test**

```bash
git add backend/src/controllers/book.metadata.test.mjs
git commit -m "test: require global book description priority"
```

---

### Task 2: Implement global description-priority pagination

**Files:**
- Modify: `backend/src/controllers/book.ts:558-585`
- Test: `backend/src/controllers/book.metadata.test.mjs`

**Interfaces:**
- Consumes: approved metadata book IDs from `listApprovedBookMetadataBookIds()` and published `Book.description`
- Produces: `findPagedPublicBooksPrioritizingDescriptions(current: number, size: number)` returning `{ books, total }`

- [ ] **Step 1: Replace the metadata-only partition with one shared description predicate**

Replace the existing pagination helper with:

```ts
async function findPagedPublicBooksPrioritizingDescriptions(current: number, size: number) {
  const approvedBookIds = await listApprovedBookMetadataBookIds();
  const publishedFilter = { status: "published" };
  const describedBookFilter = {
    $or: [
      { _id: { $in: approvedBookIds } },
      { description: { $regex: /\S/ } },
    ],
  };
  const undescribedBookFilter = { $nor: describedBookFilter.$or };
  const total = await Book.countDocuments(publishedFilter);
  const describedTotal = await Book.countDocuments({ ...publishedFilter, ...describedBookFilter });
  const offset = (current - 1) * size;
  const describedTake = Math.min(size, Math.max(0, describedTotal - offset));
  const books: any[] = [];

  if (describedTake > 0) {
    books.push(...await Book.find({ ...publishedFilter, ...describedBookFilter })
      .sort({ publishedAt: -1, _id: -1 })
      .skip(offset)
      .limit(describedTake));
  }

  const remaining = size - books.length;
  if (remaining > 0) {
    const undescribedOffset = Math.max(0, offset - describedTotal);
    books.push(...await Book.find({ ...publishedFilter, ...undescribedBookFilter })
      .sort({ publishedAt: -1, _id: -1 })
      .skip(undescribedOffset)
      .limit(remaining));
  }

  return { books, total };
}
```

- [ ] **Step 2: Point paged public requests at the renamed helper**

In `getAllPublic`, change the page selection to:

```ts
const page = paged ? await findPagedPublicBooksPrioritizingDescriptions(current, size) : null;
```

Update the existing static assertion to expect the new helper name.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `cd backend && node --test --import tsx src/controllers/book.metadata.test.mjs`

Expected: all tests PASS with zero failures.

- [ ] **Step 4: Run adjacent book controller tests**

Run: `cd backend && node --test --import tsx src/controllers/book.admin.test.mjs src/controllers/book.metadata.test.mjs src/services/bookMetadataService.test.ts`

Expected: all tests PASS with zero failures.

- [ ] **Step 5: Check patch integrity**

Run: `git diff --check && git diff -- backend/src/controllers/book.ts backend/src/controllers/book.metadata.test.mjs`

Expected: no whitespace errors; diff contains only the pagination predicate, helper rename, and regression assertions.

- [ ] **Step 6: Commit the implementation**

```bash
git add backend/src/controllers/book.ts backend/src/controllers/book.metadata.test.mjs
git commit -m "fix: prioritize books with descriptions globally"
```

---

### Task 3: Verify real pagination behavior

**Files:**
- Verify only: `backend/src/controllers/book.ts`

**Interfaces:**
- Consumes: running backend `/api/books?current=N&size=20`
- Produces: evidence that described books remain ahead of undescribed books across page boundaries

- [ ] **Step 1: Start the local backend with its configured database**

Run from `backend/`: `node_modules/.bin/tsx src/index.ts`

Expected: `Server running on port 3001` and `MongoDB connected` appear. Do not change database data.

- [ ] **Step 2: Count descriptions on consecutive pages**

Run:

```bash
node --input-type=module -e 'for (const current of [1,2,3]) { const r=await fetch(`http://127.0.0.1:3001/api/books?current=${current}&size=20`); const j=await r.json(); const rows=j.records||[]; console.log({current,count:rows.length,descriptions:rows.filter(x=>String(x.description||"").trim()).length}); }'
```

Expected: pages continue returning described records until the global described group is exhausted; no page reverts to undescribed records while later pages still contain descriptions.

- [ ] **Step 3: Report unverified runtime boundaries explicitly**

If the local database is not a current production snapshot, report the automated test result as verified and production ordering as not yet verified. Do not deploy or mutate production without a separate release request.
