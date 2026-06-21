import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPage(fileName) {
  return readFileSync(resolve(__dirname, fileName), "utf8");
}

test("books page uses smaller filter chips on mobile only", () => {
  const source = readPage("BooksPage.tsx");
  assert.match(source, /\.books-filter-chip \{ padding: 5px 10px !important;/);
  assert.match(source, /\.books-filter-chip \{[\s\S]*font-size: 11px !important;/);
  assert.match(source, /className=\{`books-filter-chip rounded-full border/);
});

test("materials page uses smaller filter chips on mobile only", () => {
  const source = readPage("MaterialsPage.tsx");
  assert.match(source, /\.materials-filter-chip \{ padding: 5px 10px !important;/);
  assert.match(source, /\.materials-filter-chip \{[\s\S]*font-size: 11px !important;/);
  assert.match(source, /className=\{`materials-filter-chip rounded-full border/);
});
