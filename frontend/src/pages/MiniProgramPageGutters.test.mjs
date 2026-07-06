import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const files = {
  programs: fs.readFileSync(new URL("./ProgramListPage.tsx", import.meta.url), "utf8"),
  reading: fs.readFileSync(new URL("./BooksPage.tsx", import.meta.url), "utf8"),
  materials: fs.readFileSync(new URL("./MaterialsPage.tsx", import.meta.url), "utf8"),
  topics: fs.readFileSync(new URL("./TopicHubPage.tsx", import.meta.url), "utf8"),
};

test("mini program tab pages use responsive narrow gutters across phone widths", () => {
  for (const [name, source] of Object.entries(files).filter(([name]) => ["programs", "reading", "materials"].includes(name))) {
    assert.match(source, /--xf-mp-outer-gutter:\s*clamp\(8px,\s*2\.4vw,\s*10px\);/, `${name} should use the tighter program-page outer gutter`);
    assert.match(source, /--xf-mp-inner-gutter:\s*clamp\(3px,\s*1vw,\s*4px\);/, `${name} should use the tighter program-page inner gutter`);
    assert.match(source, /width:\s*calc\(100% - var\(--xf-mp-outer-gutter\)\) !important;/, `${name} should use the responsive outer gutter`);
    assert.match(source, /padding-left:\s*var\(--xf-mp-inner-gutter\) !important;/, `${name} should reduce left padding in mini program mode`);
    assert.match(source, /padding-right:\s*var\(--xf-mp-inner-gutter\) !important;/, `${name} should reduce right padding in mini program mode`);
  }
});

test("topic hub inner list follows the same mini program gutter rhythm", () => {
  assert.match(files.topics, /html\.xf-mp-webview \.topic-hub-list\s*\{[\s\S]*padding-left:\s*var\(--xf-mp-inner-gutter\) !important;/);
  assert.match(files.topics, /html\.xf-mp-webview \.topic-hub-list\s*\{[\s\S]*padding-right:\s*var\(--xf-mp-inner-gutter\) !important;/);
});
