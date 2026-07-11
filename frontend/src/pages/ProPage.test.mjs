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
  assert.match(source, /import \{ isMiniProgramWebView,[^}]*openMiniProgramNativePro[^}]*\} from "\.\.\/utils\/mpAuthBridge";/);
  assert.match(source, /const miniProgramWebView = isMiniProgramWebView\(\);/);
  assert.match(source, /if \(miniProgramWebView\) \{[\s\S]*await openMiniProgramNativePro\(selected\)[\s\S]*return;[\s\S]*\}/);
  const createOrderFunction = source.match(/const createOrder = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(createOrderFunction, "createOrder function should exist");
  assert.ok(
    createOrderFunction[0].indexOf("if (miniProgramWebView)") < createOrderFunction[0].indexOf("billingApi.createOrder"),
    "mini-program web-view guard must run before ordinary /billing/orders checkout"
  );
});

test("ProPage redirects to native virtual payment when backend blocks mini-program ordinary checkout", () => {
  assert.match(source, /const errorMessage = error\?\.response\?\.data\?\.message \|\| error\?\.message \|\| "下单失败";/);
  assert.match(source, /if \(isMiniProgramVirtualPaymentBlock\(errorMessage\)\) \{/);
  assert.match(source, /await openMiniProgramNativePro\(selected\)/);
  assert.match(source, /请在小程序原生订阅页完成微信虚拟支付/);
});

test("ProPage opens native mini-program login when checkout auth is expired", () => {
  assert.match(source, /import \{ isMiniProgramWebView,[^}]*openMiniProgramNativeLogin[^}]*openMiniProgramNativePro[^}]*\} from "\.\.\/utils\/mpAuthBridge";/);
  assert.match(source, /error\?\.response\?\.status === 401 && miniProgramWebView/);
  assert.match(source, /openMiniProgramNativeLogin\(\)/);
  const catchBlock = source.match(/catch \(error: any\) \{[\s\S]*?\n    \} finally/);
  assert.ok(catchBlock, "checkout catch block should exist");
  assert.ok(
    catchBlock[0].indexOf("openMiniProgramNativeLogin()") < catchBlock[0].indexOf("setMessage(errorMessage)"),
    "expired mini-program checkout auth should open native login before showing an error message"
  );
});

test("ProPage describes pending WeChat refunds as processing, not succeeded", () => {
  assert.match(source, /res\.data\.refund\?\.status === "pending"/);
  assert.match(source, /微信处理中，处理完成后积分会自动扣回/);
  assert.doesNotMatch(source, /setMessage\("退款成功，订阅状态已回到可用积分方案。"\);/);
});
