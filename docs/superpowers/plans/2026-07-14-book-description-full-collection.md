# 图书简介全量公开信源收集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将清洗版 Excel 中 2,404 本待重新收集图书全部查询完毕，并以 `已采纳`、`待人工复核` 或 `已穷尽信源` 三种终态输出可审计的最终 Excel。

**Architecture:** 在对话输出目录建立独立、可恢复的本地收集工作区。确定性脚本负责读表、任务排序、信源调用、身份仲裁、质量校验、检查点和 Excel 导出；自由网页研究只处理确定性信源无法解决的剩余任务，并以相同证据格式回填。所有网络访问只读，任何阶段都不调用线上编辑接口或 MongoDB。

**Tech Stack:** Node.js 22、Node test runner、TypeScript/tsx、`@oai/artifact-tool`、Google Books API、Open Library APIs、公开出版社/图书馆网页、JSONL 检查点

## Global Constraints

- 任务池固定为清洗版 Excel 中清洗后简介为空的 2,404 本图书。
- 每本书最终必须且只能进入 `已采纳`、`待人工复核` 或 `已穷尽信源`。
- 简介不得由 AI 生成、扩写或由字段拼接；只保存可追溯来源原文的必要清洗结果。
- 有效简介不少于 50 个字符，并通过模板、目录、评论、作者简介、促销和跨书重复检测。
- C 级身份或 C 级唯一信源不得自动采纳。
- 每批最多 100 本；每批输出检查点和 Excel 快照；每 500 本输出累计报告。
- 单一信源失败不得阻塞其他信源；限流和网络错误按信源退避。
- 只写本地 JSONL、报告和 Excel；禁止 POST、PUT、PATCH、DELETE、MongoDB 和线上正式详情写入。

---

### Task 1: 本地任务池与恢复状态

**Files:**
- Create: `tools/book-description-collection/taskPool.ts`
- Create: `tools/book-description-collection/taskPool.test.ts`
- Create: `tools/book-description-collection/types.ts`
- Create: `tools/book-description-collection/cli/init.ts`

**Interfaces:**
- Consumes: 清洗版 Excel 的“图书总表”。
- Produces: `CollectionTask`、`CollectionEvidence`、`CollectionDecision` 类型，以及按身份完整度排序的 `tasks.jsonl`。

- [ ] **Step 1: 定义任务与证据类型**

```ts
export type TerminalStatus = "已采纳" | "待人工复核" | "已穷尽信源";
export type TaskStatus = "queued" | "collecting" | "retry_wait" | TerminalStatus;
export type SourceTier = "A" | "B" | "C";
export type IdentityLevel = "A" | "B" | "C";

export interface CollectionTask {
  bookId: string;
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  batchNo: number;
  priority: number;
  status: TaskStatus;
  attempts: number;
  queriedSources: string[];
  nextRetryAt: string | null;
  lastErrorCode: string;
  updatedAt: string;
}

export interface CollectionEvidence {
  bookId: string;
  sourceName: string;
  sourceTier: SourceTier;
  sourceUrl: string;
  sourceRecordId: string;
  fetchedAt: string;
  candidateTitle: string;
  candidateAuthor: string;
  candidatePublisher: string;
  candidateIsbn: string;
  originalDescription: string;
  cleanedDescription: string;
  contentHash: string;
  identityLevel: IdentityLevel;
  confidence: number;
  rejectionCodes: string[];
}
```

- [ ] **Step 2: 写任务排序失败测试**

```ts
test("orders complete ISBN identities before ambiguous titles", () => {
  const tasks = buildTasks([
    row({ id: "a", title: "只有书名" }),
    row({ id: "b", title: "完整", author: "作者", publisher: "出版社", isbn: "9787111111111" }),
    row({ id: "c", title: "无ISBN", author: "作者", publisher: "出版社" }),
  ]);
  assert.deepEqual(tasks.map((task) => task.bookId), ["b", "c", "a"]);
  assert.deepEqual(tasks.map((task) => task.batchNo), [1, 1, 1]);
});

test("creates exactly 2404 tasks from empty cleaned descriptions", () => {
  const tasks = buildTasks(readMasterRows(fixtureWorkbook));
  assert.equal(tasks.length, 2404);
  assert.ok(tasks.every((task) => task.status === "queued"));
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd backend && node --test --import tsx ../tools/book-description-collection/taskPool.test.ts`

