import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function page(name) {
  const dir = path.join(root, name);
  return {
    js: fs.readFileSync(path.join(dir, "index.js"), "utf8"),
    wxml: fs.readFileSync(path.join(dir, "index.wxml"), "utf8"),
  };
}

test("the four main lists mount and refresh from profile onboarding", () => {
  for (const name of ["programs", "reading", "materials", "topics"]) {
    const source = page(name);
    assert.match(source.wxml, /<profile-onboarding bind:saved="onProfileOnboardingSaved"\s*\/>/, name);
    assert.match(source.js, /buildPersonalizationQuery/, name);
    assert.match(source.js, /onProfileOnboardingSaved\(\)/, name);
  }
});

test("ordinary list requests carry profile context without changing search or external books", () => {
  const programs = page("programs").js;
  const reading = page("reading").js;
  const materials = page("materials").js;
  const topics = page("topics").js;
  const preload = fs.readFileSync(path.join(root, "../utils/readingPreload.js"), "utf8");

  assert.match(programs, /appendProfileQuery\(`\/api\/programs\?page=/);
  assert.match(materials, /appendProfileQuery\("\/api\/learning-materials"\)/);
  assert.match(topics, /buildTopicListUrl[\s\S]*includeProfile/);
  assert.match(preload, /appendProfileQuery\(`\/api\/books\?current=/);
  assert.doesNotMatch(preload, /appendProfileQuery\([^\n]*\/api\/books\/external/);
  assert.doesNotMatch(topics, /appendProfileQuery\(searchUrl\)/);
});
