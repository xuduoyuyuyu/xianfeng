import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "ProPage.tsx"), "utf8");

test("super-mode subscription page uses compact top spacing", () => {
  assert.match(source, /useXiaowanziEmbeddedLayer/, "ProPage should detect Xiaowanzi embedded super mode");
  assert.match(source, /\{!superModePage \? <GlobalPublicNav compactMobile \/> : null\}/, "super mode should not render the normal public nav");
  assert.match(source, /superModePage \? "pt-4 sm:pt-5" : "pt-\[84px\]"/, "super mode should use compact top padding");
  assert.match(source, /superModePage \? "p-4 shadow-sm lg:p-5" : "p-5 shadow-sm lg:p-6"/, "super mode should reduce the primary card padding");
});

test("subscription balance refreshes after billed AI usage", () => {
  assert.match(source, /xf-billing-balance-changed/, "billing changes should trigger a membership reload");
  assert.match(source, /window\.addEventListener\("focus", refreshBilling\)/, "returning to the subscription page should refresh the balance");
});

test("subscription usage policy pins Xiaowanzi costs to the current one-point rules", () => {
  assert.match(source, /USAGE_POLICY_OVERRIDES/, "stale remote usage policy should be normalized on the client");
  assert.match(source, /featureKey: "xiaowanzi", name: "小玩子对话", cost: 1/);
  assert.match(source, /featureKey: "xiaowanzi_file", name: "小玩子图片文件处理", cost: 1/);
  assert.match(source, /USAGE_POLICY_OVERRIDES\.forEach\(\(item, key\) => byKey\.set\(key, item\)\)/);
});

test("subscription page uses native mini program chrome spacing when embedded", () => {
  assert.match(source, /html\.xf-mp-webview \.pro-page-main/);
  assert.match(source, /className=\{`pro-page-main/);
  assert.match(source, /padding-top: var\(--xf-mp-nav-height, 88px\) !important;/);
  assert.match(source, /padding-bottom: 0 !important;/);
});

test("ProPage blocks ordinary web checkout inside mini-program web-view", () => {
  assert.match(source, /import \{ isMiniProgramWebView, openMiniProgramNativePro \} from "\.\.\/utils\/mpAuthBridge";/);
  assert.match(source, /const miniProgramWebView = isMiniProgramWebView\(\);/);
  assert.match(source, /if \(miniProgramWebView\) \{[\s\S]*await openMiniProgramNativePro\(selected\)[\s\S]*return;[\s\S]*\}/);
  const createOrderFunction = source.match(/const createOrder = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(createOrderFunction, "createOrder function should exist");
  assert.ok(
    createOrderFunction[0].indexOf("if (miniProgramWebView)") < createOrderFunction[0].indexOf("billingApi.createOrder"),
    "mini-program web-view guard must run before ordinary /billing/orders checkout"
  );
});