Expected: FAIL，提示 `buildTasks` 未定义。

- [ ] **Step 4: 实现排序和 100 本分批**

```ts
export function identityPriority(row: MasterRow): number {
  if (row.isbn && row.title && row.author && row.publisher) return 1;
  if (row.isbn) return 2;
  if (row.title && row.author && row.publisher) return 3;
  return 4;
}

export function buildTasks(rows: MasterRow[]): CollectionTask[] {
  return rows
    .filter((row) => !row.cleanedDescription.trim())
    .sort((a, b) => identityPriority(a) - identityPriority(b) || a.title.localeCompare(b.title, "zh-CN"))
    .map((row, index) => ({
      bookId: row.id,
      title: row.title,
      author: row.author,
      publisher: row.publisher,
      isbn: normalizeIsbn(row.isbn),
      batchNo: Math.floor(index / 100) + 1,
      priority: identityPriority(row),
      status: "queued",
      attempts: 0,
      queriedSources: [],
      nextRetryAt: null,
      lastErrorCode: "",
      updatedAt: new Date(0).toISOString(),
    }));
}
```

- [ ] **Step 5: 实现原子检查点**

`saveJsonlAtomically(path, rows)` 必须先写 `${path}.tmp`，完成后 `rename` 覆盖正式文件；初始化命令拒绝覆盖已有终态任务，除非显式传入 `--reset-local-state`。

- [ ] **Step 6: 运行测试**

Run: `cd backend && node --test --import tsx ../tools/book-description-collection/taskPool.test.ts`

Expected: PASS，任务数 2,404，批次数 25，单批不超过 100。

### Task 2: 确定性信源适配器

**Files:**
- Create: `tools/book-description-collection/sources/googleBooks.ts`
- Create: `tools/book-description-collection/sources/openLibrary.ts`
- Create: `tools/book-description-collection/sources/sourceRunner.ts`
- Create: `tools/book-description-collection/sources/sources.test.ts`

**Interfaces:**
- Consumes: `CollectionTask`。
- Produces: 未仲裁的 `CollectionEvidence[]`；每条证据必须绑定单一来源记录，不跨版本混合字段。

- [ ] **Step 1: 写精确 ISBN 与版本隔离测试**

```ts
test("Open Library only accepts the exact ISBN edition", async () => {
  const evidence = await openLibrary.search(task({ isbn: "9787111111111" }), fixtureFetch("openlibrary-multi-edition.json"));
  assert.ok(evidence.every((item) => normalizeIsbn(item.candidateIsbn) === "9787111111111"));
  assert.ok(evidence.every((item) => item.sourceUrl.includes("openlibrary.org")));
});

test("Google Books keeps fields from one volume record", async () => {
  const evidence = await googleBooks.search(task({ isbn: "9787111111111" }), fixtureFetch("google-multiple-volumes.json"));
  assert.equal(new Set(evidence.map((item) => item.sourceRecordId)).size, evidence.length);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && node --test --import tsx ../tools/book-description-collection/sources/sources.test.ts`

Expected: FAIL，两个 adapter 尚不存在。

- [ ] **Step 3: 实现 Google Books 查询顺序**

先查询 `q=isbn:<ISBN>`；无 ISBN 时查询 `intitle:"<TITLE>"+inauthor:"<AUTHOR>"`。每个 volume 产生独立证据，URL 使用 `https://books.google.com/books?id=<volumeId>`。HTTP 429 返回 `RATE_LIMITED`，不得转换为无匹配。

- [ ] **Step 4: 实现 Open Library 精确版本查询**

有 ISBN 时只读取 `/api/books?bibkeys=ISBN:<ISBN>&jscmd=data&format=json` 中对应键。标题回退 `/search.json` 只能提供发现线索；未解析到精确 edition 前不得把搜索聚合的出版社、年份、封面或简介标成 A/B 级版本证据。

