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

test("program list no longer carries profile half-panel web-view routing", () => {
  assert.doesNotMatch(source, /profilePanelWebView/);
  assert.doesNotMatch(source, /xf_panel/);
  assert.doesNotMatch(source, /headless=\{profilePanelWebView\}/);
  assert.doesNotMatch(source, /is-profile-panel-webview/);
});

test("program list keeps a compact top offset when embedded in the mini program", () => {
  assert.match(source, /html\.xf-mp-webview \.xf-program-main/);
  assert.match(source, /padding-top: 12px !important;/);
  assert.match(source, /padding-bottom: 0 !important;/);
});

test("program list keeps cards close to the phone edge inside mini program web-view", () => {
  assert.match(source, /html\.xf-mp-webview \.xf-program-main\s*\{[\s\S]*?--xf-mp-outer-gutter: clamp\(8px, 2\.4vw, 10px\);/);
  assert.match(source, /html\.xf-mp-webview \.xf-program-main\s*\{[\s\S]*?--xf-mp-inner-gutter: clamp\(3px, 1vw, 4px\);/);
  assert.match(source, /html\.xf-mp-webview \.xf-program-main\s*\{[\s\S]*?width: calc\(100% - var\(--xf-mp-outer-gutter\)\) !important;/);
  assert.match(source, /html\.xf-mp-webview \.xf-program-main\s*\{[\s\S]*?padding-left: var\(--xf-mp-inner-gutter\) !important;/);
  assert.match(source, /@media \(max-width: 768px\)[\s\S]*?html\.xf-mp-webview \.xf-program-main\s*\{[\s\S]*?padding-right: var\(--xf-mp-inner-gutter\) !important;/);
});

test("program list keeps web card typography inside mini program web-view", () => {
  assert.match(source, /html\.xf-mp-webview \.xf-program-list-page\s*\{[\s\S]*?-webkit-text-size-adjust: 100%;[\s\S]*?text-size-adjust: 100%;/);
  assert.match(source, /html\.xf-mp-webview \.xf-program-pill\s*\{[\s\S]*?font-size: 10px !important;[\s\S]*?font-weight: 800 !important;/);
  assert.match(source, /html\.xf-mp-webview \.xf-program-date\s*\{[\s\S]*?font-size: 12px !important;[\s\S]*?font-weight: 500 !important;/);
  assert.match(source, /html\.xf-mp-webview \.xf-program-card-title\s*\{[\s\S]*?font-size: 20px !important;[\s\S]*?font-weight: 400 !important;[\s\S]*?line-height: 1\.2 !important;/);
  assert.match(source, /html\.xf-mp-webview \.xf-program-desc\s*\{[\s\S]*?font-size: 14px !important;[\s\S]*?font-weight: 400 !important;[\s\S]*?line-height: 1\.85 !important;/);
  assert.match(source, /html\.xf-mp-webview \.xf-program-tag\s*\{[\s\S]*?font-size: 11px !important;[\s\S]*?font-weight: 800 !important;/);
});
