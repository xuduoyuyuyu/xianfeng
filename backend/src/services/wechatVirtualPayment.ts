import { createHmac } from "node:crypto";
import type { PaymentOrder } from "../models/PaymentOrder";
import { fetchWechatMiniAccessToken, fetchWechatMiniSession } from "./wechatMiniAuth";
import { getVirtualProduct } from "./virtualPaymentProducts";

type VirtualEnvironment = 0 | 1;

export type WechatVirtualCheckout = {
  paymentChannel: "wechat_virtual";
  paymentParams: { mode: "short_series_goods"; signData: string; paySig: string; signature: string };
  signData: string;
  paySig: string;
  signature: string;
};

export type WechatVirtualNotification =
  | { event: "xpay_goods_deliver_notify"; outTradeNo: string; openid: string; productId: string; quantity: number; raw: Record<string, unknown> }
  | { event: "xpay_refund_notify"; outTradeNo: string; openid: string; refundFee: number; raw: Record<string, unknown> }
  | { event: "xpay_complaint_notify"; outTradeNo: string; openid: string; transactionId: string; raw: Record<string, unknown> };

export type VerifiedVirtualOrder = {
  outTradeNo: string;
  status: number;
  amountCents: number;
  paidAmountCents: number;
  environment: VirtualEnvironment;
  transactionId: string;
  bizMeta: { orderId: string; userId: string; productId: string; quantity: number };
  raw: Record<string, unknown>;
};

function config() {
  const envText = String(process.env.WECHAT_VIRTUAL_PAY_ENV || "").trim();
  return {
    enabled: String(process.env.WECHAT_VIRTUAL_PAY_ENABLED || "").trim().toLowerCase() === "true",
    environment: (envText === "0" ? 0 : envText === "1" ? 1 : null) as VirtualEnvironment | null,
    offerId: String(process.env.WECHAT_VIRTUAL_PAY_OFFER_ID || "").trim(),
    appKey: String(process.env.WECHAT_VIRTUAL_PAY_APP_KEY || "").trim(),
    messageFormat: String(process.env.WECHAT_VIRTUAL_PAY_MESSAGE_FORMAT || "").trim().toLowerCase(),
  };
}

export function isWechatVirtualPaymentConfigured(): boolean {
  const value = config();
  return value.enabled && value.environment !== null && value.messageFormat === "json" && Boolean(value.offerId && value.appKey);
}

function requiredConfig() {
  const value = config();
  if (!isWechatVirtualPaymentConfigured()) throw new Error("微信虚拟支付未配置");
  return value as typeof value & { environment: VirtualEnvironment };
}

function hmac(key: string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function createWechatVirtualCheckout(
  order: PaymentOrder,
  session: { openid: string; sessionKey: string }
): WechatVirtualCheckout {
  const cfg = requiredConfig();
  if (!String(session.openid || "").trim() || !String(session.sessionKey || "")) throw new Error("微信登录态无效");
  const product = getVirtualProduct(order.virtualProductId);
  if (!product || order.virtualQuantity !== 1 || order.amountCents !== product.amountCents) throw new Error("虚拟商品订单无效");
  if (order.virtualEnvironment !== cfg.environment) throw new Error("虚拟支付环境不匹配");
  const signData = JSON.stringify({
    offerId: cfg.offerId,
    buyQuantity: 1,
    env: cfg.environment,
    currencyType: "CNY",
    productId: product.productId,
    goodsPrice: product.amountCents,
    outTradeNo: order.outTradeNo,
    attach: JSON.stringify({ orderId: order.outTradeNo, userId: String(order.userId), productId: product.productId, quantity: 1 }),
  });
  const paySig = hmac(cfg.appKey, `requestVirtualPayment&${signData}`);
  const signature = hmac(session.sessionKey, signData);
  return {
    paymentChannel: "wechat_virtual",
    paymentParams: { mode: "short_series_goods", signData, paySig, signature },
    signData,
    paySig,
    signature,
  };
}

export async function exchangeWechatLoginCode(code: string): Promise<{ openid: string; sessionKey: string }> {
  const loginCode = String(code || "").trim();
  if (!loginCode) throw new Error("微信登录 code 不能为空");
  const session = await fetchWechatMiniSession(loginCode);
  if (!session.sessionKey) throw new Error("微信登录失败：未返回 session_key");
  return { openid: session.openid, sessionKey: session.sessionKey };
}

function requiredString(value: unknown, field: string): string {
  const result = String(value || "").trim();
  if (!result) throw new Error(`微信虚拟支付通知缺少 ${field}`);
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const result = typeof value === "number" ? value : Number.NaN;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`微信虚拟支付字段 ${field} 必须是非负整数`);
  return result;
}

