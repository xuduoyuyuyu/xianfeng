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

test("materials page keeps styled layout in mini program web-view without relying on Tailwind utilities", () => {
  assert.match(source, /xf-materials-page/);
  assert.match(source, /\.xf-materials-page/);
  assert.match(source, /\.materials-mobile-main/);
  assert.match(source, /\.materials-mobile-hero/);
  assert.match(source, /\.materials-mobile-filter/);
  assert.match(source, /\.materials-filter-chip/);
  assert.match(source, /\.materials-mobile-grid > article/);
  assert.match(source, /html\.xf-mp-webview \.materials-mobile-main/);
  assert.match(source, /html\.xf-mp-webview \.materials-mobile-main \{[\s\S]*padding-top: var\(--xf-mp-nav-height, 88px\) !important;[\s\S]*padding-bottom: 0 !important;/);
  assert.match(source, /\.materials-mobile-label\s*\{[\s\S]*flex: 0 0 auto !important;[\s\S]*width: auto !important;[\s\S]*line-height: 1\.2 !important;/, "mobile filter labels should not keep the desktop 72px flex-basis as vertical height");
  assert.match(source, /md\\\\:flex-row/);
  assert.match(source, /border-\\\\\[\\\\#5e17eb\\\\\]/);
});

test("materials page copies resource links inside mini program web-view", () => {
  assert.match(source, /import \{ isMiniProgramWebView \} from "\.\.\/utils\/mpAuthBridge";/);
  assert.match(source, /const miniProgramWebView = isMiniProgramWebView\(\)/);
  assert.match(source, /async function copyMaterialLink\(url: string\)/);
  assert.match(source, /navigator\.clipboard\?\.writeText/);
  assert.match(source, /document\.execCommand\("copy"\)/);
  assert.match(source, /if \(miniProgramWebView\) \{/);
  assert.match(source, /\{miniProgramWebView \? "复制链接" : "打开资料"\}/);
  assert.match(source, /\{miniProgramWebView \? "content_copy" : "open_in_new"\}/);
  assert.match(source, /copyMaterialLink\(item\.fileUrl \|\| ""\)/);
});
