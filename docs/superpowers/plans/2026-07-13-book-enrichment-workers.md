# Book Enrichment Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a recoverable multi-source pipeline that finds missing local-book metadata, auto-writes only field-level candidates with confidence `>= 0.90`, protects human-confirmed values, and exposes shadow-run evidence in admin.

**Architecture:** Add book-specific run, task, and evidence models rather than extending the program/guest `AgentTask` state machine. Deterministic source adapters produce one candidate shape; a pure resolver applies A/B/C identity rules; a single writer performs compare-and-fill updates; a daily scheduler and admin API control shadow and automatic batches.

**Tech Stack:** TypeScript, Express, Mongoose, Node `fetch`, `node-cron`, React/Vite, Node test runner with `tsx`.

## Global Constraints

- Initial mode is deterministic workers only; no free-browsing LLM agent.
- Sources are Google Books, low-frequency Open Library, and the existing WeRead parser.
- Automatic writes require field confidence `>= 0.90` and A/B identity; C identity never writes.
- `reviewedAt` records never lose a non-empty field. Automatic records also fill only empty/recognized-placeholder values.
- Descriptions must come from a traceable source, be sanitized, and contain at least 50 non-whitespace characters.
- Every proposed and accepted field keeps provenance. Do not persist full source pages.
- Code merge, production deployment, shadow execution, automatic writes, and full backfill are separate approvals.
- Default daily schedule is `20 3 * * *` in `Asia/Shanghai`; scheduler creates shadow tasks unless `BOOK_ENRICHMENT_AUTO_WRITE=1`.
- Default source concurrency is Google Books `2`, Open Library `1`, WeRead `1`; all are environment-overridable.

---

### Task 1: Domain contracts, ISBN normalization, and A/B/C resolver

**Files:**
- Create: `backend/src/services/bookEnrichment/types.ts`
- Create: `backend/src/services/bookEnrichment/identityResolver.ts`
- Create: `backend/src/services/bookEnrichment/identityResolver.test.ts`
- Modify: `backend/src/utils/bookMetadataSampleMatcher.ts`

**Interfaces:**
- Produces `BookEnrichmentField`, `BookIdentityInput`, `FieldCandidate`, `FieldDecision`, `IdentityResolution`, and `resolveBookCandidates(input, candidates)`.
- `IdentityResolution.identityLevel` is `"A" | "B" | "C"`; `accepted` only contains decisions with confidence `>= 0.90`.

- [ ] **Step 1: Write failing resolver tests**

Cover ISBN-10/13 equivalence, exact ISBN A-level, exact normalized title+author+publisher B-level, two-source agreement B-level, translator/publisher conflict C-level, and field confidence rejection below `0.90`:

```ts
test("equivalent ISBN-10 and ISBN-13 produce A identity", () => {
  const result = resolveBookCandidates(
    { title: "The Hobbit", author: "J. R. R. Tolkien", isbn: "0261102214" },
    [candidate("google_books", { isbn: "9780261102217", publisher: "HarperCollins" })]
  );
  assert.equal(result.identityLevel, "A");
  assert.equal(result.accepted.find((x) => x.field === "isbn")?.confidence, 0.95);
});

test("edition conflict produces C identity and no accepted fields", () => {
  const result = resolveBookCandidates(
    { title: "小王子", author: "圣埃克苏佩里", publisher: "人民文学出版社" },
    [candidate("google_books", { title: "小王子", author: "圣埃克苏佩里", publisher: "译林出版社", translator: "李某" })]
  );
  assert.equal(result.identityLevel, "C");
  assert.deepEqual(result.accepted, []);
});
```

- [ ] **Step 2: Run the resolver test and confirm RED**

Run: `cd backend && node --test --import tsx src/services/bookEnrichment/identityResolver.test.ts`

Expected: FAIL because the module/contracts do not exist.

- [ ] **Step 3: Implement exact domain contracts and pure resolver**

Use these public shapes:

```ts
export type BookEnrichmentField =
  | "title" | "author" | "publisher" | "isbn" | "publishedDate"
  | "cover" | "description" | "categoryLabel" | "topic";

export interface FieldCandidate {
  field: BookEnrichmentField;
  value: string;
  source: "google_books" | "open_library" | "weread_web" | "derived_tags";
  sourceId: string;
  sourceUrl: string;
  fetchedAt: Date;
  rawValueHash: string;
  identity: { title: string; author: string; publisher: string; isbn: string; translator: string };
}

export interface FieldDecision extends FieldCandidate {
  identityLevel: "A" | "B";
  confidence: number;
  reason: string[];
}
```

Export `normalizeIsbn`, `isbn10To13`, and the existing title/author/publisher normalizers from `bookMetadataSampleMatcher.ts` instead of duplicating text rules. A-level is equivalent ISBN; B-level is exact normalized title+author plus exact publisher or identical field value from two independent sources. Any explicit edition/translator/publisher conflict produces C.

- [ ] **Step 4: Run resolver and existing matcher tests**

Run:

```bash
cd backend
node --test --import tsx src/services/bookEnrichment/identityResolver.test.ts src/utils/bookMetadataSampleMatcher.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/src/services/bookEnrichment backend/src/utils/bookMetadataSampleMatcher.ts
git commit -m "feat: resolve book enrichment candidates"
```

### Task 2: Persist runs, tasks, and field evidence

**Files:**
- Create: `backend/src/models/BookEnrichmentRun.ts`
- Create: `backend/src/models/BookEnrichmentTask.ts`
- Create: `backend/src/models/BookEnrichmentEvidence.ts`
- Create: `backend/src/models/bookEnrichmentModels.test.ts`
- Modify: `backend/src/models/Book.ts`

**Interfaces:**
- Produces Mongoose models used by scheduler, workers, and admin routes.
- One unfinished task per book is enforced with a partial unique index.

- [ ] **Step 1: Write failing model tests**

Use the existing memory Mongo helper pattern. Assert defaults, legal state transitions, evidence fields, and duplicate unfinished-task rejection:

```ts
await BookEnrichmentTask.create({ runId, bookId, mode: "shadow" });
await assert.rejects(
  BookEnrichmentTask.create({ runId, bookId, mode: "shadow" }),
  /duplicate key/
);
```

- [ ] **Step 2: Run model test and confirm RED**

Run: `cd backend && node --test --import tsx src/models/bookEnrichmentModels.test.ts`

Expected: FAIL because the models do not exist.

- [ ] **Step 3: Implement schemas and indexes**

Use these persisted fields:

```ts
BookEnrichmentRun: {
  mode: "shadow" | "automatic";
  trigger: "full" | "daily" | "manual";
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  totals: { queued: number; completed: number; lowScore: number; retrying: number; blocked: number; failed: number };
  startedAt; finishedAt; createdBy;
}

BookEnrichmentTask: {
  runId; bookId; mode;
  status: "queued" | "collecting" | "resolving" | "writing" | "completed" | "retry_wait" | "blocked";
  attempt; nextRetryAt; lockToken; lockedAt;
  baseBookUpdatedAt; baseMetadataUpdatedAt;
  qualityBefore; qualityAfter; missingFields; acceptedFields; rejectedFields;
  lastErrorCode; lastErrorMessage; startedAt; finishedAt;
}

BookEnrichmentEvidence: {
  runId; taskId; bookId; field; proposedValue;
  source; sourceId; sourceUrl; fetchedAt; rawValueHash;
  identityLevel; confidence; reasons;
  decision: "accepted" | "rejected" | "shadow_only";
  appliedAt;
}
```

Add `enrichmentDisabled: { type: Boolean, default: false, index: true }` to `Book`; this is the durable switch used by admin and the daily selector. Add a partial unique index on `{ bookId: 1 }` where status is in `queued/collecting/resolving/writing/retry_wait` and query indexes for run status, retry time, and book timeline.

- [ ] **Step 4: Run model tests**

