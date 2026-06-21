# Book Detail Path-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/reading/:id` into a path-first book detail page that explains why a book belongs in the Xianfeng reading path before showing raw book metadata.

**Architecture:** Keep the existing `BookDetailPage` route and the existing `GET /api/books/:id` plus optional `GET /api/books/:id/metadata` data flow. Refactor the page into small local rendering helpers inside `BookDetailPage.tsx` so the current one-file page stays understandable without introducing new cross-file abstractions.

**Tech Stack:** React, TypeScript, React Router, Tailwind CSS utility classes, Node test runner with source assertions, Vite build.

---

### File Structure

**Modify:**

- `frontend/src/pages/BookDetailPage.tsx`
  - Owns all public book detail rendering.
  - Add local helpers for route text, score labels, related path cards, and mobile-friendly section layout.
  - Keep data loading logic intact.

- `frontend/src/pages/BookDetailPage.test.mjs`
  - Extend existing source-level tests to cover the path-first layout, metadata fallback, and no-empty-section behavior.

**No backend changes in this plan:**

- `backend/src/models/Book.ts` does not currently expose a source program id.
- `Book.sourceName` is a display string only.
- `sourceGuestId` can support a guest-link path when populated, but the public `getByIdPublic` endpoint currently does not populate it.
- The first implementation must not invent program routes from `sourceName`.

---

### Task 1: Add source-level tests for the path-first detail contract

**Files:**

- Modify: `frontend/src/pages/BookDetailPage.test.mjs`

- [ ] **Step 1: Add assertions for path-first copy and helpers**

Add this test below the existing tests:

```js
test("book detail page uses a path-first reading layout", () => {
  assert.match(pageSource, /这本书为什么会出现在家长先疯/, "detail page should explain the book's role in the Xianfeng path");
  assert.match(pageSource, /什么时候打开这本书/, "detail page should include a usage-scenario section");
  assert.match(pageSource, /图书资料/, "detail page should keep raw metadata in a later information section");
  assert.match(pageSource, /继续往下走/, "detail page should include next-step path cards");
  assert.match(pageSource, /buildPathSummary/, "detail page should derive path summary text from available fields");
});
```

- [ ] **Step 2: Add assertions for graceful fallback behavior**

Add this test below the path-first layout test:

```js
test("book detail page hides unavailable path actions instead of rendering empty placeholders", () => {
  assert.match(pageSource, /const hasRating = Boolean/, "detail page should compute rating visibility before rendering");
  assert.match(pageSource, /const sourceGuestId = getSourceGuestId\(book\.sourceGuestId\)/, "detail page should normalize source guest ids");
  assert.match(pageSource, /sourceGuestId \? `\/experts\/\$\{sourceGuestId\}` : ""/, "guest cards should only link when a guest id exists");
  assert.match(pageSource, /book\.sourceName \? \(/, "source program display should depend on a source name being present");
  assert.match(pageSource, /当前只有基础图书信息，详细介绍仍在补充。/, "missing metadata should have a compact fallback copy");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
frontend/node_modules/.bin/vitest --run frontend/src/pages/BookDetailPage.test.mjs
```

Expected:

- FAIL because `BookDetailPage.tsx` does not yet contain `buildPathSummary`, `什么时候打开这本书`, `图书资料`, and `继续往下走`.

If this repo does not have `vitest` available for `.mjs` source assertion tests, run:

```bash
node --test frontend/src/pages/BookDetailPage.test.mjs
```

Expected:

- Same assertion failures.

### Task 2: Refactor `BookDetailPage.tsx` with path-first helpers

**Files:**

- Modify: `frontend/src/pages/BookDetailPage.tsx`

- [ ] **Step 1: Add local helper functions below image helpers**

Add these helpers after `buildProxyImageUrl`:

