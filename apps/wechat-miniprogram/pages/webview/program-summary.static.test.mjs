import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "index.js"), "utf8");

test("native program detail prefers generated summary prose and sanitizes legacy fallbacks", () => {
  assert.match(source, /summary\.body,\s*summary\.description,\s*item\.description/);
  assert.match(source, /sanitizeProgramSummaryBody\(firstText\(/);
  assert.match(source, /text\.indexOf\("本期嘉宾"\)/);
  assert.match(source, /text\.search\(\/\\b\\d\{1,2\}:\\d\{2\}/);
});
