import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "WorthBuyDetailPage.tsx"), "utf8");

test("WorthBuy detail page reloads saved analysis by route query when history state is missing", () => {
  assert.match(source, /useEffect\(\(\) => \{/);
  assert.ok(source.includes("fetch(`/api/worthbuy/${encodeURIComponent(rawDisplayTitle)}?userId=${encodeURIComponent(userId)}`"));
  assert.match(source, /setLoadedResult\(normalizeWorthBuyResult\(item\.result \|\| \{\}, fetchedQuery\)/);
});