```tsx
function getSourceGuestId(value: Book["sourceGuestId"]): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return String(value._id || "").trim();
}

function buildPathSummary(book: Book, metadata: BookMetadataDetail | null): string {
  const topic = String(book.topic || book.categoryLabel || "家庭教育").trim();
  const sourceName = String(book.sourceName || "").trim();
  const guest = String(book.recommendedGuest || "").trim();
  if (sourceName) {
    return `这本书来自《${sourceName}》的阅读线索，适合围绕${topic}继续往下理解。`;
  }
  if (guest) {
    return `这本书由${guest}带入家长先疯阅读路径，适合围绕${topic}继续往下理解。`;
  }
  if (metadata?.description) {
    return "这本书已进入家长先疯阅读路径，可以先从简介里找到与当下问题相关的线索。";
  }
  return "这本书已进入家长先疯阅读路径，详细推荐语仍在补充。";
}

function buildScenarioCards(book: Book) {
  const topic = String(book.topic || book.categoryLabel || "家庭教育").trim();
  const grade = String(book.grade || "").trim();
  return [
    {
      label: "困惑场景",
      title: `围绕${topic}先找到入口`,
      body: `当问题还停留在感受和判断里时，可以先用这本书把线索拆清楚。`,
    },
    {
      label: "适合阶段",
      title: grade ? `适合关注${grade}阶段的家庭` : "适合正在做判断的家长",
      body: grade ? `从${grade}的具体处境出发，回到更稳定的阅读和行动路径。` : "适合在做选择、定规则、调节沟通前先建立共同语言。",
    },
    {
      label: "行动线索",
      title: "读完后带走一个下一步",
      body: "不是追求一次读懂所有答案，而是拿到可以继续观察、讨论和执行的线索。",
    },
  ];
}
```

- [ ] **Step 2: Replace the loaded `book` render block opening**

Find this pattern in `BookDetailPage.tsx`:

```tsx
        {!loading && !error && book ? (
          <section className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
```

Replace it with this opening:

```tsx
        {!loading && !error && book ? (() => {
          const pathSummary = buildPathSummary(book, metadata);
          const scenarioCards = buildScenarioCards(book);
          const sourceGuestId = getSourceGuestId(book.sourceGuestId);
          const hasRating = Boolean(metadata?.rating || metadata?.ratingCount || metadata?.ratingLabel);
          const intro = metadata?.description || "当前只有基础图书信息，详细介绍仍在补充。";

          return (
```

- [ ] **Step 3: Replace the current loaded section JSX with the path-first layout**

Replace from the old loaded `<section className="rounded-[2rem] border...">` through its closing `</section>` with this full return body, then close the IIFE with `)})() : null}`:

