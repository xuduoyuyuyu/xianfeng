import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test, { afterEach } from "node:test";
import type { PaymentOrder } from "../models/PaymentOrder";
import {
  createWechatVirtualCheckout,
  exchangeWechatLoginCode,
  isWechatVirtualPaymentConfigured,
  notifyWechatVirtualGoodsProvided,
  parseWechatVirtualNotification,
  queryWechatVirtualOrder,
  requestWechatVirtualRefund,
  verifyWechatMessageCallback,
} from "./wechatVirtualPayment";
import { clearWechatMiniAccessTokenCache } from "./wechatMiniAuth";

/*
Official contract fixtures (2026-07-11):
- wx.requestVirtualPayment, base library >= 2.19.2. signData is the exact JSON string;
  goods mode is short_series_goods. Required fields used here: offerId,
  buyQuantity, env (0 production / 1 sandbox), currencyType=CNY, productId,
  goodsPrice (fen), outTradeNo and attach.
- paySig = hex(HMAC-SHA256(appKey, "requestVirtualPayment&" + signData));
  signature = hex(HMAC-SHA256(sessionKey, signData)). No notification headers or
  callback signature are documented. Push success is ErrCode=0/ErrMsg=success.
- Official events used: xpay_goods_deliver_notify, xpay_refund_notify,
  xpay_complaint_notify. Pushes are untrusted triggers only.
- /xpay/query_order POST body is {openid,env,order_id}; pay_sig signs
  "/xpay/query_order&" + the exact body. Response env_type is 1 production / 2 sandbox.
Sources: https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html
https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html
https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_order.html
*/

const savedEnv = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => {
  process.env = { ...savedEnv };
  globalThis.fetch = originalFetch;
  clearWechatMiniAccessTokenCache();
});

function configure() {
  process.env.WECHAT_VIRTUAL_PAY_ENABLED = "true";
  process.env.WECHAT_VIRTUAL_PAY_ENV = "1";
  process.env.WECHAT_VIRTUAL_PAY_OFFER_ID = "offer-test";
  process.env.WECHAT_VIRTUAL_PAY_APP_KEY = "app-key-test";
  process.env.WECHAT_VIRTUAL_PAY_MESSAGE_FORMAT = "json";
  process.env.WECHAT_MINI_APP_ID = "wx-test";
  process.env.WECHAT_MINI_APP_SECRET = "secret-test";
}

function order(): PaymentOrder {
  return {
    userId: "507f1f77bcf86cd799439011",
    virtualProductId: "plus",
    virtualQuantity: 1,
    virtualEnvironment: 1,
    amountCents: 1990,
    currency: "CNY",
    outTradeNo: "VP20260711ABC123",
  } as PaymentOrder;
}

test("creates official direct-goods checkout signatures from the exact signData", () => {
  configure();
  process.env.WECHAT_VIRTUAL_PAY_PRODUCT_PLUS = "wx_plus_200_points";
  const checkout = createWechatVirtualCheckout(order(), { openid: "openid-test", sessionKey: "session-key-test" });
  const expectedSignData = JSON.stringify({
    offerId: "offer-test", buyQuantity: 1, env: 1, currencyType: "CNY",
    productId: "wx_plus_200_points", goodsPrice: 1990, outTradeNo: "VP20260711ABC123",
    attach: JSON.stringify({ orderId: "VP20260711ABC123", userId: "507f1f77bcf86cd799439011", productId: "plus", quantity: 1 }),
  });
  const expectedPaySig = createHmac("sha256", "app-key-test").update(`requestVirtualPayment&${expectedSignData}`).digest("hex");
  const expectedSignature = createHmac("sha256", "session-key-test").update(expectedSignData).digest("hex");
  assert.equal(checkout.paymentChannel, "wechat_virtual");
  assert.equal(checkout.paymentParams.mode, "short_series_goods");
  assert.equal(checkout.signData, expectedSignData);
  assert.equal(checkout.paySig, expectedPaySig);
  assert.equal(checkout.signature, expectedSignature);
  assert.equal(JSON.parse(checkout.signData).goodsPrice, 1990);
  assert.equal(JSON.parse(checkout.signData).outTradeNo, order().outTradeNo);
});

test("configuration requires an explicit enable flag and all protocol values", () => {
  configure();
  assert.equal(isWechatVirtualPaymentConfigured(), true);
  delete process.env.WECHAT_VIRTUAL_PAY_APP_KEY;
  assert.equal(isWechatVirtualPaymentConfigured(), false);
  configure();
  process.env.WECHAT_VIRTUAL_PAY_MESSAGE_FORMAT = "xml";
  assert.equal(isWechatVirtualPaymentConfigured(), false);
});

