import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const webviewPageJs = fs.readFileSync(new URL("../pages/webview/index.js", import.meta.url), "utf8");
const webviewPageWxml = fs.readFileSync(new URL("../pages/webview/index.wxml", import.meta.url), "utf8");
const webviewPageWxss = fs.readFileSync(new URL("../pages/webview/index.wxss", import.meta.url), "utf8");

function setWxRuntime(platform) {
  global.__lastRemoveStorageSync = "";
  global.__lastSetStorageSync = null;
  global.wx = {
    getSystemInfoSync: platform ? () => ({ platform }) : undefined,
    getStorageSync() {
      return "";
    },
    removeStorageSync(key) {
      global.__lastRemoveStorageSync = key;
    },
    setStorageSync(key, value) {
      global.__lastSetStorageSync = { key, value };
    },
    navigateTo(options) {
      global.__lastNavigateTo = options;
    },
    switchTab(options) {
      global.__lastSwitchTab = options;
    }
  };
}

function loadWebview() {
  for (const file of ["./webview.js", "./config.js"]) {
    delete require.cache[require.resolve(file)];
  }
  return require("./webview.js");
}

setWxRuntime("");
let { webUrl, openWeb, inferWebPageTitle } = loadWebview();

test("webUrl strips Xiaowanzi state from normal content and appends mini program marker", () => {
  const url = new URL(webUrl("/programs/list?xf_xw=chat&xw_layer=1&xw_return=xiaowanzi&from=menu"));

  assert.equal(url.origin, "https://xianfeng.xinzhi.info");
  assert.equal(url.pathname, "/programs/list");
  assert.equal(url.searchParams.get("from"), "menu");
  assert.equal(url.searchParams.has("xf_xw"), false);
  assert.equal(url.searchParams.has("xw_layer"), false);
  assert.equal(url.searchParams.has("xw_return"), false);
  assert.equal(url.searchParams.get("xf_xw_reset"), "1");
  assert.equal(url.searchParams.get("xf_mp"), "1");
});

test("webUrl preserves explicit Xiaowanzi layer params when requested", () => {
  const url = new URL(webUrl("/experts?xw_layer=1&xw_return=xiaowanzi", { preserveXiaowanziLayer: "1" }));

  assert.equal(url.pathname, "/experts");
  assert.equal(url.searchParams.get("xw_layer"), "1");
  assert.equal(url.searchParams.get("xw_return"), "xiaowanzi");
  assert.equal(url.searchParams.get("xf_mp"), "1");
});

test("webUrl preserves an explicit Xiaowanzi chat entry on normal content", () => {
  const url = new URL(webUrl("/programs/list", { xf_xw: "chat", xf_tab: "0" }));

  assert.equal(url.pathname, "/programs/list");
  assert.equal(url.searchParams.get("xf_xw"), "chat");
  assert.equal(url.searchParams.get("xf_tab"), "0");
  assert.equal(url.searchParams.get("xf_xw_reset"), "1");
  assert.equal(url.searchParams.get("xf_mp"), "1");
});

test("webUrl preserves Xiaowanzi entry params for the Xiaowanzi standalone route", () => {
  const url = new URL(webUrl("/index-xiaowanzi.html?xf_xw=home&xw_layer=1&xw_return=xiaowanzi"));

  assert.equal(url.pathname, "/index-xiaowanzi.html");
  assert.equal(url.searchParams.get("xf_xw"), "home");
  assert.equal(url.searchParams.has("xw_layer"), false);
  assert.equal(url.searchParams.has("xw_return"), false);
  assert.equal(url.searchParams.has("xf_xw_reset"), false);
  assert.equal(url.searchParams.get("xf_mp"), "1");
});

test("webUrl keeps loopback local config out of real mini program web-view URLs", () => {
  setWxRuntime("");
  for (const file of ["./config.js"]) {
    delete require.cache[require.resolve(file)];
  }
  const { resolveRuntimeOrigin } = require("./config.js");

  assert.equal(
    resolveRuntimeOrigin("http://127.0.0.1:5173", "https://xianfeng.xinzhi.info"),
    "https://xianfeng.xinzhi.info"
  );
  ({ webUrl, openWeb } = loadWebview());
});