Run: `cd backend && node --test --import tsx src/models/bookEnrichmentModels.test.ts`

Expected: all pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add backend/src/models/BookEnrichment*.ts backend/src/models/bookEnrichmentModels.test.ts backend/src/models/Book.ts
git commit -m "feat: persist book enrichment runs"
```

### Task 3: Build bounded source adapters

**Files:**
- Create: `backend/src/services/bookEnrichment/sources/googleBooks.ts`
- Create: `backend/src/services/bookEnrichment/sources/openLibrary.ts`
- Create: `backend/src/services/bookEnrichment/sources/weread.ts`
- Create: `backend/src/services/bookEnrichment/sources/sourceAdapters.test.ts`
- Modify: `backend/src/utils/wereadSearchParser.ts`

**Interfaces:**
- Each adapter implements `BookSourceAdapter.search(book, signal): Promise<FieldCandidate[]>`.
- Source URL, source ID, fetch time, and SHA-256 raw value hash are mandatory on every candidate.

- [ ] **Step 1: Write failing adapter tests with mocked `fetch`**

Test ISBN-first query, title/author fallback query, Google API key inclusion, Open Library timeout/rate error classification, WeRead parser reuse, HTML description extraction, and omission of empty fields. Assert adapters never return a whole source page.

- [ ] **Step 2: Run adapter tests and confirm RED**

Run: `cd backend && node --test --import tsx src/services/bookEnrichment/sources/sourceAdapters.test.ts`

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement adapters with fixed endpoints and timeouts**

```ts
export interface BookSourceAdapter {
  name: FieldCandidate["source"];
  search(book: BookIdentityInput, signal: AbortSignal): Promise<FieldCandidate[]>;
}
```

- Google: `GET https://www.googleapis.com/books/v1/volumes`, `q=isbn:<isbn>` first, otherwise `intitle:` + `inauthor:`, `maxResults=5`, `printType=books`, optional `key=GOOGLE_BOOKS_API_KEY`.
- Open Library: `GET https://openlibrary.org/search.json`, ISBN first, otherwise title+author, `limit=5`; use edition ISBNs and `covers.openlibrary.org` IDs. One concurrent request by default.
- WeRead: preserve the existing search URL and `parseWereadSearchCandidates`; move network lookup out of the old export script into the adapter so the script can call the shared adapter later.
- Use `BOOK_ENRICHMENT_REQUEST_TIMEOUT_MS` default `10_000`; classify `429`, timeout, network, and invalid payload errors with stable codes.

- [ ] **Step 4: Run adapter and parser tests**

Run:

```bash
cd backend
node --test --import tsx src/services/bookEnrichment/sources/sourceAdapters.test.ts src/utils/wereadSearchParser.test.ts
```

Expected: all pass and no live network call occurs.

- [ ] **Step 5: Commit Task 3**

```bash
git add backend/src/services/bookEnrichment/sources backend/src/utils/wereadSearchParser.ts
git commit -m "feat: add book metadata source workers"
```

### Task 4: Implement description/cover validation, derived tags, and protected writer

**Files:**
- Create: `backend/src/services/bookEnrichment/fieldValidation.ts`
- Create: `backend/src/services/bookEnrichment/tagWorker.ts`
- Create: `backend/src/services/bookEnrichment/bookEnrichmentWriter.ts`
- Create: `backend/src/services/bookEnrichment/bookEnrichmentWriter.test.ts`
- Modify: `backend/src/services/bookMetadataService.ts`
- Modify: `backend/src/models/BookMetadata.ts`
- Modify: `backend/src/controllers/book.ts`
- Modify: `frontend/src/services/api.ts`

**Interfaces:**
- Produces `sanitizeBookDescription`, `validateCoverCandidate`, `deriveBookTags`, and `applyBookEnrichmentDecisions`.
- Writer returns `{ applied, skipped, metadata, qualityAfter }` and is idempotent.

- [ ] **Step 1: Write failing validation/writer tests**