- [ ] **Step 5: 实现分信源失败隔离**

```ts
export async function runSources(task: CollectionTask, adapters: SourceAdapter[]) {
  const settled = await Promise.allSettled(adapters.map((adapter) => adapter.search(task)));
  return {
    evidence: settled.flatMap((result) => result.status === "fulfilled" ? result.value : []),
    failures: settled.flatMap((result, index) => result.status === "rejected"
      ? [{ source: adapters[index].name, code: classifySourceError(result.reason) }]
      : []),
  };
}
```

- [ ] **Step 6: 运行测试**

Run: `cd backend && node --test --import tsx ../tools/book-description-collection/sources/sources.test.ts`

Expected: PASS；限流、网络错误、无匹配分开分类；任一 adapter 失败不丢弃其他 adapter 结果。

### Task 3: 身份仲裁与简介质量门禁

**Files:**
- Create: `tools/book-description-collection/resolver.ts`
- Create: `tools/book-description-collection/descriptionQuality.ts`
- Create: `tools/book-description-collection/resolver.test.ts`

**Interfaces:**
- Consumes: 单本书的 `CollectionEvidence[]`。
- Produces: `CollectionDecision`，包含唯一终态、采纳文本、主辅信源和拒绝原因。

- [ ] **Step 1: 写身份和内容门禁失败测试**

覆盖 ISBN-10/13 等价、同名不同作者、不同译本冲突、单 B 信源、双 B 一致、A 信源、49/50 字边界、字段拼接、目录、评论、促销文案和跨书重复。

```ts
test("accepts an exact ISBN description from an A-tier source", () => {
  const decision = resolve(taskWithIsbn, [evidence({ sourceTier: "A", identityLevel: "A", cleanedDescription: narrative(50) })]);
  assert.equal(decision.status, "已采纳");
});

test("sends a single B source to manual review", () => {
  const decision = resolve(taskWithIsbn, [evidence({ sourceTier: "B", identityLevel: "A", cleanedDescription: narrative(80) })]);
  assert.equal(decision.status, "待人工复核");
});

test("never accepts a field-template description", () => {
  const decision = resolve(taskWithIsbn, [evidence({ sourceTier: "A", identityLevel: "A", cleanedDescription: stitchedTemplate })]);
  assert.notEqual(decision.status, "已采纳");
  assert.ok(decision.rejectionCodes.includes("TEMPLATE_DESCRIPTION"));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && node --test --import tsx ../tools/book-description-collection/resolver.test.ts`

Expected: FAIL，resolver 尚不存在。

- [ ] **Step 3: 实现内容规范化与拒绝码**

规范化只去 HTML、导航、营销尾注和空白。拒绝码固定为：`TOO_SHORT`、`TEMPLATE_DESCRIPTION`、`TABLE_OF_CONTENTS`、`AUTHOR_BIO`、`REVIEW_TEXT`、`PROMOTIONAL_TEXT`、`CROSS_BOOK_DUPLICATE`、`IDENTITY_CONFLICT`、`SOURCE_URL_MISSING`。

- [ ] **Step 4: 实现自动采纳真值表**

```ts
function mayAutoAccept(identity: IdentityLevel, evidence: CollectionEvidence[]): boolean {
  if (identity === "C") return false;
  const valid = evidence.filter((item) => item.rejectionCodes.length === 0 && item.sourceUrl);
  if (valid.some((item) => item.sourceTier === "A")) return true;
  const independentB = dedupeBySource(valid.filter((item) => item.sourceTier === "B"));
  return independentB.length >= 2 && descriptionsAgree(independentB);
}
```

- [ ] **Step 5: 运行测试**

Run: `cd backend && node --test --import tsx ../tools/book-description-collection/resolver.test.ts`

Expected: PASS；C 级自动采纳数为 0，跨书重复自动采纳数为 0。

### Task 4: 可恢复批次运行器

