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

test("WorthBuy detail page uses native mini program chrome spacing when embedded", () => {
  assert.match(
    source,
    /html\.xf-mp-webview \.worthbuy-detail-content \{[\s\S]*padding-top: var\(--xf-mp-nav-height, 88px\) !important;[\s\S]*padding-bottom: 0 !important;/,
    "mini program web-view should use the native topbar height and remove web bottom padding"
  );
  assert.match(
    source,
    /html\.xf-mp-webview \.worthbuy-detail-spacer \{[\s\S]*display: none !important;/,
    "mini program web-view should hide the extra detail bottom spacer"
  );
  assert.match(
    source,
    /className="worthbuy-detail-content"/,
    "WorthBuy detail content wrappers should expose the mini-program spacing hook"
  );
  assert.match(
    source,
    /className="xf-web-detail-back"/,
    "WorthBuy detail web back controls should be hideable inside mini program web-view"
  );
});
