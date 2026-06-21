import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./GlobalPublicNav.tsx", import.meta.url), "utf8");

test("mini program web-view hides the website mobile bottom tab", () => {
  assert.match(source, /function isMiniProgramWebView\(\)/);
  assert.match(source, /URLSearchParams\(window\.location\.search\)\.get\("xf_mp"\)\s*===\s*"1"/);
  assert.match(source, /compactMobile&&!embeddedLayer&&!headless&&!miniProgramWebView/);
  assert.match(source, /\{compactMobile&&!miniProgramWebView&&<MobileTab\/>\}/);
});