**Files:**
- Create: `tools/book-description-collection/batchRunner.ts`
- Create: `tools/book-description-collection/batchRunner.test.ts`
- Create: `tools/book-description-collection/cli/run-batch.ts`

**Interfaces:**
- Consumes: `tasks.jsonl`、已有 `evidence.jsonl`、`--batch <1..25>`。
- Produces: 更新后的任务和证据检查点、`batch-XX-summary.json`。

- [ ] **Step 1: 写恢复、终态和限流测试**

```ts
test("never reruns terminal tasks after restart", async () => {
  const calls = await runBatch(stateWithTerminalTasks, adapters);
  assert.deepEqual(calls.bookIds, ["queued-book"]);
});

test("rate limiting one source preserves other evidence and retry time", async () => {
  const result = await runOne(task, [rateLimitedGoogle, successfulOpenLibrary]);
  assert.equal(result.evidence.length, 1);
  assert.ok(result.task.nextRetryAt);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && node --test --import tsx ../tools/book-description-collection/batchRunner.test.ts`

Expected: FAIL，batch runner 尚不存在。

- [ ] **Step 3: 实现单批上限和原子保存**

CLI 必须拒绝无 `--batch` 参数、范围外批次和超过 100 个非终态任务的批次。每处理一本书后原子保存任务与证据，避免 100 本结束前崩溃丢失整批。

- [ ] **Step 4: 实现退避与重试上限**

限流/网络退避依次为 15 分钟、1 小时、6 小时、24 小时；每信源最多 4 次。永久无匹配不立即重试。所有规定信源达到终止条件后，根据已有证据进入 `待人工复核` 或 `已穷尽信源`。

- [ ] **Step 5: 运行测试**

Run: `cd backend && node --test --import tsx ../tools/book-description-collection/batchRunner.test.ts`

Expected: PASS；重复运行同一完成批次网络调用为 0。

### Task 5: Excel 检查点与累计报告

**Files:**
- Create: `tools/book-description-collection/exportWorkbook.mjs`
- Create: `tools/book-description-collection/exportWorkbook.test.mjs`
- Create: `tools/book-description-collection/cli/export.mjs`
- Create: `tools/book-description-collection/cli/verify-final.ts`

**Interfaces:**
- Consumes: 原清洗版 Excel、`tasks.jsonl`、`evidence.jsonl`。
- Produces: `图书简介收集进度-批次XX.xlsx`、每 500 本累计报告和最终 Excel。

- [ ] **Step 1: 写工作簿映射测试**

