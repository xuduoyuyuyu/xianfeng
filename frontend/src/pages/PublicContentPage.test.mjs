import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "PublicContentPage.tsx"), "utf8");

test("public content page uses native mini program chrome spacing when embedded", () => {
  assert.match(
    source,
    /html\.xf-mp-webview \.public-content-main \{[\s\S]*padding-top: var\(--xf-mp-nav-height, 88px\) !important;[\s\S]*padding-bottom: 0 !important;/,
    "mini program web-view should use the native topbar height and remove web bottom padding"
  );
  assert.match(
    source,
    /html\.xf-mp-webview \.public-content-frame \{[\s\S]*min-height: calc\(100vh - var\(--xf-mp-nav-height, 88px\) - var\(--xf-mp-tabbar-height, 64px\) - 112px\) !important;/,
    "embedded public-content iframe should fit between native topbar and tabbar"
  );
  assert.match(
    source,
    /className=\{`public-content-main relative z-10/,
    "public content main wrapper should expose the mini-program spacing hook"
  );
  assert.match(
    source,
    /className="public-content-frame h-full/,
    "public content iframe should expose the mini-program frame hook"
  );
});