```tsx
<div className="space-y-8">
  <section className="overflow-hidden rounded-[2rem] border border-[#ded7f3] bg-white shadow-[0_18px_60px_rgba(80,62,125,0.08)]">
    <div className="grid gap-0 lg:grid-cols-[minmax(260px,0.42fr)_minmax(0,0.58fr)]">
      <div className="flex items-center justify-center bg-[linear-gradient(135deg,#f5f1ff,#ffffff)] p-6 sm:p-8">
        <div className="w-full max-w-[280px] overflow-hidden rounded-[1.75rem] border border-[#e5def6] bg-[#faf8ff] shadow-[0_18px_40px_rgba(80,62,125,0.08)]">
          {hasUsableImage(heroImage) ? (
            <img
              src={buildProxyImageUrl(heroImage)}
              alt={metadata?.title || book.title || "书籍封面"}
              className="aspect-[3/4] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center bg-[linear-gradient(135deg,#f5f1ff,#ede6ff)] text-[72px] font-black text-[#cfc4f0]">
              书
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 p-6 sm:p-8 lg:p-10">
        <div className="inline-flex rounded-full bg-[#f1eaff] px-3 py-1 text-xs font-black text-[#6d28d9]">来自及阅</div>
        <h1 className="mt-4 text-3xl font-black leading-tight text-[#24163a] sm:text-5xl">
          {metadata?.title || book.title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-[#6b5f95]">
          <span>作者：{metadata?.author || book.author || "未标注"}</span>
          <span>出版社：{metadata?.publisher || book.publisher || "未标注"}</span>
          {hasRating ? <span>评分：{metadata?.ratingLabel || metadata?.rating}</span> : null}
        </div>

        <div className="mt-8 rounded-[1.5rem] border border-[#eadffc] bg-[#fbf9ff] p-5">
          <div className="text-sm font-black text-[#6d28d9]">这本书为什么会出现在家长先疯</div>
          <p className="mt-3 text-base leading-8 text-[#4f456f]">{pathSummary}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a href="#book-intro" className="inline-flex items-center justify-center rounded-full bg-[#7C3AED] px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(124,58,237,0.22)]">
            继续读这本书
          </a>
          <Link
            to="/reading"
            className="inline-flex items-center justify-center rounded-full border border-[#ddd3f5] bg-white px-5 py-3 text-sm font-black text-[#5f46af]"
          >
            {book.sourceName ? "回到相关书单" : "回到书单"}
          </Link>
        </div>
      </div>
    </div>
  </section>

  <section className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-sm font-black text-[#7C3AED]">阅读路径</div>
        <h2 className="mt-2 text-2xl font-black text-[#24163a]">什么时候打开这本书</h2>
      </div>
    </div>
    <div className="mt-5 flex snap-x gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
      {scenarioCards.map((card) => (
        <article key={card.label} className="min-w-[82%] snap-start rounded-[1.4rem] border border-[#ece5fb] bg-[#fcfbff] p-5 sm:min-w-[48%] lg:min-w-0">
          <div className="text-xs font-black text-[#7C3AED]">{card.label}</div>
          <h3 className="mt-3 text-xl font-black text-[#24163a]">{card.title}</h3>
          <p className="mt-3 text-sm leading-7 text-[#6b5f95]">{card.body}</p>
        </article>
      ))}
    </div>
  </section>

  <section id="book-intro" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
    <article className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
      <div className="text-sm font-black text-[#7C3AED]">图书资料</div>
      <h2 className="mt-2 text-2xl font-black text-[#24163a]">内容简介</h2>
      <p className="mt-5 line-clamp-[8] whitespace-pre-wrap text-base leading-8 text-[#4f456f] sm:line-clamp-none">
        {intro}
      </p>
    </article>

    <aside className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
      <div className="text-sm font-black text-[#7C3AED]">基础信息</div>
      <dl className="mt-5 space-y-4 text-sm">
        <div><dt className="font-black text-[#8d84b6]">作者</dt><dd className="mt-1 text-[#24163a]">{metadata?.author || book.author || "未标注"}</dd></div>
        <div><dt className="font-black text-[#8d84b6]">出版社</dt><dd className="mt-1 text-[#24163a]">{metadata?.publisher || book.publisher || "未标注"}</dd></div>
        {metadata?.isbn ? <div><dt className="font-black text-[#8d84b6]">ISBN</dt><dd className="mt-1 text-[#24163a]">{metadata.isbn}</dd></div> : null}
        {hasRating ? <div><dt className="font-black text-[#8d84b6]">评分</dt><dd className="mt-1 text-[#24163a]">{metadata?.ratingLabel || metadata?.rating}{metadata?.ratingCount ? ` / ${metadata.ratingCount} 人评价` : ""}</dd></div> : null}
      </dl>
    </aside>
  </section>

  <section className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
    <div className="text-sm font-black text-[#7C3AED]">继续往下走</div>
    <h2 className="mt-2 text-2xl font-black text-[#24163a]">从这本书回到内容路径</h2>
    <div className="mt-5 grid gap-4 md:grid-cols-3">
      {book.sourceName ? (
        <article className="rounded-[1.4rem] border border-[#ece5fb] bg-[#fcfbff] p-5">
          <div className="text-xs font-black text-[#7C3AED]">来源节目</div>
          <h3 className="mt-3 text-lg font-black text-[#24163a]">《{book.sourceName}》</h3>
          <p className="mt-2 text-sm leading-6 text-[#6b5f95]">这本书来自节目阅读线索，后续可补充节目直达链接。</p>
        </article>
      ) : null}

      {book.recommendedGuest ? (
        sourceGuestId ? (
          <Link to={`/experts/${sourceGuestId}`} className="rounded-[1.4rem] border border-[#ece5fb] bg-[#fcfbff] p-5">
            <div className="text-xs font-black text-[#7C3AED]">推荐嘉宾</div>
            <h3 className="mt-3 text-lg font-black text-[#24163a]">{book.recommendedGuest}</h3>
            <p className="mt-2 text-sm leading-6 text-[#6b5f95]">继续查看这位嘉宾相关的节目和内容线索。</p>
          </Link>
        ) : (
          <article className="rounded-[1.4rem] border border-[#ece5fb] bg-[#fcfbff] p-5">
            <div className="text-xs font-black text-[#7C3AED]">推荐嘉宾</div>
            <h3 className="mt-3 text-lg font-black text-[#24163a]">{book.recommendedGuest}</h3>
            <p className="mt-2 text-sm leading-6 text-[#6b5f95]">嘉宾详情链接仍在补充。</p>
          </article>
        )
      ) : null}

      <Link to={`/reading${book.topic ? `?q=${encodeURIComponent(book.topic)}` : ""}`} className="rounded-[1.4rem] border border-[#ece5fb] bg-[#fcfbff] p-5">
        <div className="text-xs font-black text-[#7C3AED]">延伸阅读</div>
        <h3 className="mt-3 text-lg font-black text-[#24163a]">继续找同主题内容</h3>
        <p className="mt-2 text-sm leading-6 text-[#6b5f95]">回到及阅，用主题和关键词继续筛选相关书单。</p>
      </Link>
    </div>
  </section>
</div>
```