Cover HTML stripping, marketing-tail removal, 50-character minimum, placeholder/invalid MIME cover rejection, deterministic tag derivation, reviewed field protection, automatic fill-only behavior, placeholder cover replacement, concurrent manual edit protection, shadow no-write, provenance decision update, and identical rerun no-op.

```ts
const result = await applyBookEnrichmentDecisions({
  taskId, bookId, mode: "automatic", decisions,
});
assert.deepEqual(result.applied, ["description"]);
assert.equal((await BookMetadata.findOne({ bookId }))?.title, "人工书名");
```

- [ ] **Step 2: Run writer test and confirm RED**

Run: `cd backend && node --test --import tsx src/services/bookEnrichment/bookEnrichmentWriter.test.ts`

Expected: FAIL because validation and writer services do not exist.

- [ ] **Step 3: Implement validation and one compare-and-fill writer**

Extend `BookMetadata` with trimmed `translator`, `publishedDate`, `categoryLabel`, and `topic` fields. Include them in public/admin metadata formatters and frontend metadata types. Update `calculateBookQualityScore` callers to pass effective metadata values so category/topic/published-date points reflect accepted details without mutating base `Book`.

Map enrichment fields to `BookMetadata`; the existing identity/title/author/publisher/isbn/cover/description fields and the four new detail fields remain the formal enriched record. Before updating, reload `Book` and `BookMetadata`; construct `$set` only for fields still empty or recognized placeholders. Never set `reviewedAt`. Use a transaction when supported; otherwise use a conditional `findOneAndUpdate` per field and update evidence only after the metadata write succeeds.

`deriveBookTags` V1 uses normalized source categories plus a checked-in keyword map over accepted description; return `{ categoryLabel, topic, derivationVersion: "rules-v1" }`. Do not call an LLM in V1.

- [ ] **Step 4: Run writer and metadata regression tests**

Run:

```bash
cd backend
node --test --import tsx src/services/bookEnrichment/bookEnrichmentWriter.test.ts src/services/bookMetadataService.test.ts src/services/bookQualityScore.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add backend/src/services/bookEnrichment backend/src/services/bookMetadataService.ts backend/src/models/BookMetadata.ts backend/src/controllers/book.ts frontend/src/services/api.ts
git commit -m "feat: safely apply book enrichment fields"
```

### Task 5: Orchestrate recoverable tasks and daily shadow scheduling

**Files:**
- Create: `backend/src/services/bookEnrichment/bookEnrichmentWorker.ts`
- Create: `backend/src/services/bookEnrichment/bookEnrichmentScheduler.ts`
- Create: `backend/src/services/bookEnrichment/bookEnrichmentWorker.test.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Produces `createBookEnrichmentRun`, `processNextBookEnrichmentTask`, `startBookEnrichmentScheduler`, and `stopBookEnrichmentScheduler`.
- Scheduler defaults to shadow mode and never starts a full run automatically.

- [ ] **Step 1: Write failing worker lifecycle tests**

Test quality-ascending full selection, daily eligibility, atomic task claim, source concurrency, stage transitions, evidence persistence, shadow-only decision, automatic writer call, exponential retry, identity conflict blocking, stale lock recovery, and run totals.

- [ ] **Step 2: Run worker tests and confirm RED**

Run: `cd backend && node --test --import tsx src/services/bookEnrichment/bookEnrichmentWorker.test.ts`

Expected: FAIL because worker/scheduler do not exist.

- [ ] **Step 3: Implement run creation and atomic worker lifecycle**

Use `findOneAndUpdate` with a generated lock token to claim one queued/due task. Stages are exactly `collecting -> resolving -> writing -> completed`; shadow mode persists `shadow_only` evidence and skips writer. Retry delay is `min(24h, 15m * 2^(attempt-1))`; identity conflict becomes `blocked`; successful results below 75 set `missingFields` and complete without immediate requeue.

The daily selector excludes `Book.enrichmentDisabled === true`, then includes books created/updated since the last completed daily run, current quality below 75, or due retry tasks. A manual full run orders eligible candidates by `calculateBookQualityScore(...).totalScore` ascending.

- [ ] **Step 4: Wire scheduler into backend startup**

Start only when `BOOK_ENRICHMENT_ENABLED=1`. Cron is `BOOK_ENRICHMENT_CRON || "20 3 * * *"`, timezone `Asia/Shanghai`; scheduled mode is automatic only when `BOOK_ENRICHMENT_AUTO_WRITE=1`, otherwise shadow. Export a stop function for tests.

- [ ] **Step 5: Run lifecycle tests and backend targeted regression tests**

Run:

```bash
cd backend
node --test --import tsx src/services/bookEnrichment/bookEnrichmentWorker.test.ts src/controllers/book.description-priority.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add backend/src/services/bookEnrichment backend/src/index.ts
git commit -m "feat: schedule recoverable book enrichment"
```

### Task 6: Add admin control and audit APIs

**Files:**
- Create: `backend/src/routes/adminBookEnrichment.ts`
- Create: `backend/src/routes/adminBookEnrichment.test.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Produces authenticated admin endpoints under `/api/admin/book-enrichment`.

