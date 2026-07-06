import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "WelfarePage.tsx"), "utf8");
const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../services/api.ts"), "utf8");

test("welfare page is routed as Xiaowanzi treasure box", () => {
  assert.match(appSource, /import WelfarePage from "\.\/pages\/WelfarePage";/);
  assert.match(appSource, /if \(normalizedPathname === "\/welfare"\) \{\s*return <WelfarePage \/>;\s*\}/s);
  assert.match(source, /小玩子百宝箱/);
  assert.match(source, /\/assets\/welfare-gift-icon\.png/);
  assert.match(source, /\/assets\/xw-1\.png/);
  assert.doesNotMatch(source, /\/assets\/xw-nohat\.png/);
  assert.match(source, /bg-\[#f0edff\]/);
  assert.match(source, /我的福利/);
  assert.match(source, /福利多多，好运多多/);
  assert.doesNotMatch(source, /这里放家长先疯给你的限时资料、课程体验和合作福利/);
});

test("welfare page uses compact mini program webview spacing and hides raw 404 errors", () => {
  assert.match(source, /import \{ isMiniProgramWebView \} from "\.\.\/utils\/mpAuthBridge";/);
  assert.match(source, /const miniProgramWebView = isMiniProgramWebView\(\);/);
  assert.match(source, /\{!miniProgramWebView \? <GlobalPublicNav compactMobile \/> : null\}/);
  assert.match(source, /className=\{`xf-welfare-main/);
  assert.match(source, /miniProgramWebView \? "pt-0" : "pt-\[64px\]"/);
  assert.match(source, /style=\{\{ paddingTop: miniProgramWebView \? 0 : undefined \}\}/);
  assert.doesNotMatch(source, /pt-\[92px\]/);
  assert.match(source, /function isNotFoundError\(error: any\): boolean \{/);
  assert.match(source, /Request failed with status code 404/);
  assert.match(source, /function readableError\(error: any, fallback: string\): string \{/);
  assert.match(source, /Request failed with status code \\d\+/);
  assert.match(source, /if \(isNotFoundError\(error\)\) \{/);
  assert.match(source, /setActiveCampaigns\(\[\]\);/);
  assert.match(source, /setHistoryCampaigns\(\[\]\);/);
  assert.match(source, /if \(isNotFoundError\(error\)\) \{\s*setMessage\("这个福利暂时不可领取，稍后再看看"\);\s*return;\s*\}/s);
  assert.match(source, /readableError\(error, "福利加载失败，请稍后重试"\)/);
  assert.doesNotMatch(source, /setMessage\(readableError\(error, "福利加载失败，请稍后重试"\)\)[\s\S]*Request failed with status code 404/);
  assert.doesNotMatch(source, /error\?\.message \|\| "福利加载失败，请稍后重试"/);
  assert.doesNotMatch(source, /setMessage\(readableError\(error, "福利活动不存在"\)\)/);
});

test("welfare page separates claimable and historical welfare states", () => {
  assert.match(source, /activeCampaigns/);
  assert.match(source, /historyCampaigns/);
  assert.match(source, /历史福利/);
  assert.match(source, /已抢完/);
  assert.match(source, /立即领取/);
  assert.match(source, /handleClaim/);
  assert.match(source, /availability === "expired"/);
  assert.match(source, /availability === "sold_out"/);
});

test("welfare public api exposes campaigns and claim action", () => {
  assert.match(apiSource, /export type WelfareAvailability/);
  assert.match(apiSource, /export interface WelfareCampaign/);
  assert.match(apiSource, /getWelfareCampaigns: \(\)/);
  assert.match(apiSource, /claimWelfareCampaign: \(id: string\)/);
  assert.match(apiSource, /\/welfare\/campaigns/);
  assert.match(apiSource, /\/welfare\/campaigns\/\$\{id\}\/claims/);
});