检查新增 13 个收集字段、原始简介不变、证据一行一候选、终态统计与任务文件一致，以及 ISBN 作为文本保存。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tools/book-description-collection/exportWorkbook.test.mjs`

Expected: FAIL，exporter 尚不存在。

- [ ] **Step 3: 使用 artifact-tool 实现导出**

“图书总表”增加规格定义的收集字段；“信源证据”按 `CollectionEvidence` 展开；“导出概览”展示三种终态、覆盖率、信源成功率、冲突率、下一待处理批次和生成时间。不得覆盖清洗前简介、原始简介或清洗原因。

- [ ] **Step 4: 实现一致性断言**

导出前必须断言任务数 2,404、bookId 唯一、终态互斥、已采纳均有 URL、已穷尽均有已查询信源和原因、批次总和一致；任一断言失败不得生成“最终”文件。

- [ ] **Step 5: 运行测试并渲染**

Run: `node --test tools/book-description-collection/exportWorkbook.test.mjs`

Expected: PASS；公式错误扫描为 0；所有工作表均能渲染且关键列可读。

### Task 6: 20 本试运行门禁

**Files:**
- Create: `outputs/book-description-collection/pilot/pilot-report.md`
- Create: `outputs/book-description-collection/pilot/pilot-results.xlsx`

**Interfaces:**
- Consumes: 前四个优先级各 5 本，共 20 本。
- Produces: 信源可用率、身份准确率、内容合格率、限流证据和规则修正结论。

- [ ] **Step 1: 运行 20 本只读试采集**

Run: `cd backend && ../node_modules/.bin/tsx ../tools/book-description-collection/cli/run-batch.ts --pilot 20 --state ../outputs/book-description-collection/pilot`

Expected: 20 本均产生证据或明确失败分类；无生产写入调用。

- [ ] **Step 2: 人工核对全部 20 本身份**

逐本打开主信源 URL，检查 ISBN、书名、作者、出版社和版本。误匹配必须为 0；否则修正规则并重新执行 Task 3–6。

- [ ] **Step 3: 检查自动采纳内容**

自动采纳简介必须全部不少于 50 字、连贯、非模板、非目录、非评论、非促销且未跨书重复。

- [ ] **Step 4: 放行首个 100 本批次**

只有试运行误匹配为 0、无来源采纳为 0、模板简介为 0 时，才允许进入 Task 7。

### Task 7: 约 25 批全量收集

**Files:**
- Update: `outputs/book-description-collection/tasks.jsonl`
- Update: `outputs/book-description-collection/evidence.jsonl`
- Create: `outputs/book-description-collection/batches/batch-01..25/`
- Create: `outputs/book-description-collection/reports/progress-0500.md`
- Create: `outputs/book-description-collection/reports/progress-1000.md`
- Create: `outputs/book-description-collection/reports/progress-1500.md`
- Create: `outputs/book-description-collection/reports/progress-2000.md`
- Create: `outputs/book-description-collection/及阅图书简介全量收集结果.xlsx`

**Interfaces:**
- Consumes: 通过试运行门禁的 runner 和 2,404 条任务。
- Produces: 2,404 条终态、完整证据、批次快照和最终 Excel。

- [ ] **Step 1: 顺序执行批次**

首批运行：

```sh
cd backend
../node_modules/.bin/tsx ../tools/book-description-collection/cli/run-batch.ts --batch 1 --state ../outputs/book-description-collection
node ../tools/book-description-collection/cli/export.mjs --batch 1 --state ../outputs/book-description-collection
```

首批通过抽查门禁后，将两条命令中的批次号明确改为 `2`，随后按同一方式逐批递增至 `25`。前一批未通过抽查门禁时不得启动后一批，不允许使用无检查点的全自动循环一次跑完 25 批。

- [ ] **Step 2: 每批执行 20 本抽查**

随机但可复现地抽取 10 本 `已采纳`、5 本 `待人工复核`、5 本 `已穷尽信源`；不足某状态时全量检查该状态。抽查结果写入该批 `review.md`。

- [ ] **Step 3: 对确定性信源未解决项执行公开网页研究**

只处理仍为 `queued`、`retry_wait` 或缺少足够证据的任务。研究者必须写入相同 `CollectionEvidence` 字段，提供直接来源 URL，不得只提供搜索结果链接；C 级线索不能直接改变终态为 `已采纳`。

- [ ] **Step 4: 每 500 本生成累计报告**

报告必须列出已处理、三种终态、各信源成功率、限流率、身份冲突率、内容拒绝原因、重复检测和剩余任务。任何已采纳误匹配都使当前 500 本阶段门禁失败。

- [ ] **Step 5: 运行最终一致性校验**

Run: `cd backend && ../node_modules/.bin/tsx ../tools/book-description-collection/cli/verify-final.ts --state ../outputs/book-description-collection`

Expected:

```text
tasks=2404
terminal=2404
accepted+manual_review+exhausted=2404
accepted_without_source=0
template_descriptions=0
cross_book_duplicates=0
identity_c_auto_accepted=0
```

- [ ] **Step 6: 导出并视觉检查最终 Excel**

使用 artifact-tool 重新导入最终文件，扫描 `#REF!|#DIV/0!|#VALUE!|#NAME\?|#N/A`，渲染概览、总表、信源证据和批次报告。实际查看关键列、统计和长文本是否可读。

- [ ] **Step 7: 报告未验证项**

明确列出未用 Excel/WPS 打开、部分网页可能后续失效、`待人工复核` 与 `已穷尽信源` 不代表已有可发布简介，以及整个流程未修改线上数据库。