- [ ] **Step 1: Write failing route tests**

Test admin authentication, stats/filter responses, 50-book shadow cap, explicit automatic-mode flag, task timeline, retry, stop-auto flag, and rejection of full automatic backfill through the API.

- [ ] **Step 2: Run route test and confirm RED**

Run: `cd backend && node --test --import tsx src/routes/adminBookEnrichment.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement exact endpoints**

```text
GET  /api/admin/book-enrichment/summary
GET  /api/admin/book-enrichment/tasks?status=&source=&missingField=&maxScore=&page=&size=
GET  /api/admin/book-enrichment/books/:bookId/timeline
POST /api/admin/book-enrichment/runs/shadow       { limit: 1..50 }
POST /api/admin/book-enrichment/runs/automatic    { limit: 1..50, confirmation: "AUTO_WRITE_50" }
POST /api/admin/book-enrichment/tasks/:id/retry
PUT  /api/admin/book-enrichment/books/:bookId/disabled { disabled: boolean }
```

Do not expose a full-auto-backfill endpoint. Full backfill remains an operations command added only after the 50-book automatic gate passes.

- [ ] **Step 4: Run route tests**

Run: `cd backend && node --test --import tsx src/routes/adminBookEnrichment.test.ts`

Expected: all pass.

- [ ] **Step 5: Commit Task 6**

```bash
git add backend/src/routes/adminBookEnrichment* backend/src/index.ts
git commit -m "feat: expose book enrichment audit API"
```

### Task 7: Add the admin quality operations surface

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/pages/admin/AdminBooksPage.tsx`
- Modify: `frontend/src/pages/admin/AdminBooksPage.test.mjs`

**Interfaces:**
- Consumes Task 6 endpoints.
- Adds summary/filter controls, per-book timeline, rerun, and disable-auto actions without adding an accept/reject queue.

- [ ] **Step 1: Write failing static/UI tests**

Assert API types/methods, six summary states, quality/missing/source/status filters, timeline evidence fields, “重新采集”, “停止自动补充”, shadow-run button, and absence of per-field accept/reject controls.

- [ ] **Step 2: Run frontend test and confirm RED**

Run: `node frontend/src/pages/admin/AdminBooksPage.test.mjs`

Expected: FAIL on missing enrichment API/UI strings.

- [ ] **Step 3: Implement API contracts and minimal admin UI**

Add `BookEnrichmentSummary`, `BookEnrichmentTask`, and `BookEnrichmentEvidence` types. Keep the existing quality score column; add a compact summary strip, filters, and a timeline drawer opened from a book row. The automatic 50-book button requires typing `AUTO_WRITE_50`; the default action is “运行50本影子批次”. Do not add approval buttons.

- [ ] **Step 4: Run UI test and production build**

Run:

