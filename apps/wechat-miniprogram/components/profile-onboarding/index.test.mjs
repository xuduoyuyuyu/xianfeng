import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const componentPath = require.resolve("./index.js");
const requestPath = require.resolve("../../utils/request.js");

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

test("first page entry does not automatically open the profile dialog", () => {
  const js = fs.readFileSync(path.join(dir, "index.js"), "utf8");

  assert.match(js, /pageLifetimes:\s*\{\s*show\(\)\s*\{\s*void this\.reconcileAfterLogin\(\);\s*\},\s*\}/);
  assert.doesNotMatch(js, /pageLifetimes:\s*\{[\s\S]*?show\(\)\s*\{[\s\S]*?this\.refresh\(\)/);
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
  assert.match(wxml, /请选择年级/);
  assert.doesNotMatch(wxml, /请选择学段和年级/);
  assert.match(js, /updateCity\(event\)/);
  assert.match(js, /updateRegionInput\(event\)/);
  assert.match(js, /changeEducationColumn\(event\)/);
  assert.match(js, /educationRange: \[STAGES, gradesFor\(STAGES\[0\], ""\)\]/);
});

test("profile dialog asks before creating a different child after login", () => {
  const wxml = fs.readFileSync(path.join(dir, "index.wxml"), "utf8");

  assert.match(wxml, /发现已有孩子档案/);
  assert.match(wxml, /建立新档案/);
  assert.match(wxml, /丢弃本次填写/);
  assert.match(wxml, /bindtap="createPendingChild"/);
  assert.match(wxml, /bindtap="discardPendingProfile"/);
});

test("login reconciliation reads remote children before showing a conflict", async () => {
  const originalComponent = global.Component;
  const originalWx = global.wx;
  const calls = [];
  const storage = {
    xf_token: "signed-in",
    xf_profile_onboarding_pending_v1: { city: "上海", region: "长宁区", grade: "小学一年级" },
  };
  let definition;
  require.cache[requestPath] = { exports: { request: async (options) => {
    calls.push(options);
    return {
      childProfiles: [{ id: "old", displayName: "大宝", city: "上海", region: "徐汇区", grade: "小学三年级" }],
    };
  } } };
  global.Component = (value) => { definition = value; };
  global.wx = {
    getStorageSync(key) { return storage[key]; },
    setStorageSync(key, value) { storage[key] = value; },
    removeStorageSync(key) { delete storage[key]; },
  };

  try {
    delete require.cache[componentPath];
    require(componentPath);
    const events = [];
    const context = {
      data: { ...definition.data },
      setData(patch) { Object.assign(this.data, patch); },
      triggerEvent(name, detail) { events.push({ name, detail }); },
      ...definition.methods,
    };

    await context.reconcileAfterLogin();

    assert.deepEqual(calls, [{ url: "/api/users/me/xiaowanzi-sync" }]);
    assert.equal(context.data.conflictVisible, true);
    assert.equal(events.length, 0);
    assert.equal(storage.xf_child_profiles[0].displayName, "大宝");

    context.closeConflict();
    assert.deepEqual(storage.xf_profile_onboarding_pending_v1, {
      city: "上海",
      region: "长宁区",
      grade: "小学一年级",
    });

    context.discardPendingProfile();
    assert.equal(storage.xf_profile_onboarding_pending_v1, undefined);
    assert.equal(storage.xf_child_profiles[0].displayName, "大宝");
    assert.equal(events[0].name, "saved");
    assert.equal(events[0].detail.reason, "discarded");
  } finally {
    delete require.cache[componentPath];
    delete require.cache[requestPath];
    global.Component = originalComponent;
    global.wx = originalWx;
  }
});
