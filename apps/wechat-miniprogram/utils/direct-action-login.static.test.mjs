import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const pages = [
  ["Pro", "../pages/pro/index.wxml"],
  ["Worthbuy", "../pages/worthbuy/index.wxml"],
  ["Xiaowanzi", "../pages/xiaowanzi/index.wxml"],
  ["Mama Resource", "../pages/mama-resource-apply/index.wxml"],
  ["WebView", "../pages/webview/index.wxml"]
];

test("protected mini-program pages do not render visible phone login gates", () => {
  for (const [name, path] of pages) {
    const wxml = read(path);
    assert.doesNotMatch(wxml, /<phone-login-gate[^>]*visible="\{\{(?!false\}\})[^}]+\}\}"/, name);
  }
});

test("protected primary actions directly own the phone authorization gesture", () => {
  assert.match(read("../pages/pro/index.wxml"), /xf-pro-pay-button[^>]*open-type="getPhoneNumber"[^>]*bindgetphonenumber="loginForSubscription"/);
  assert.match(read("../pages/worthbuy/index.wxml"), /wb-submit[^>]*open-type="\{\{isLoggedIn \? '' : 'getPhoneNumber'\}\}"[^>]*bindgetphonenumber="authorizeAnalysis"/);
  assert.match(read("../pages/xiaowanzi/index.wxml"), /xf-xiaowanzi-send[^>]*open-type="\{\{isLoggedIn \? '' : 'getPhoneNumber'\}\}"[^>]*bindgetphonenumber="authorizeXiaowanziSend"/);
  assert.match(read("../pages/mama-resource-apply/index.wxml"), /xf-mama-submit[^>]*open-type="\{\{isLoggedIn \? '' : 'getPhoneNumber'\}\}"/);
  assert.match(read("../pages/webview/index.wxml"), /xf-expert-detail-login[^>]*open-type="getPhoneNumber"[^>]*bindgetphonenumber="authorizeNativeExpert"/);
});
