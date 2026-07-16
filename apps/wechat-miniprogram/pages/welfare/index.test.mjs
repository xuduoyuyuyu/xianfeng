import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const js = readFileSync(new URL("index.js", import.meta.url), "utf8");
const wxml = readFileSync(new URL("index.wxml", import.meta.url), "utf8");
const json = readFileSync(new URL("index.json", import.meta.url), "utf8");

test("welfare claim button directly requests phone authorization without an intermediate login card", () => {
  assert.match(json, /"phone-login-gate"\s*:\s*"\.\.\/\.\.\/components\/phone-login-gate\/index"/);
  assert.match(wxml, /<button[^>]*open-type="\{\{hasSession \? '' : 'getPhoneNumber'\}\}"[^>]*bindgetphonenumber="loginAndClaimWelfare"[^>]*data-id="\{\{item\._id\}\}"/);
  assert.match(wxml, /<phone-login-gate[^>]*id="welfarePhoneLoginGate"[^>]*visible="\{\{false\}\}"[^>]*bind:success="handleLoginSuccess"/);
  assert.doesNotMatch(wxml, /<phone-login-gate[^>]*visible="\{\{loginRequired\}\}"|xf-welfare-login-card|未登录或登录已过期/);
});

test("welfare login success continues the pending claim", () => {
  assert.match(js, /loginAndClaimWelfare\(event\)[\s\S]*this\._pendingClaimId = id[\s\S]*loginWithPhone\(event\)/);
  assert.match(js, /handleLoginSuccess\(\)\s*\{[\s\S]*hasSession: true[\s\S]*this\.claimWelfare\(\{ currentTarget: \{ dataset: \{ id \} \} \}\)/);
  const handler = js.match(/handleLoginSuccess\(\)\s*\{([\s\S]*?)\n  \},/)?.[1] || "";
  assert.match(handler, /claimWelfare/);
});

test("welfare displayed links copy silently while mini-program links keep their open action", () => {
  assert.match(wxml, /<text user-select="true" catchtap="copyClaimLink"[^>]*>\{\{claimDialogExternalUrl\}\}<\/text>/);
  assert.match(wxml, /<button wx:if="\{\{claimDialogIsMiniProgramLink\}\}" catchtap="openClaimLink">点击获取<\/button>/);
  assert.doesNotMatch(wxml, />复制链接<\/button>/);
  assert.match(js, /copyClaimLink\(\) \{[\s\S]*copyTextSilently\(this\.data\.claimDialogExternalUrl\);/);
  assert.doesNotMatch(js, /链接已复制/);
});
