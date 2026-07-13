# 图书拼接简介清洗与 Excel 重建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 直接读取线上 2,779 本合并图书，清空字段模板拼接简介，并生成保留原始值、清洗结果和原因的本地 Excel。

**Architecture:** 使用一个纯函数模块识别模板特征并返回清洗决定，再由一次性 Excel builder 调用线上 `/api/books`、生成清洗列与概览统计。Excel 使用 `@oai/artifact-tool` 创建；线上数据库和接口只读。

**Tech Stack:** Node.js、Node test runner、`@oai/artifact-tool`、线上 JSON API

## Global Constraints

- 只生成本地 Excel，不写入 MongoDB，不调用线上编辑接口。
- 至少命中两个不同模板特征才移除简介。
- 移除时清洗后简介直接置空，不截取、不改写、不生成替代内容。
- 原始线上响应必须保留在“图书原始数据”工作表。
- 最终核对：原始非空简介数 = 移除拼接简介数 + 清洗后有效简介数。

---

### Task 1: 模板简介判定器

**Files:**
- Create: `/Users/xuduoyu/.codex/visualizations/2026/07/13/019f5be2-1780-7bc0-9069-36367d1731d9/outputs/book_export_20260714/description_cleaner.mjs`
- Test: `/Users/xuduoyu/.codex/visualizations/2026/07/13/019f5be2-1780-7bc0-9069-36367d1731d9/outputs/book_export_20260714/description_cleaner.test.mjs`

**Interfaces:**
- Consumes: `description: unknown`
- Produces: `cleanBookDescription(description): { originalDescription: string; cleanedDescription: string; status: "保留" | "移除拼接简介" | "原本为空"; reasons: string[] }`

- [ ] **Step 1: 写失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { cleanBookDescription } from "./description_cleaner.mjs";

test("removes a field-template description", () => {
  const description = "《七彩下雨天》；作者/著作者：[韩]金静华 著；出版社：二十一世纪出版社集团；适用/关联范围：4-5岁；现有标签：生活故事。\n标签：生活故事；想象创意";
  const result = cleanBookDescription(description);
  assert.equal(result.cleanedDescription, "");
  assert.equal(result.status, "移除拼接简介");
  assert.ok(result.reasons.length >= 2);
});

test("keeps a coherent narrative", () => {
  const description = "一个害怕黑夜的孩子，在朋友陪伴下走进森林，逐渐发现黑暗中也藏着温柔和勇气。";
  assert.equal(cleanBookDescription(description).status, "保留");
});

test("keeps a single marker to avoid false positives", () => {
  const description = "出版社：本书通过一段连续故事讨论成长与告别。";
  assert.equal(cleanBookDescription(description).status, "保留");
});

test("marks empty descriptions", () => {
  assert.equal(cleanBookDescription(" ").status, "原本为空");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test /Users/xuduoyu/.codex/visualizations/2026/07/13/019f5be2-1780-7bc0-9069-36367d1731d9/outputs/book_export_20260714/description_cleaner.test.mjs`

Expected: FAIL，提示无法加载 `description_cleaner.mjs`。

- [ ] **Step 3: 实现最小判定器**

```js
const TEMPLATE_FEATURES = [
  ["作者/著作者：", /作者\s*\/\s*著作者\s*[：:]/],
  ["出版社：", /出版社\s*[：:]/],
  ["适用/关联范围：", /适用\s*\/\s*关联范围\s*[：:]/],
  ["现有标签：", /现有标签\s*[：:]/],
  ["标签：", /(?:^|\n)\s*标签\s*[：:]/m],
];

export function cleanBookDescription(description) {
  const originalDescription = String(description || "").trim();
  if (!originalDescription) return { originalDescription, cleanedDescription: "", status: "原本为空", reasons: [] };
  const reasons = TEMPLATE_FEATURES.filter(([, pattern]) => pattern.test(originalDescription)).map(([label]) => label);
  if (reasons.length >= 2) return { originalDescription, cleanedDescription: "", status: "移除拼接简介", reasons };
  return { originalDescription, cleanedDescription: originalDescription, status: "保留", reasons: [] };
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test /Users/xuduoyu/.codex/visualizations/2026/07/13/019f5be2-1780-7bc0-9069-36367d1731d9/outputs/book_export_20260714/description_cleaner.test.mjs`

Expected: 4 tests passed，0 failed。

### Task 2: 重建清洗版 Excel

**Files:**
- Modify: `/Users/xuduoyu/.codex/visualizations/2026/07/13/019f5be2-1780-7bc0-9069-36367d1731d9/outputs/book_export_20260714/build_workbook.mjs`
- Create: `/Users/xuduoyu/.codex/visualizations/2026/07/13/019f5be2-1780-7bc0-9069-36367d1731d9/outputs/book_export_20260714/及阅本地图书清洗版_20260714.xlsx`

**Interfaces:**
- Consumes: `cleanBookDescription`、`https://xianfeng.xinzhi.info/api/books`
- Produces: 7-sheet workbook，其中“图书总表”提供原始简介、清洗后简介、状态和原因。

- [ ] **Step 1: 将清洗器接入 builder**

```js
import { cleanBookDescription } from "./description_cleaner.mjs";

const cleanedBooks = remoteBooks.map((book) => ({ book, cleaning: cleanBookDescription(book.description) }));
const removedCount = cleanedBooks.filter(({ cleaning }) => cleaning.status === "移除拼接简介").length;
const cleanedValidCount = cleanedBooks.filter(({ cleaning }) => cleaning.cleanedDescription).length;
```

构建“图书总表”时，`简介`与`清洗后简介`都写入 `cleaning.cleanedDescription`，新增 `原始简介`、`简介清洗状态`和 `简介清洗原因`。原始数据表继续写入未修改的 `remoteBooks`。

- [ ] **Step 2: 更新概览统计和说明**

概览页写入 `remoteBooks.length`、原始非空数、`removedCount`、`cleanedValidCount`、`remoteBooks.length - cleanedValidCount`，并明确“只清洗 Excel，未修改线上数据”。

- [ ] **Step 3: 使用 bundled Node 和 artifact-tool 导出**

Run: `/Users/xuduoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node build_workbook.mjs`

Expected: 输出 `及阅本地图书清洗版_20260714.xlsx`，图书数为 2,779。

### Task 3: 数据与视觉验收

**Files:**
- Verify: `/Users/xuduoyu/.codex/visualizations/2026/07/13/019f5be2-1780-7bc0-9069-36367d1731d9/outputs/book_export_20260714/及阅本地图书清洗版_20260714.xlsx`

**Interfaces:**
- Consumes: Task 2 workbook
- Produces: 数量对账、示例抽查、公式错误扫描和全部工作表预览证据。

- [ ] **Step 1: 检查关键范围和数量恒等式**

用 `workbook.inspect` 检查概览和《七彩下雨天》所在行。必须满足：图书总数 2,779；示例状态为“移除拼接简介”；原始非空简介数等于移除数加清洗后有效简介数。

- [ ] **Step 2: 扫描公式错误**

用正则 `#REF!|#DIV/0!|#VALUE!|#NAME\?|#N/A` 检查工作簿。

Expected: 0 matches。

- [ ] **Step 3: 渲染并查看全部工作表**

渲染“导出概览”“图书总表”“图书原始数据”“图书详情”“补全任务”“信源证据”“补全运行”的前 20 行，确认标题、简介、统计与状态列可读。

- [ ] **Step 4: 检查文件和 Git 工作区**

Run: `git diff --check`

Expected: 无 whitespace errors。Excel 只保存在对话输出目录，不提交到 Git。
