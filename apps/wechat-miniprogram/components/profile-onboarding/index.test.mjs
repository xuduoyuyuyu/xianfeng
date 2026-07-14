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
  assert.match(wxml, /\/assets\/tabbar\/xiaowanzi\.png/);
  assert.match(wxss, /position:\s*fixed/);
  assert.match(wxss, /background:\s*rgba\(/);
  assert.match(wxss, /border-radius:/);
});
