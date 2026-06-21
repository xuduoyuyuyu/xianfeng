import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "MaterialsPage.tsx"), "utf8");

test("materials page initializes and syncs keyword search from the q URL parameter", () => {
  assert.match(source, /useSearchParams/);
  assert.match(source, /searchParams\.get\("q"\)/);
  assert.match(source, /const \[keyword,\s*setKeyword\] = useState\(\(\) => initialKeyword\)/);
  assert.match(source, /function updateKeyword\(nextKeyword: string\)/);
  assert.match(source, /next\.set\("q",\s*clean\)/);
  assert.match(source, /next\.delete\("q"\)/);
  assert.match(source, /searchValue=\{keyword\}/);
  assert.match(source, /onSearchChange=\{updateKeyword\}/);
});
