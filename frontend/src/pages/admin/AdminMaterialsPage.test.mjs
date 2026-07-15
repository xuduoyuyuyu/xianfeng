import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(__dirname, "AdminMaterialsPage.tsx"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../../services/api.ts"), "utf8");
const learningMaterialInterface =
  apiSource.match(/export interface LearningMaterial \{[\s\S]*?\n\}/)?.[0] || "";

test("admin materials save shows backend failure details", () => {
  assert.match(pageSource, /error\?\.response\?\.data\?\.message/);
  assert.match(pageSource, /error\?\.response\?\.data\?\.error\?\.message/);
  assert.doesNotMatch(pageSource, /alert\('保存失败，请重试'\)/);
  assert.match(pageSource, /alert\(message\)/);
});

test("admin materials save sends trimmed supported fields only", () => {
  assert.match(pageSource, /title: formData\.title\.trim\(\)/);
  assert.match(pageSource, /description: formData\.description\.trim\(\)/);
  assert.match(pageSource, /fileUrl: formData\.fileUrl\.trim\(\)/);
  assert.match(pageSource, /category: formData\.category\.trim\(\)/);
  assert.match(learningMaterialInterface, /status: 'draft' \| 'published';/);
  assert.doesNotMatch(learningMaterialInterface, /group-only/);
});

test("admin materials save prevents duplicate form submissions", () => {
  assert.match(pageSource, /const \[saving, setSaving\] = useState\(false\);/);
  assert.match(pageSource, /if \(saving\) return;/);
  assert.match(pageSource, /setSaving\(true\);/);
  assert.match(pageSource, /finally \{\s*setSaving\(false\);\s*\}/);
  assert.match(pageSource, /disabled=\{saving\}/);
  assert.match(pageSource, /\{saving \? '保存中\.\.\.' : '保存'\}/);
});

test("admin materials page exposes keyword search over loaded rows", () => {
  assert.match(pageSource, /const \[searchText, setSearchText\] = useState\(''\);/);
  assert.match(pageSource, /const filteredMaterials = useMemo\(\(\) => \{/);
  assert.match(pageSource, /material\.title/);
  assert.match(pageSource, /material\.description/);
  assert.match(pageSource, /material\.category/);
  assert.match(pageSource, /placeholder="搜索标题、描述、分类"/);
  assert.match(pageSource, /value=\{searchText\}/);
  assert.match(pageSource, /setSearchText\(e\.target\.value\)/);
  assert.match(pageSource, /pagedMaterials\.map/);
  assert.match(pageSource, /filteredMaterials\.length === 0/);
});

test("admin materials api accepts an optional search parameter", () => {
  assert.match(apiSource, /getMaterials: \(params\?: \{ status\?: string; search\?: string \}\)/);
  assert.match(apiSource, /\/admin\/learning-materials', \{ params \}/);
});

test("admin materials can bind one active guest", () => {
  assert.match(learningMaterialInterface, /guestId\?: string \| null;/);
  assert.match(pageSource, /const \[guests, setGuests\]/);
  assert.match(pageSource, /adminApi\.getGuests\(\{ status: 'active' \}\)/);
  assert.match(pageSource, /guestId: material\.guestId \|\| ''/);
  assert.match(pageSource, /guestId: formData\.guestId \|\| null/);
  assert.match(pageSource, /绑定嘉宾（可选）/);
  assert.match(pageSource, /guests\.map\(\(guest\) =>/);
});
