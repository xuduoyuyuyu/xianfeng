import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const pages = [
  ["Pro", "../pages/pro/index.wxml"],
  ["Worthbuy", "../pages/worthbuy/index.wxml"],
  ["Xiaowanzi", "../pages/xiaowanzi/index.wxml"],
  ["Mama Resource", "../pages/mama-resource-apply/index.wxml"],
  ["Flash Test", "../pages/flash-test/index.wxml"],
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
  assert.match(read("../pages/flash-test/index.wxml"), /xf-flash-mode-card[^>]*open-type="\{\{isLoggedIn \? '' : 'getPhoneNumber'\}\}"[^>]*bindgetphonenumber="authorizeAssessment"/);
  assert.match(read("../pages/webview/index.wxml"), /xf-expert-detail-login[^>]*open-type="getPhoneNumber"[^>]*bindgetphonenumber="authorizeNativeExpert"/);
});

test("webview sidebar account card directly owns the phone authorization gesture", () => {
  const wxml = read("../pages/webview/index.wxml");
  assert.match(wxml, /<button wx:if="\{\{!isLoggedIn\}\}" class="xf-native-settings-account" open-type="getPhoneNumber" bindgetphonenumber="loginWithPhone"/);
  assert.match(wxml, /<cover-view wx:else class="xf-native-settings-account" catchtap="openSettingsItem"/);
});

test("every sidebar menu item directly requests phone login when signed out", () => {
  const sidebarPages = [
    "../pages/webview/index.wxml",
    "../pages/reading/index.wxml",
    "../pages/programs/index.wxml",
    "../pages/topics/index.wxml",
    "../pages/search/index.wxml",
    "../pages/materials/index.wxml",
    "../pages/pro/index.wxml",
    "../pages/mama-resource-apply/index.wxml",
    "../pages/mine/index.wxml"
  ];
  for (const path of sidebarPages) {
    const wxml = read(path);
    assert.match(wxml, /class="xf-settings-item-login"[\s\S]*open-type="getPhoneNumber"[\s\S]*bindgetphonenumber="loginWithPhone"[\s\S]*data-section-index="\{\{sectionIndex\}\}"[\s\S]*data-item-index="\{\{itemIndex\}\}"/, path);
  }

  const nativeSettings = read("./nativeSettings.js");
  assert.match(nativeSettings, /pendingSettingsLoginDataset/);
  assert.match(nativeSettings, /this\.openSettingsItem\(\{ currentTarget: \{ dataset: pendingSettingsLoginDataset \} \}\)/);
});