```bash
node frontend/src/pages/admin/AdminBooksPage.test.mjs
cd frontend && npm run build
```

Expected: tests and build pass. Inspect `/admin/books` in a local browser with seeded task/evidence data; verify filters, timeline overflow, empty states, and mobile-width horizontal table behavior.

- [ ] **Step 5: Commit Task 7**

```bash
git add frontend/src/services/api.ts frontend/src/pages/admin/AdminBooksPage.tsx frontend/src/pages/admin/AdminBooksPage.test.mjs frontend/public/screens/admin.css frontend/public/screens/public.css
git commit -m "feat: monitor book enrichment in admin"
```

### Task 8: Shadow-run verification, documentation, and release gates

**Files:**
- Create: `backend/src/scripts/runBookEnrichmentShadow.ts`
- Create: `backend/src/scripts/reportBookEnrichmentShadow.ts`
- Create: `backend/src/scripts/bookEnrichmentShadow.test.ts`
- Modify: `docs/modules/backend-api.md`
- Modify: `docs/ACTIVE_CONTEXT.md`
- Modify: `backend/.env.example` if tracked; otherwise document variables without creating a secrets file.

**Interfaces:**
- Produces an explicit local/operations command for a maximum 50-book shadow run and a JSON/console report with A/B/C, coverage, failure, and proposed-write counts.

- [ ] **Step 1: Write failing script tests**

Assert default shadow mode, hard cap 50, no `BookMetadata` mutation, report totals, zero-overwrite check, and non-zero exit when any sampled identity is manually classified as a false match.

- [ ] **Step 2: Run script test and confirm RED**

Run: `cd backend && node --test --import tsx src/scripts/bookEnrichmentShadow.test.ts`

Expected: FAIL because scripts do not exist.

- [ ] **Step 3: Implement bounded scripts and update docs**

Commands:

```bash
cd backend
node --import tsx src/scripts/runBookEnrichmentShadow.ts --limit=50
node --import tsx src/scripts/reportBookEnrichmentShadow.ts --latest
```

The run script rejects `--limit > 50` and never accepts an automatic-write flag. Document environment variables, source limits, scheduler defaults, data ownership, and the four separate approval gates. Rewrite `ACTIVE_CONTEXT.md` as a snapshot when the workstream closes.

- [ ] **Step 4: Run the full scoped verification**

Run:

```bash
cd backend
node --test --import tsx \
  src/services/bookEnrichment/identityResolver.test.ts \
  src/models/bookEnrichmentModels.test.ts \
  src/services/bookEnrichment/sources/sourceAdapters.test.ts \
  src/services/bookEnrichment/bookEnrichmentWriter.test.ts \
  src/services/bookEnrichment/bookEnrichmentWorker.test.ts \
  src/routes/adminBookEnrichment.test.ts \
  src/scripts/bookEnrichmentShadow.test.ts
node src/controllers/book.metadata.test.mjs
cd ../frontend
node src/pages/admin/AdminBooksPage.test.mjs
npm run build
cd ..
git diff --check
```

Expected: all targeted tests pass, frontend build exits 0, and `git diff --check` has no output. Run `cd backend && npm run build` separately; if unrelated existing TypeScript failures remain, record exact paths and confirm no failure references book-enrichment files.

- [ ] **Step 5: Run a local 50-book shadow batch only after explicit user approval**

Do not perform this step during ordinary implementation. After approval, run the bounded shadow command, manually inspect all A/B proposed writes and a representative C/blocked sample, and require sampled false matches to equal `0` before proposing automatic mode.

- [ ] **Step 6: Commit Task 8**

```bash
git add backend/src/scripts/runBookEnrichmentShadow.ts backend/src/scripts/reportBookEnrichmentShadow.ts backend/src/scripts/bookEnrichmentShadow.test.ts docs/modules/backend-api.md docs/ACTIVE_CONTEXT.md
# Add backend/.env.example only when that file already exists and was updated.
git commit -m "docs: add book enrichment shadow gate"
```