test("webUrl allows loopback local config inside WeChat devtools", () => {
  setWxRuntime("devtools");
  for (const file of ["./config.js"]) {
    delete require.cache[require.resolve(file)];
  }
  const { resolveRuntimeOrigin } = require("./config.js");

  assert.equal(
    resolveRuntimeOrigin("http://127.0.0.1:5173", "https://xianfeng.xinzhi.info"),
    "http://127.0.0.1:5173"
  );
  setWxRuntime("");
  ({ webUrl, openWeb } = loadWebview());
});

test("webUrl does not depend on browser URL constructors inside the mini program runtime", () => {
  const source = fs.readFileSync(new URL("./webview.js", import.meta.url), "utf8");
  const url = new URL(webUrl("https://xianfeng.xinzhi.info/topics?from=menu#top"));

  assert.equal(source.includes("new URL("), false);
  assert.equal(source.includes("URLSearchParams"), false);
  assert.equal(source.includes("([key, value])"), false);
  assert.equal(url.origin, "https://xianfeng.xinzhi.info");
  assert.equal(url.pathname, "/topics");
  assert.equal(url.searchParams.get("from"), "menu");
  assert.equal(url.searchParams.get("xf_mp"), "1");
  assert.equal(url.hash, "#top");
});

test("webUrl versions topic detail webviews to avoid stale phone cache", () => {
  const listUrl = new URL(webUrl("/topics"));
  const detailUrl = new URL(webUrl("/topics/topic-1"));

  assert.equal(listUrl.searchParams.has("xf_mpv"), false);
  assert.equal(detailUrl.pathname, "/topics/topic-1");
  assert.equal(detailUrl.searchParams.get("xf_mp"), "1");
  assert.equal(detailUrl.searchParams.get("xf_mpv"), "20260630-topic-detail");
});

test("webUrl versions the welfare webview to avoid stale phone cache", () => {
  const url = new URL(webUrl("/welfare"));

  assert.equal(url.pathname, "/welfare");
  assert.equal(url.searchParams.get("xf_mp"), "1");
  assert.equal(url.searchParams.get("xf_wpv"), "20260706-welfare-compact");
});

