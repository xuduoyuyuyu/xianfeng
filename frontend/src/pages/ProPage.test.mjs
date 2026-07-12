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
  assert.match(source, /const inMiniProgramWebView = isMiniProgramWebView\(\);/);
  assert.match(source, /if \(inMiniProgramWebView\) \{[\s\S]*await openMiniProgramNativePro\(selected\)[\s\S]*return;[\s\S]*\}/);
  const createOrderFunction = source.match(/const createOrder = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(createOrderFunction, "createOrder function should exist");
  assert.ok(
    createOrderFunction[0].indexOf("if (inMiniProgramWebView)") < createOrderFunction[0].indexOf("billingApi.createOrder"),
    "mini-program web-view guard must run before ordinary /billing/orders checkout"
  );
});

test("ProPage redirects to native virtual payment when backend blocks mini-program ordinary checkout", () => {
  assert.match(source, /const errorMessage = error\?\.response\?\.data\?\.message \|\| error\?\.message \|\| "下单失败";/);
  assert.match(source, /if \(isMiniProgramVirtualPaymentBlock\(errorMessage\)\) \{/);
  assert.match(source, /await openMiniProgramNativePro\(selected\)/);
  assert.match(source, /请在小程序原生订阅页完成微信虚拟支付/);
  assert.match(source, /MINI_PROGRAM_NATIVE_PRO_FALLBACK_MESSAGE/);
  assert.doesNotMatch(source, /setMessage\(opened \? "请在小程序原生订阅页完成微信虚拟支付。" : errorMessage\)/);
  assert.doesNotMatch(source, /https:\/\/xianfeng\.xinzhi\.info\/api\/billing\/orders/);
});

test("ProPage opens native mini-program login when checkout auth is expired", () => {
  assert.match(source, /import \{ isMiniProgramWebView,[^}]*openMiniProgramNativeLogin[^}]*openMiniProgramNativePro[^}]*\} from "\.\.\/utils\/mpAuthBridge";/);
  assert.match(source, /error\?\.response\?\.status === 401 && isMiniProgramWebView\(\)/);
  assert.match(source, /openMiniProgramNativeLogin\(\)/);
  const catchBlock = source.match(/catch \(error: any\) \{[\s\S]*?\n    \} finally/);
  assert.ok(catchBlock, "checkout catch block should exist");
  assert.ok(
    catchBlock[0].indexOf("openMiniProgramNativeLogin()") < catchBlock[0].indexOf("setMessage(errorMessage)"),
    "expired mini-program checkout auth should open native login before showing an error message"
  );
});

test("ProPage renders payment records without refund actions", () => {
  assert.match(source, /const \[paymentOrders, setPaymentOrders\] = useState<BillingOrder\[\]>\(\[\]\);/);
  assert.match(source, /setPaymentOrders\(meRes\.data\.paymentOrders \|\| \[\]\)/);
  assert.match(source, /付款记录/);
  assert.match(source, /paymentOrders\.map\(\(order\) =>/);
  assert.match(source, /虚拟支付订单不支持退款/);
  assert.doesNotMatch(source, /const requestRefund = async/);
  assert.doesNotMatch(source, /billingApi\.requestRefund/);
  assert.doesNotMatch(source, /onClick=\{\(\) => requestRefund\(order\.id\)\}/);
  assert.doesNotMatch(source, /APPLE_REFUND_URL|EXTERNAL_REFUND_GUIDE_PATTERN|needsExternalRefundGuide|退款入口/);
});
