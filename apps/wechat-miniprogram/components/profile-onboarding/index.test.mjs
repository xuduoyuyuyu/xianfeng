import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

test("profile dialog contains only the requested archive fields", () => {
  const wxml = fs.readFileSync(path.join(dir, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(dir, "index.js"), "utf8");

  assert.match(wxml, /城市/);
  assert.match(wxml, /区域/);
  assert.match(wxml, /学段/);
  assert.match(wxml, /年级/);
  assert.doesNotMatch(wxml, /getPhoneNumber|手机号|出生日期|孩子姓名/);
  assert.match(js, /dismissProfileOnboardingForSession/);
  assert.match(js, /saveProfileOnboardingDraft/);
  assert.match(js, /this\.triggerEvent\("saved"/);
});

test("profile dialog matches the reference card hierarchy", () => {
  const wxml = fs.readFileSync(path.join(dir, "index.wxml"), "utf8");
  const wxss = fs.readFileSync(path.join(dir, "index.wxss"), "utf8");

  assert.match(wxml, /xf-profile-onboarding-mask/);
  assert.match(wxml, /\/assets\/wel-avatar\/wizard\.png/);
  assert.match(wxss, /position:\s*fixed/);
  assert.match(wxss, /background:\s*rgba\(/);
  assert.match(wxss, /border-radius:/);
});

test("profile dialog reuses manual location fields and linked education picker", () => {
  const wxml = fs.readFileSync(path.join(dir, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(dir, "index.js"), "utf8");

  assert.equal((wxml.match(/mode="multiSelector"/g) || []).length, 1);
  assert.doesNotMatch(wxml, /mode="selector"/);
  assert.match(wxml, /<input[^>]*value="\{\{city\}\}"[^>]*bindinput="updateCity"/);
  assert.match(wxml, /wx:if="\{\{regionOptions\.length\}\}"[\s\S]*bindchange="chooseRegion"/);
  assert.match(wxml, /<input[^>]*wx:else[^>]*value="\{\{region\}\}"[^>]*bindinput="updateRegionInput"/);
  assert.match(wxml, /range="\{\{educationRange\}\}"[\s\S]*bindcolumnchange="changeEducationColumn"[\s\S]*bindchange="chooseEducation"/);
  assert.match(js, /updateCity\(event\)/);
  assert.match(js, /updateRegionInput\(event\)/);
  assert.match(js, /changeEducationColumn\(event\)/);
  assert.match(js, /educationRange: \[STAGES, gradesFor\(STAGES\[0\], ""\)\]/);
});
