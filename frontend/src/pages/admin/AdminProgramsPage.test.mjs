import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "AdminProgramsPage.tsx"), "utf8");

test("admin programs page shows curated reading calibration report from enrichment output", () => {
  assert.match(
    source,
    /agentOutputs\?\.enrichment\?\.readingVerificationReport/,
    "admin programs page should read the enrichment reading verification report"
  );
  assert.match(
    source,
    /推荐阅读校准记录/,
    "admin programs page should label the verification section clearly"
  );
  assert.match(
    source,
    /verificationReport\.items\.map/,
    "admin programs page should render per-reading verification rows"
  );
});

test("admin programs page edits the show classification for each program", () => {
  assert.match(
    source,
    /programShow:\s*"xianfeng" \| "zhiji";/,
    "program form state should include a show classification"
  );
  assert.match(
    source,
    /programShow:\s*"xianfeng",/,
    "new programs should default to 家长先疯"
  );
  assert.match(
    source,
    /programShow:\s*form\.programShow/,
    "save payload should include the show classification"
  );
  assert.match(
    source,
    /programShow:\s*program\.programShow \|\| "xianfeng"/,
    "editing an existing program should load its show classification"
  );
  assert.match(
    source,
    />分类节目</,
    "program modal should label the classification control"
  );
  assert.match(
    source,
    /<option value="xianfeng">家长先疯<\/option>[\s\S]*<option value="zhiji">中年知己<\/option>/,
    "admin should offer both program shows"
  );
});

test("admin programs page keeps related label pills on one row", () => {
  assert.match(
    source,
    /<table className="w-full min-w-\[1280px\] text-left">/,
    "program admin table should keep enough horizontal room for fixed columns"
  );
  assert.match(
    source,
    /<th className="w-\[230px\] min-w-\[230px\] px-6 py-5 text-center">关联标签<\/th>/,
    "related label column should reserve enough width"
  );
  assert.match(
    source,
    /inline-flex max-w-full items-center justify-center gap-2 whitespace-nowrap/,
    "related label group should not wrap squeezed labels"
  );
  assert.match(
    source,
    /inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full/,
    "status pill in the related label column should stay on one line"
  );
  assert.match(
    source,
    /shrink-0 whitespace-nowrap text-\[11px\] text-stone-400/,
    "pending dictionary label should stay on one line"
  );
});
