import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("settings page lets logged-in unbound users authorize phone binding", () => {
  const js = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const wxml = fs.readFileSync(new URL("./index.wxml", import.meta.url), "utf8");

  assert.match(wxml, /open-type="getPhoneNumber"/);
  assert.match(wxml, /bindgetphonenumber="bindPhone"/);
  assert.match(wxml, /hasMobile/);
  assert.match(js, /hasMobile/);
  assert.match(js, /bindPhone\(event\)/);
  assert.match(js, /\/api\/wechat-mini\/bind-phone/);
  assert.match(js, /const \{ request \} = require\("\.\.\/\.\.\/\.\.\/utils\/request"\)/);
  assert.match(js, /setLoginSession/);
});

test("settings page lets logged-out users authorize phone login in place", () => {
  const js = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const wxml = fs.readFileSync(new URL("./index.wxml", import.meta.url), "utf8");

  assert.match(wxml, /wx:else[\s\S]*open-type="getPhoneNumber"[\s\S]*bindgetphonenumber="loginWithPhone"/);
  assert.doesNotMatch(wxml, /wx:else[\s\S]*bindtap="goLogin"/);
  assert.match(js, /loginWithPhone\(event\)/);
  assert.match(js, /wx\.login\(/);
  assert.match(js, /phoneCode/);
  assert.match(js, /\/api\/wechat-mini\/login/);
  assert.match(js, /setLoginSession/);
  assert.doesNotMatch(js, /goLogin\(\)[\s\S]*wx\.navigateTo\(\{ url: "\/pages\/login\/index" \}\)/);
});

test("settings page wires font size and cache clearing to shared settings actions", () => {
  const js = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const wxml = fs.readFileSync(new URL("./index.wxml", import.meta.url), "utf8");

  assert.match(js, /applyFontSizeSetting/);
  assert.match(js, /clearAppCache/);
  assert.match(js, /fontSizeClass/);
  assert.match(js, /chooseFont\(event\)[\s\S]*applyFontSizeSetting\(this, value\)/);
  assert.match(js, /clearCache\(\)[\s\S]*clearAppCache\(\)/);
  assert.match(wxml, /class="xf-profile-shell xf-settings-panel \{\{fontSizeClass\}\}"/);
  assert.match(wxml, /bindtap="clearCache"/);
});
