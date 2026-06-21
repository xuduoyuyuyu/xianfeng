import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPage(name) {
  return readFileSync(resolve(__dirname, name), "utf8");
}

test("public mobile list pages use auto pagination instead of manual paging", () => {
  for (const fileName of ["ProgramListPage.tsx", "ExpertsPage.tsx", "BooksPage.tsx", "MaterialsPage.tsx", "TopicHubPage.tsx"]) {
    const source = readPage(fileName);
    assert.match(source, /mobileAutoLoad/, `${fileName} should enable mobile auto-loading on Pagination`);
    assert.match(source, /mobileHasMore/, `${fileName} should tell the mobile sentinel when more pages exist`);
    assert.match(source, /onMobileLoadMore/, `${fileName} should load the next page automatically on mobile`);
  }
});

test("mobile list pages append or expand content when loading later pages", () => {
  assert.match(readPage("ProgramListPage.tsx"), /setPrograms\(\(prev\) => \(isMobilePager && currentPage > 1 \? mergeById\(prev, data\) : data\)\)/, "program list should append server pages on mobile");
  assert.match(readPage("ExpertsPage.tsx"), /setGuests\(\(prev\) => \(isMobilePager && safePage > 1 \? mergeById\(prev, list\) : list\)\)/, "expert list should append server pages on mobile");
  assert.match(readPage("BooksPage.tsx"), /const visibleBookLimit = safePage \* PAGE_SIZE;/, "book list should expand the visible slice on mobile");
  assert.match(readPage("MaterialsPage.tsx"), /const visibleMaterialLimit = safePage \* PAGE_SIZE;/, "materials list should expand the visible slice on mobile");
  assert.match(readPage("TopicHubPage.tsx"), /return isMobilePager && pageNum > 1 \? mergeBySlug\(prev, cleaned\) : \[\.\.\.stickyTopics, \.\.\.cleaned\];/, "topic hub should append server pages on mobile");
});
