import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPage(fileName) {
  return readFileSync(resolve(__dirname, fileName), "utf8");
}

test("books page uses 30 percent larger filter chips on mobile", () => {
  const source = readPage("BooksPage.tsx");
  assert.match(source, /\.books-filter-chip \{ min-height: 32px !important; padding: 6\.5px 13px !important;/);
  assert.match(source, /\.books-filter-chip \{[\s\S]*font-size: 14\.3px !important;/);
  assert.match(source, /className=\{`books-filter-chip rounded-full border/);
});

test("books page keeps desktop filter chips larger than the mobile fallback", () => {
  const source = readPage("BooksPage.tsx");
  assert.match(source, /\.xf-books-page \.books-filter-chip \{[\s\S]*min-height: 42px;[\s\S]*padding: 9px 18px;[\s\S]*font-size: 15px;[\s\S]*font-weight: 400 !important;/);
  assert.match(source, /@media \(max-width: 768px\) \{[\s\S]*\.xf-books-page \.books-filter-chip \{ min-height: 32px !important; padding: 6\.5px 13px !important; font-size: 14\.3px !important; font-weight: 400 !important;/);
});

test("materials page uses 30 percent larger filter chips on mobile", () => {
  const source = readPage("MaterialsPage.tsx");
  assert.match(source, /\.materials-filter-chip \{ min-height: 32px !important; padding: 6\.5px 13px !important;/);
  assert.match(source, /\.materials-filter-chip \{[\s\S]*font-size: 14\.3px !important;/);
  assert.match(source, /className=\{`materials-filter-chip rounded-full border/);
});

test("materials page keeps desktop filter chips larger than the mobile fallback", () => {
  const source = readPage("MaterialsPage.tsx");
  assert.match(source, /\.xf-materials-page \.materials-filter-chip \{[\s\S]*min-height: 42px;[\s\S]*padding: 9px 18px;[\s\S]*font-size: 15px;[\s\S]*font-weight: 400 !important;/);
  assert.match(source, /@media \(max-width: 768px\) \{[\s\S]*\.xf-materials-page \.materials-filter-chip \{ min-height: 32px !important; padding: 6\.5px 13px !important; font-size: 14\.3px !important; font-weight: 400 !important;/);
});
