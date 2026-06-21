import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "Pagination.tsx"), "utf8");
const mobilePagerBlock = source.match(/<div ref=\{sentinelRef\} className="xf-mobile-auto-pager"[\s\S]*?<\/div>/)?.[0] || "";

test("pagination supports mobile auto loading without page buttons", () => {
  assert.match(source, /mobileAutoLoad\?: boolean/, "pagination should expose a mobile auto-load mode");
  assert.match(source, /IntersectionObserver/, "mobile auto-load should use scroll visibility instead of a manual click");
  assert.match(source, /xf-desktop-pagination/, "manual pagination controls should be scoped to desktop");
  assert.match(source, /xf-mobile-auto-pager/, "mobile mode should render an auto-load sentinel");
  assert.match(source, /@media \(max-width: 768px\)[\s\S]*xf-desktop-pagination/, "desktop controls should be hidden on phone width");
  assert.ok(mobilePagerBlock, "mobile auto-load sentinel should exist");
  assert.doesNotMatch(mobilePagerBlock, /<button/, "mobile auto-load sentinel must not require a button click");
});

test("mobile auto loading is perceptible and throttled to one page at a time", () => {
  assert.match(source, /MOBILE_AUTO_LOAD_DELAY_MS = 650/, "mobile auto loading should delay briefly so the loading state is visible");
  assert.match(source, /const \[mobilePending, setMobilePending\] = useState\(false\)/, "pagination should own an internal pending state for fast local page slices");
  assert.match(source, /lastTriggeredPageRef/, "pagination should avoid repeated triggers for the same current page");
  assert.match(source, /window\.setTimeout\(\(\) => \{[\s\S]*onMobileLoadMore\(\);[\s\S]*MOBILE_AUTO_LOAD_DELAY_MS\)/, "mobile load more should run after the perceptible delay");
  assert.match(source, /rootMargin: "120px 0px"/, "mobile auto loading should trigger near the bottom, not far ahead of the user");
  assert.match(source, /正在加载下一页\.\.\./, "mobile users should see that the next page is loading");
});
