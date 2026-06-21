import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ProgramListPage.tsx", import.meta.url), "utf8");

test("program list keeps styled layout in mini program web-view without relying on Tailwind utilities", () => {
  assert.match(source, /function isMiniProgramWebView\(\)/);
  assert.match(source, /xf-program-list-page/);
  assert.match(source, /xf-program-hero/);
  assert.match(source, /xf-program-card/);
  assert.match(source, /xf-program-cover/);
  assert.match(source, /xf-program-tag/);
});

test("program links preserve mini program web-view mode across internal navigation", () => {
  assert.match(source, /window\.sessionStorage\.getItem\("xf_mp_webview"\)/);
  assert.match(source, /\?xf_mp=1/);
});