test("webview wrapper also versions welfare direct entries", () => {
  assert.match(webviewPageJs, /WELFARE_WEBVIEW_VERSION/);
  assert.match(webviewPageJs, /function isWelfareWebPath\(value\) \{/);
  assert.match(webviewPageJs, /isWelfareWebPath\(source\) && !hasUrlParam\(source, "xf_wpv"\)/);
  assert.match(webviewPageJs, /appendUrlParam\(source, "xf_wpv", WELFARE_WEBVIEW_VERSION\)/);
});

test("webUrl always appends mini program marker after caller params", () => {
  const url = new URL(webUrl("/programs/list", { from: "home", xf_xw: "home", xf_xw_ts: 123 }));

  assert.equal(url.pathname, "/programs/list");
  assert.equal(url.searchParams.get("from"), "home");
  assert.equal(url.searchParams.has("xf_xw"), false);
  assert.equal(url.searchParams.has("xf_xw_ts"), false);
  assert.equal(url.searchParams.get("xf_xw_reset"), "1");
  assert.equal(url.searchParams.get("xf_mp"), "1");
});

test("openWeb passes native tabbar height for the mini program webview wrapper", () => {
  openWeb("/search", "搜索");

  const pageUrl = new URL(global.__lastNavigateTo.url, "https://mini.local");
  assert.equal(pageUrl.pathname, "/pages/webview/index");
  const embeddedUrl = new URL(pageUrl.searchParams.get("url"));
  assert.equal(embeddedUrl.pathname, "/search");
  assert.equal(embeddedUrl.searchParams.get("xf_mp"), "1");
  assert.equal(embeddedUrl.searchParams.get("xf_xw_reset"), "1");
  assert.equal(embeddedUrl.searchParams.has("xf_nav"), false);
  assert.equal(embeddedUrl.searchParams.has("xf_tab"), true);
});

test("openWeb opens program details as immersive webview pages", () => {
  openWeb("/programs/abc", "节目详情");

  const pageUrl = new URL(global.__lastNavigateTo.url, "https://mini.local");
  assert.equal(pageUrl.pathname, "/pages/webview/index");
  const embeddedUrl = new URL(pageUrl.searchParams.get("url"));
  assert.equal(embeddedUrl.pathname, "/programs/abc");
  assert.equal(embeddedUrl.searchParams.get("xf_mp"), "1");
  assert.equal(embeddedUrl.searchParams.get("xf_tab"), "0");
});

test("openWeb uses website page names when no explicit title is passed", () => {
  assert.equal(inferWebPageTitle("/programs/list"), "节目");
  assert.equal(inferWebPageTitle("/reading"), "及阅");
  assert.equal(inferWebPageTitle("/materials"), "学习资料");
  assert.equal(inferWebPageTitle("/topics"), "请教一下");
  assert.equal(inferWebPageTitle("/experts?xw_layer=1"), "先疯智库");
  assert.equal(inferWebPageTitle("/worthbuy"), "知物");
  assert.equal(inferWebPageTitle("/welfare"), "百宝箱");
  assert.equal(inferWebPageTitle("/planning"), "教育规划");
  assert.equal(inferWebPageTitle("/search?q=阅读"), "搜索");
  assert.equal(inferWebPageTitle("/index-xiaowanzi.html?xf_xw=home"), "小玩子");

  openWeb("/materials");

  const pageUrl = new URL(global.__lastNavigateTo.url, "https://mini.local");
  assert.equal(pageUrl.searchParams.get("title"), "学习资料");

  openWeb("/welfare");
  const welfarePageUrl = new URL(global.__lastNavigateTo.url, "https://mini.local");
  const embeddedWelfareUrl = new URL(welfarePageUrl.searchParams.get("url"));
  assert.equal(welfarePageUrl.searchParams.get("title"), "百宝箱");
  assert.equal(embeddedWelfareUrl.searchParams.get("xf_wpv"), "20260706-welfare-compact");
});

test("openWeb clears Xiaowanzi entry mode when opening normal content", () => {
  openWeb("/programs/list", "节目");

  assert.equal(global.__lastRemoveStorageSync, "xf_xiaowanzi_entry_mode");
});

test("openWeb keeps Xiaowanzi entry mode for the Xiaowanzi standalone route", () => {
  global.__lastRemoveStorageSync = "";
  openWeb("/index-xiaowanzi.html", "小玩子", { xf_xw: "home" });

  assert.equal(global.__lastRemoveStorageSync, "");
});

test("webview page authorizes phone login in the current page without a login route", () => {
  assert.match(webviewPageWxml, /<web-view wx:elif="\{\{src\}\}" src="\{\{src\}\}" \/>/);
  assert.match(webviewPageWxml, /<button wx:if="\{\{webviewLoginRequired\}\}" class="xf-webview-login-gate \{\{bindingPhone \? 'is-binding' : ''\}\}" open-type="getPhoneNumber" bindgetphonenumber="loginWithPhone"/);
  assert.match(webviewPageJs, /const \{ getToken, getUser, setSession \} = require\("\.\.\/\.\.\/utils\/session"\);/);
  assert.match(webviewPageJs, /const webviewLoginRequired = options\.login === "1" && !getToken\(\);/);
  assert.match(webviewPageJs, /loginWithPhone\(event\)[\s\S]*\/api\/wechat-mini\/login[\s\S]*setSession\(payload\)[\s\S]*buildWebUrl\(currentSrc, \{ preserveXiaowanziLayer:/);
  assert.doesNotMatch(webviewPageJs, /\/pages\/login\/index/);
  assert.match(webviewPageWxss, /\.xf-webview-login-gate \{[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*z-index: 100300;[\s\S]*background: rgba\(255, 255, 255, 0\.01\);/);
});