test("verifies WeChat message callback challenge with the configured token", () => {
  process.env.WECHAT_MESSAGE_TOKEN = "token123";
  const timestamp = "1720000000";
  const nonce = "nonce-1";
  const signature = createHash("sha1").update(["token123", timestamp, nonce].sort().join("")).digest("hex");

  assert.equal(verifyWechatMessageCallback({ signature, timestamp, nonce, echostr: "echo-ok" }), "echo-ok");
  assert.equal(verifyWechatMessageCallback({ signature: "bad", timestamp, nonce, echostr: "echo-ok" }), null);
});

test("parses official pushes as discriminated untrusted triggers", () => {
  assert.deepEqual(parseWechatVirtualNotification(JSON.stringify({ Event: "xpay_goods_deliver_notify", OpenId: "o1", OutTradeNo: "t1", GoodsInfo: { ProductId: "plus", Quantity: 1 } })), {
    event: "xpay_goods_deliver_notify", outTradeNo: "t1", openid: "o1", productId: "plus", quantity: 1,
    raw: { Event: "xpay_goods_deliver_notify", OpenId: "o1", OutTradeNo: "t1", GoodsInfo: { ProductId: "plus", Quantity: 1 } },
  });
  assert.equal(parseWechatVirtualNotification(JSON.stringify({ Event: "xpay_refund_notify", OpenId: "o1", MchOrderId: "t1", MchRefundId: "r1", WxRefundId: "wr1", RefundFee: 1990, RetCode: 0 })).refundFee, 1990);
  assert.equal(parseWechatVirtualNotification(JSON.stringify({ Event: "xpay_complaint_notify", OpenId: "o1", MchOrderId: "t1", TransactionId: "wx1" })).event, "xpay_complaint_notify");
  assert.throws(() => parseWechatVirtualNotification('{"Event":"unknown"}'), /不支持/);
  assert.throws(() => parseWechatVirtualNotification(JSON.stringify({ Event: "xpay_goods_deliver_notify", OpenId: "o1", OutTradeNo: "t1", GoodsInfo: { ProductId: "plus", Quantity: -1 } })), /Quantity/);
  assert.throws(() => parseWechatVirtualNotification(JSON.stringify({ Event: "xpay_goods_deliver_notify", OpenId: "o1", OutTradeNo: "t1", GoodsInfo: { ProductId: "plus", Quantity: 1.5 } })), /Quantity/);
  assert.throws(() => parseWechatVirtualNotification(JSON.stringify({ Event: "xpay_refund_notify", OpenId: "o1", MchOrderId: "t1", MchRefundId: "r1", WxRefundId: "wr1", RetCode: 0 })), /RefundFee/);
});

test("exchanges a one-time code and requires both openid and session_key", async () => {
  configure();
  globalThis.fetch = (async () => new Response(JSON.stringify({ openid: "o1", session_key: "sk1" }), { status: 200 })) as typeof fetch;
  assert.deepEqual(await exchangeWechatLoginCode("code1"), { openid: "o1", sessionKey: "sk1" });
  globalThis.fetch = (async () => new Response(JSON.stringify({ openid: "o1" }), { status: 200 })) as typeof fetch;
  await assert.rejects(() => exchangeWechatLoginCode("code2"), /session_key/);
});

test("queries the official order endpoint with exact body and independent pay signature", async () => {
  configure();
  const calls: Array<{ url: string; body?: string }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input); calls.push({ url, body: init?.body ? String(init.body) : undefined });
    if (url.includes("stable_token")) return new Response(JSON.stringify({ access_token: "access-1", expires_in: 7200 }), { status: 200 });
    return new Response(JSON.stringify({ errcode: 0, errmsg: "", order: { order_id: "VP20260711ABC123", status: 3, order_fee: 1990, paid_fee: 1990, left_fee: 1990, env_type: 2, wx_order_id: "wx-order", wxpay_order_id: "wxpay-order", biz_meta: JSON.stringify({ attach: JSON.stringify({ orderId: "VP20260711ABC123", userId: "507f1f77bcf86cd799439011", productId: "plus", quantity: 1 }) }) } }), { status: 200 });
  }) as typeof fetch;
  const result = await queryWechatVirtualOrder({ outTradeNo: "VP20260711ABC123", openid: "openid-test" });
  const body = JSON.stringify({ openid: "openid-test", env: 1, order_id: "VP20260711ABC123" });
  const sig = createHmac("sha256", "app-key-test").update(`/xpay/query_order&${body}`).digest("hex");
  assert.equal(calls[1].body, body);
  assert.equal(new URL(calls[1].url).searchParams.get("pay_sig"), sig);
  assert.equal(result.outTradeNo, "VP20260711ABC123");
  assert.equal(result.status, 3);
  assert.equal(result.environment, 1);
  assert.equal(result.amountCents, 1990);
  assert.equal(result.leftFeeCents, 1990);
  assert.equal(result.bizMeta.productId, "plus");
});

