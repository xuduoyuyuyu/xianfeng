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
    assert.match(source.wxml, /<profile-onboarding id="profileOnboarding" bind:saved="onProfileOnboardingSaved"\s*\/>/, name);
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

test("profile save clears the visible list cache and reloads its first page", () => {
  const programs = page("programs").js;
  const reading = page("reading").js;
  const materials = page("materials").js;
  const topics = page("topics").js;

  assert.match(programs, /onProfileOnboardingSaved\(\)[\s\S]*removeStorageSync\(PROGRAM_CACHE_KEY\)[\s\S]*loadPrograms\(\{ showRefreshing: true \}\)/);
  assert.match(reading, /onProfileOnboardingSaved\(\)[\s\S]*clearReadingProfileCaches\(\)[\s\S]*loadBooks\(\{ showRefreshing: true \}\)/);
  assert.match(materials, /onProfileOnboardingSaved\(\)[\s\S]*removeStorageSync\(MATERIAL_CACHE_KEY\)[\s\S]*loadMaterials\(\{ showRefreshing: true \}\)/);
  assert.match(topics, /onProfileOnboardingSaved\(\)[\s\S]*removeStorageSync\(TOPIC_CACHE_KEY\)[\s\S]*loadTopics\(\{ showRefreshing: true \}\)/);
});
