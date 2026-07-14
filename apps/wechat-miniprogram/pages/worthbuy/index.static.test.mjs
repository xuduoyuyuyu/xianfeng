import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const js = readFileSync(new URL("index.js", import.meta.url), "utf8");
const wxml = readFileSync(new URL("index.wxml", import.meta.url), "utf8");
const wxss = readFileSync(new URL("index.wxss", import.meta.url), "utf8");
const app = readFileSync(new URL("../../app.json", import.meta.url), "utf8");
const nav = readFileSync(new URL("../../utils/nativePageNav.js", import.meta.url), "utf8");
const json = JSON.parse(readFileSync(new URL("index.json", import.meta.url), "utf8"));
test("registers a native WorthBuy list before the generic webview", () => { assert.ok(app.indexOf('pages/worthbuy/index') < app.indexOf('pages/webview/index')); assert.match(nav, /pages\/worthbuy\/index/); });
test("loads paged public items and keeps personal history owner scoped", () => { assert.match(js, /\/api\/worthbuy\/list\?current=\$\{current\}&size=\$\{PAGE_SIZE\}/); assert.match(js, /readWorthBuyCache\("history", ownerId\)/); assert.match(js, /\/api\/worthbuy\/my\?current=1&size=/); });
test("submits once and separates auth, Pro, points, validation, and network states", () => { assert.match(js, /if \(this\._submitPromise\)/); assert.match(js, /classifyWorthBuyError/); assert.match(wxml, /<phone-login-gate[^>]*visible="\{\{loginRequired\}\}"/); assert.match(wxml, /actionErrorType === 'pro' \|\| actionErrorType === 'points'/); });
test("opens login without replaying analysis after authentication", () => { assert.match(js, /showLoginGate\(\)[\s\S]*loginRequired: true/); assert.match(js, /handleLoginSuccess\(\)[\s\S]*loadMyHistory\(\)/); const handler = js.match(/handleLoginSuccess\(\)\s*\{([\s\S]*?)\n  \},/)?.[1] || ""; assert.doesNotMatch(handler, /submitAnalysis/); });
test("renders public and personal cards as separate sections", () => { assert.match(wxml, /公开知物/); assert.match(wxml, /我的分析/); assert.match(wxml, /deleteHistoryItem/); });

test("uses a red risk style only for IQ-tax labels", () => {
  assert.equal((wxml.match(/wb-card-tag \{\{item\.isIqTax \? 'is-iq-tax' : ''\}\}/g) || []).length, 2);
  assert.match(wxss, /\.wb-card-tag\.is-iq-tax\{[^}]*background:#fff1f2;[^}]*color:#dc2626/);
});
test("matches the mobile web hero and two-column product cards", () => {
  assert.match(wxml, /VALUE CHECK/);
  assert.match(wxml, /输入商品链接或品牌名称，AI 帮你深度分析值不值得买，看穿消费迷雾/);
  assert.match(wxml, /支持淘宝、京东、拼多多等平台链接，或直接输入品牌名/);
  assert.match(wxml, /class="wb-search-row"/);
  assert.match(wxml, /class="wb-card-grid"/);
  assert.match(wxml, /item\.displayEmoji/);
  assert.match(wxml, /item\.categoryLabel/);
  assert.doesNotMatch(wxml, /class="wb-score"/);
});
test("reuses the Topics native topbar shell", () => {
  assert.match(wxml, /class="xf-native-topbar"/);
  assert.match(wxml, /class="xf-native-nav-row"/);
  assert.match(wxml, /class="xf-native-menu-button"[\s\S]*catchtap="openSettings"/);
  assert.match(wxml, /class="xf-native-logo"[\s\S]*bindtap="goProgramsHome"/);
  assert.match(wxml, /class="xf-native-welfare-button"[\s\S]*catchtap="openWelfare"/);
  assert.match(js, /syncTopbarMetrics/);
  assert.doesNotMatch(wxml, /class="wb-back"/);
});
test("matches the Topics submit shape and mounts the shared bottom tabbar", () => {
  assert.match(wxml, /class="wb-submit[^"]*\{\{input && !submitting \? '' : 'is-disabled'\}\}"/);
  assert.doesNotMatch(wxml, /disabled="\{\{submitting \|\| !input\}\}"/);
  assert.match(wxml, /<custom-tab-bar selected="\{\{selected\}\}" hidden="\{\{hideTabbar\}\}" \/>/);
  assert.equal(json.usingComponents["custom-tab-bar"], "../../custom-tab-bar/index");
  assert.match(js, /selected: 4/);
});