test("notifies WeChat that a direct goods order has been provided", async () => {
  configure();
  const calls: Array<{ url: string; body?: string }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input); calls.push({ url, body: init?.body ? String(init.body) : undefined });
    if (url.includes("stable_token")) return new Response(JSON.stringify({ access_token: "access-1", expires_in: 7200 }), { status: 200 });
    return new Response(JSON.stringify({ errcode: 0, errmsg: "ok" }), { status: 200 });
  }) as typeof fetch;

  await notifyWechatVirtualGoodsProvided({ outTradeNo: "VP20260711ABC123", environment: 1 });

  const body = JSON.stringify({ order_id: "VP20260711ABC123", env: 1 });
  const sig = createHmac("sha256", "app-key-test").update(`/xpay/notify_provide_goods&${body}`).digest("hex");
  assert.equal(new URL(calls[1].url).origin + new URL(calls[1].url).pathname, "https://api.weixin.qq.com/xpay/notify_provide_goods");
  assert.equal(new URL(calls[1].url).searchParams.get("access_token"), "access-1");
  assert.equal(new URL(calls[1].url).searchParams.get("pay_sig"), sig);
  assert.equal(calls[1].body, body);
});

test("starts a WeChat virtual refund task with exact body and pay signature", async () => {
  configure();
  const calls: Array<{ url: string; body?: string }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input); calls.push({ url, body: init?.body ? String(init.body) : undefined });
    if (url.includes("stable_token")) return new Response(JSON.stringify({ access_token: "access-1", expires_in: 7200 }), { status: 200 });
    return new Response(JSON.stringify({ errcode: 0, errmsg: "ok", refund_order_id: "RF20260712ABC", refund_wx_order_id: "wx-refund-1", pay_order_id: "VP20260711ABC123", pay_wx_order_id: "wxpay-order" }), { status: 200 });
  }) as typeof fetch;

  const result = await requestWechatVirtualRefund({
    openid: "openid-test",
    outTradeNo: "VP20260711ABC123",
    outRequestNo: "RF20260712ABC",
    leftFeeCents: 1990,
    refundAmountCents: 1990,
    environment: 1,
    bizMeta: { orderId: "VP20260711ABC123", refundOrderId: "RF20260712ABC" },
  });

  const body = JSON.stringify({
    openid: "openid-test",
    order_id: "VP20260711ABC123",
    refund_order_id: "RF20260712ABC",
    left_fee: 1990,
    refund_fee: 1990,
    biz_meta: JSON.stringify({ orderId: "VP20260711ABC123", refundOrderId: "RF20260712ABC" }),
    refund_reason: "3",
    req_from: "2",
    env: 1,
  });
  const sig = createHmac("sha256", "app-key-test").update(`/xpay/refund_order&${body}`).digest("hex");
  assert.equal(new URL(calls[1].url).origin + new URL(calls[1].url).pathname, "https://api.weixin.qq.com/xpay/refund_order");
  assert.equal(new URL(calls[1].url).searchParams.get("pay_sig"), sig);
  assert.equal(calls[1].body, body);
  assert.equal(result.outRequestNo, "RF20260712ABC");
  assert.equal(result.providerRefundId, "wx-refund-1");
});

test("parses virtual refund notifications with merchant and provider refund ids", () => {
  const notification = parseWechatVirtualNotification(JSON.stringify({
    Event: "xpay_refund_notify",
    OpenId: "openid-test",
    MchOrderId: "VP20260711ABC123",
    MchRefundId: "RF20260712ABC",
    WxRefundId: "wx-refund-1",
    RefundFee: 1990,
    RetCode: 0,
    RetMsg: "ok",
  }));
  assert.equal(notification.event, "xpay_refund_notify");
  assert.equal(notification.outTradeNo, "VP20260711ABC123");
  assert.equal(notification.refundOutRequestNo, "RF20260712ABC");
  assert.equal(notification.providerRefundId, "wx-refund-1");
  assert.equal(notification.refundFee, 1990);
  assert.equal(notification.retCode, 0);
});

test("rejects malformed official query numeric and identity fields", async () => {
  configure();
  globalThis.fetch = (async (input) => {
    if (String(input).includes("stable_token")) return new Response(JSON.stringify({ access_token: "access-2", expires_in: 7200 }), { status: 200 });
    return new Response(JSON.stringify({ errcode: 0, order: { order_id: "VP20260711ABC123", status: 2, order_fee: "bad", paid_fee: -1, env_type: 2, biz_meta: JSON.stringify({ orderId: "VP20260711ABC123", userId: "u1", productId: "plus", quantity: 1 }) } }), { status: 200 });
  }) as typeof fetch;
  await assert.rejects(() => queryWechatVirtualOrder({ outTradeNo: "VP20260711ABC123", openid: "openid-test" }), /order_fee/);
});