Immediately after this `</div>`, close the loaded render block with:

```tsx
          );
        })() : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test frontend/src/pages/BookDetailPage.test.mjs
```

Expected:

- PASS for existing metadata tests and new path-first tests.

### Task 3: Remove invalid source-program implication and keep paths honest

**Files:**

- Modify: `frontend/src/pages/BookDetailPage.tsx`
- Modify: `docs/superpowers/specs/2026-06-19-book-detail-path-first-design.md`

- [ ] **Step 1: Confirm no fake program link is rendered**

Search:

```bash
rg -n "programs/|查看来源节目|sourceProgram" frontend/src/pages/BookDetailPage.tsx
```

Expected:

- No `programs/${...}` link built from `sourceName`.
- No `查看来源节目` button unless a real program id field is added in a future task.

- [ ] **Step 2: Verify the spec records the no-fake-program-link boundary**

Run:

```bash
rg -n "当前 `Book` 只有 `sourceName`，没有 `sourceProgramId`" docs/superpowers/specs/2026-06-19-book-detail-path-first-design.md
```

Expected:

- The spec contains the no-fake-program-link boundary.

- [ ] **Step 3: Re-run the source tests**

Run:

```bash
node --test frontend/src/pages/BookDetailPage.test.mjs
```

Expected:

- PASS.

### Task 4: Browser verification on real local pages

**Files:**

- Verify: `frontend/src/pages/BookDetailPage.tsx`

- [ ] **Step 1: Start local services if needed**

Run:

```bash
./scripts/local/up.sh
```

Expected:

- Frontend reachable at `http://localhost:5173/`.
- Backend reachable through `/api`.

- [ ] **Step 2: Find one real book detail URL**

Run:

```bash
curl -s http://127.0.0.1:5173/api/books | head -c 4000
```

Expected:

- Response contains at least one published book with `_id`.

Open:

```text
http://localhost:5173/reading/<bookId>
```

- [ ] **Step 3: Verify desktop layout**

Use browser verification at desktop width.

Expected:

- Top area shows book cover on the left and path explanation on the right.
- The first visible explanation includes `这本书为什么会出现在家长先疯`.
- `内容简介` appears below the path cards, not in the hero.
- No empty rating, ISBN, source, or guest placeholders appear.

- [ ] **Step 4: Verify mobile layout**

Use browser verification at mobile width.

Expected:

- Hero is single-column.
- Action buttons do not overflow.
- `什么时候打开这本书` cards scroll horizontally.
- Bottom mobile tab does not cover page content.

### Task 5: Build verification

**Files:**

- Verify: frontend bundle

- [ ] **Step 1: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected:

- Build completes without TypeScript or Vite errors.

- [ ] **Step 2: Final focused checks**

Run:

```bash
node --test frontend/src/pages/BookDetailPage.test.mjs
node --test frontend/src/App.test.mjs
node --test frontend/src/pages/BooksPage.test.mjs
```

Expected:

- All tests pass.

### Task 6: Completion notes

**Files:**

- Review: `docs/superpowers/specs/2026-06-19-book-detail-path-first-design.md`
- Review: `docs/superpowers/plans/2026-06-19-book-detail-path-first.md`

- [ ] **Step 1: Report what shipped**

Completion report must include:

- What changed in `BookDetailPage.tsx`
- Which tests and build actually ran
- Whether browser verification ran
- Any remaining limitation around missing `sourceProgramId`

- [ ] **Step 2: Do not claim release readiness if browser verification did not run**

If browser verification or `npm run build` was skipped, say exactly which item was not verified.
