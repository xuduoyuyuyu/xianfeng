import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(path) {
  return fs.readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const identitySource = source("./searchAnalyticsIdentity.js");
const appSource = source("../app.js");
const searchSource = source("../pages/search/index.js");
const settingsSource = source("../pages/mine/settings/index.js");
const settingsMarkup = source("../pages/mine/settings/index.wxml");

test("search identity linking requires a versioned explicit dialog and supports revocation", () => {
  assert.match(identitySource, /title: "关联搜索记录"/);
  assert.match(identitySource, /拒绝不影响搜索/);
  assert.match(identitySource, /accepted: true/);
  assert.match(identitySource, /noticeVersion: SEARCH_IDENTITY_NOTICE_VERSION/);
  assert.match(identitySource, /method: "DELETE"/);
  assert.match(identitySource, /rotateSearchAnalyticsSessionId\(\)/);
});

test("login offers consent, logout rotates the anonymous install session, and search no longer forces anonymous auth", () => {
  assert.match(appSource, /requestSearchIdentityConsent\(\{ prompt: true \}\)/);
  assert.match(appSource, /clearLoginSession\(\)[\s\S]*rotateSearchAnalyticsSessionId\(\)/);
  assert.doesNotMatch(searchSource, /url: "\/api\/search\/events",[\s\S]{0,120}auth: false/);
  assert.doesNotMatch(searchSource, /events\/\$\{encodeURIComponent\(eventId\)\}\/click`,[\s\S]{0,120}auth: false/);
});

test("settings exposes the current consent state and a user-controlled withdrawal path", () => {
  assert.match(settingsMarkup, /搜索记录关联/);
  assert.match(settingsMarkup, /可随时撤回/);
  assert.match(settingsSource, /revokeSearchIdentityConsent\(\)/);
  assert.match(settingsSource, /requestSearchIdentityConsent\(\{ prompt: true, force: true \}\)/);
});