export function parseWechatVirtualNotification(rawBody: string | Buffer): WechatVirtualNotification {
  let raw: Record<string, any>;
  try {
    raw = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody);
  } catch {
    throw new Error("微信虚拟支付通知格式无效");
  }
  const event = requiredString(raw.Event, "Event");
  if (!["xpay_goods_deliver_notify", "xpay_refund_notify", "xpay_complaint_notify"].includes(event)) {
    throw new Error(`不支持的微信虚拟支付通知：${event}`);
  }
  const openid = requiredString(raw.OpenId, "OpenId");
  if (event === "xpay_goods_deliver_notify") {
    return { event, outTradeNo: requiredString(raw.OutTradeNo, "OutTradeNo"), openid, productId: requiredString(raw.GoodsInfo?.ProductId, "GoodsInfo.ProductId"), quantity: nonNegativeInteger(raw.GoodsInfo?.Quantity, "Quantity"), raw };
  }
  if (event === "xpay_refund_notify") {
    return { event, outTradeNo: requiredString(raw.MchOrderId, "MchOrderId"), openid, refundFee: nonNegativeInteger(raw.RefundFee, "RefundFee"), raw };
  }
  if (event === "xpay_complaint_notify") {
    return { event, outTradeNo: requiredString(raw.MchOrderId, "MchOrderId"), openid, transactionId: requiredString(raw.TransactionId, "TransactionId"), raw };
  }
  throw new Error(`不支持的微信虚拟支付通知：${event}`);
}

export async function queryWechatVirtualOrder(input: { outTradeNo: string; openid: string }): Promise<VerifiedVirtualOrder> {
  const cfg = requiredConfig();
  const outTradeNo = requiredString(input.outTradeNo, "outTradeNo");
  const openid = requiredString(input.openid, "openid");
  const body = JSON.stringify({ openid, env: cfg.environment, order_id: outTradeNo });
  const paySig = hmac(cfg.appKey, `/xpay/query_order&${body}`);
  const accessToken = await fetchWechatMiniAccessToken();
  const url = new URL("https://api.weixin.qq.com/xpay/query_order");
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("pay_sig", paySig);
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(8000) });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload.errcode) throw new Error(payload.errmsg || "微信虚拟支付查单失败");
  const order = payload.order;
  if (!order || String(order.order_id || "") !== outTradeNo) throw new Error("微信虚拟支付查单返回订单不匹配");
  const environment = order.env_type === 1 ? 0 : order.env_type === 2 ? 1 : null;
  if (environment === null) throw new Error("微信虚拟支付查单返回环境无效");
  let bizMeta: VerifiedVirtualOrder["bizMeta"];
  try {
    const parsed = JSON.parse(requiredString(order.biz_meta, "biz_meta"));
    bizMeta = {
      orderId: requiredString(parsed.orderId, "biz_meta.orderId"),
      userId: requiredString(parsed.userId, "biz_meta.userId"),
      productId: requiredString(parsed.productId, "biz_meta.productId"),
      quantity: nonNegativeInteger(parsed.quantity, "biz_meta.quantity"),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("biz_meta")) throw error;
    throw new Error("微信虚拟支付查单返回 biz_meta 无效");
  }
  return { outTradeNo, status: nonNegativeInteger(order.status, "status"), amountCents: nonNegativeInteger(order.order_fee, "order_fee"), paidAmountCents: nonNegativeInteger(order.paid_fee, "paid_fee"), environment, transactionId: requiredString(order.wxpay_order_id || order.wx_order_id, "wxpay_order_id"), bizMeta, raw: order };
}
