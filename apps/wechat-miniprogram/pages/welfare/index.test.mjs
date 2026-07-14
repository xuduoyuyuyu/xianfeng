import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const js = readFileSync(new URL("index.js", import.meta.url), "utf8");
const wxml = readFileSync(new URL("index.wxml", import.meta.url), "utf8");
const json = readFileSync(new URL("index.json", import.meta.url), "utf8");

test("welfare renders the shared login gate instead of an auth error card", () => {
  assert.match(json, /"phone-login-gate"\s*:\s*"\.\.\/\.\.\/components\/phone-login-gate\/index"/);
  assert.match(wxml, /<phone-login-gate[^>]*visible="\{\{loginRequired\}\}"[^>]*bind:success="handleLoginSuccess"/);
  assert.doesNotMatch(wxml, /xf-welfare-login-card|open-type="getPhoneNumber"|未登录或登录已过期/);
});

test("welfare login success refreshes reads without replaying a claim", () => {
  assert.match(js, /handleLoginSuccess\(\)\s*\{[\s\S]*loginRequired: false[\s\S]*this\.loadCampaigns\(\)/);
  const handler = js.match(/handleLoginSuccess\(\)\s*\{([\s\S]*?)\n  \},/)?.[1] || "";
  assert.doesNotMatch(handler, /claimWelfare|\/claims/);
  assert.doesNotMatch(js, /loginWithPhone\(/);
});

test("welfare claim link button opens mini-program links and copies ordinary links", () => {
  assert.match(
    wxml,
    /<button catchtap="\{\{claimDialogIsMiniProgramLink \? 'openClaimLink' : 'copyClaimLink'\}\}">\{\{claimDialogIsMiniProgramLink \? '点击获取' : '复制链接'\}\}<\/button>/
  );
  assert.doesNotMatch(
    wxml,
    /<button catchtap="copyClaimLink">\{\{claimDialogIsMiniProgramLink \? '点击获取' : '复制链接'\}\}<\/button>/
  );
});
