import crypto from "crypto";
import fs from "fs";
import path from "path";
import PaymentOrderModel, { PaymentOrder } from "../models/PaymentOrder";
import { createRefundRecord, isMockPaymentEnabled, markOrderPaid, markRefundSucceeded } from "./billing";

export type PaymentCheckout = {
  provider: "alipay" | "wechat";
  mode: "alipay_page" | "wechat_native" | "wechat_jsapi" | "mock";
  paymentUrl?: string;
  paymentForm?: string;
  codeUrl?: string;
  paymentParams?: WechatMiniProgramPaymentParams;
  mockPayUrl?: string;
  message?: string;
};

type AlipaySdkInstance = any;

export type WechatMiniProgramPaymentParams = {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
};

function readEnvOrFile(value?: string, filePath?: string): string {
  const direct = String(value || "").trim();
  if (direct) return direct.replace(/\\n/g, "\n");
  const resolvedPath = resolveReadableSecretPath(filePath);
  if (!resolvedPath) return "";
  try {
    return fs.readFileSync(resolvedPath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return "";
    throw new Error("支付密钥文件读取失败，请检查服务端支付配置");
  }
}

function hasEnvOrReadableFile(value?: string, filePath?: string): boolean {
  if (String(value || "").trim()) return true;
  return !!resolveReadableSecretPath(filePath);
}

function resolveReadableSecretPath(filePath?: string): string {
  const rawPath = String(filePath || "").trim();
  if (!rawPath) return "";
  const basename = path.basename(rawPath);
  const secretDir = String(process.env.PAYMENT_SECRET_DIR || process.env.SECRETS_DIR || "").trim();
  const candidates = [
    rawPath,
    secretDir && basename ? path.join(secretDir, basename) : "",
    basename ? path.join(process.cwd(), "secrets", basename) : "",
    basename ? path.join("/app/secrets", basename) : "",
  ].filter(Boolean);
  try {
    return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || "";
  } catch (_error) {
    return "";
  }
}

function getPublicBaseUrl(): string {
  return String(process.env.PUBLIC_BASE_URL || process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
}

function getApiBaseUrl(): string {
  return String(process.env.API_PUBLIC_BASE_URL || process.env.BACKEND_PUBLIC_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
}

function loadAlipaySdk(): AlipaySdkInstance {
  let AlipaySdk: any;
  try {
    ({ AlipaySdk } = require("alipay-sdk"));
  } catch (_error) {
    throw new Error("缺少 alipay-sdk 依赖，请在 backend 安装 alipay-sdk");
  }

  const appId = String(process.env.ALIPAY_APP_ID || "").trim();
  const privateKey = readEnvOrFile(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_PRIVATE_KEY_PATH);
  if (!appId || !privateKey) {
    throw new Error("支付宝未配置：请设置 ALIPAY_APP_ID 和 ALIPAY_PRIVATE_KEY");
  }

  const common: Record<string, any> = {
    appId,
    privateKey,
    endpoint: String(process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com").replace(/\/+$/, ""),
  };

  const alipayPublicKey = readEnvOrFile(process.env.ALIPAY_PUBLIC_KEY, process.env.ALIPAY_PUBLIC_KEY_PATH);
  if (alipayPublicKey) common.alipayPublicKey = alipayPublicKey;
  if (process.env.ALIPAY_ROOT_CERT_PATH) common.alipayRootCertPath = process.env.ALIPAY_ROOT_CERT_PATH;
  if (process.env.ALIPAY_PUBLIC_CERT_PATH) common.alipayPublicCertPath = process.env.ALIPAY_PUBLIC_CERT_PATH;
  if (process.env.ALIPAY_APP_CERT_PATH) common.appCertPath = process.env.ALIPAY_APP_CERT_PATH;
  if (process.env.ALIPAY_KEY_TYPE) common.keyType = process.env.ALIPAY_KEY_TYPE;

  return new AlipaySdk(common);
}

function hasAlipayConfig(): boolean {
  return !!String(process.env.ALIPAY_APP_ID || "").trim()
    && hasEnvOrReadableFile(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_PRIVATE_KEY_PATH);
}

function amountText(cents: number): string {
  return (cents / 100).toFixed(2);
}

function orderAmount(order: PaymentOrder): string {
  return amountText(order.amountCents);
}

function getWechatGateway(): string {
  return String(process.env.WECHAT_PAY_GATEWAY || "https://api.mch.weixin.qq.com").replace(/\/+$/, "");
}

function getWechatMchId(): string {
  return String(process.env.WECHAT_PAY_MCH_ID || "").trim();
}

function getWechatAppId(): string {
  return String(process.env.WECHAT_PAY_APP_ID || "").trim();
}

function getWechatMiniProgramAppId(): string {
  return String(process.env.WECHAT_MINI_APP_ID || process.env.WECHAT_PAY_APP_ID || "").trim();
}

export function isWechatNotifyAppIdAllowed(appId: string): boolean {
  const normalized = String(appId || "").trim();
  if (!normalized) return false;
  return [getWechatAppId(), getWechatMiniProgramAppId()].filter(Boolean).includes(normalized);
}

function getWechatApiV3Key(): string {
  return String(process.env.WECHAT_PAY_API_V3_KEY || "").trim();
}

function getWechatPrivateKey(): string {
  return readEnvOrFile(process.env.WECHAT_PAY_PRIVATE_KEY, process.env.WECHAT_PAY_PRIVATE_KEY_PATH);
}

function hasWechatConfig(): boolean {
  return !!getWechatMchId()
    && !!getWechatAppId()
    && !!String(process.env.WECHAT_PAY_SERIAL_NO || "").trim()
    && !!getWechatApiV3Key()
    && hasEnvOrReadableFile(process.env.WECHAT_PAY_PRIVATE_KEY, process.env.WECHAT_PAY_PRIVATE_KEY_PATH);
}

function createNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function signWechatMessage(message: string): string {
  const privateKey = getWechatPrivateKey();
  if (!privateKey) throw new Error("微信支付未配置：请设置 WECHAT_PAY_PRIVATE_KEY");
  return crypto.createSign("RSA-SHA256").update(message).end().sign(privateKey, "base64");
}

export function buildWechatMiniProgramPaymentParams(prepayId: string, now = new Date(), appId = getWechatMiniProgramAppId()): WechatMiniProgramPaymentParams {
  if (!appId) throw new Error("微信支付未配置：请设置 WECHAT_MINI_APP_ID");
  const cleanPrepayId = String(prepayId || "").trim();
  if (!cleanPrepayId) throw new Error("微信支付预支付单缺少 prepay_id");
  const timeStamp = Math.floor(now.getTime() / 1000).toString();
  const nonceStr = createNonce();
  const packageValue = `prepay_id=${cleanPrepayId}`;
  const paySign = signWechatMessage(`${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`);
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: "RSA",
    paySign,
  };
}

function buildWechatAuthorization(method: string, pathWithQuery: string, bodyText = ""): string {
  const mchid = getWechatMchId();
  const serialNo = String(process.env.WECHAT_PAY_SERIAL_NO || "").trim();
  if (!mchid || !serialNo) throw new Error("微信支付未配置：请设置 WECHAT_PAY_MCH_ID 和 WECHAT_PAY_SERIAL_NO");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = createNonce();
  const signature = signWechatMessage(`${method}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${bodyText}\n`);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

async function wechatRequest(method: "GET" | "POST", path: string, body?: Record<string, any>) {
  if (!hasWechatConfig()) {
    throw new Error("微信支付未配置：请设置商户号、AppID、API v3 密钥、证书序列号和商户私钥");
  }
  const bodyText = body ? JSON.stringify(body) : "";
  const response = await fetch(`${getWechatGateway()}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: buildWechatAuthorization(method, path, bodyText),
      ...(body ? { "Content-Type": "application/json" } : {}),
      "User-Agent": "xianfeng-billing/1.0",
    },
    ...(body ? { body: bodyText } : {}),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.message || data?.detail?.message || `微信支付请求失败 (${response.status})`);
  }
  return data;
}

function getWechatNotifyUrl(): string {
  return String(process.env.WECHAT_PAY_NOTIFY_URL || `${getApiBaseUrl()}/api/billing/wechat/notify`);
}

function getWechatPlatformPublicKey(): string {
  return readEnvOrFile(
    process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY,
    process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH || process.env.WECHAT_PAY_PLATFORM_CERT_PATH
  );
}

function headerValue(headers: Record<string, any>, name: string): string {
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return Array.isArray(direct) ? String(direct[0] || "") : String(direct || "");
}

function canSkipWechatNotifyVerify(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.WECHAT_PAY_SKIP_NOTIFY_VERIFY === "true";
}

export function verifyWechatNotifySignature(headers: Record<string, any>, rawBody: string): boolean {
  const publicKey = getWechatPlatformPublicKey();
  if (!publicKey) {
    if (canSkipWechatNotifyVerify()) return true;
    throw new Error("微信支付未配置平台公钥或平台证书，无法验签回调");
  }
  const expectedSerial = String(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID || "").trim();
  const notifySerial = headerValue(headers, "wechatpay-serial");
  if (expectedSerial && notifySerial && expectedSerial !== notifySerial) return false;
  const timestamp = headerValue(headers, "wechatpay-timestamp");
  const nonce = headerValue(headers, "wechatpay-nonce");
  const signature = headerValue(headers, "wechatpay-signature");
  if (!timestamp || !nonce || !signature) return false;
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  return crypto.createVerify("RSA-SHA256").update(message).end().verify(publicKey, signature, "base64");
}

export function decryptWechatResource(resource: any, apiV3Key = getWechatApiV3Key()) {
  if (!apiV3Key || Buffer.byteLength(apiV3Key) !== 32) {
    throw new Error("微信支付 API v3 密钥必须是 32 字节");
  }
  if (resource?.algorithm !== "AEAD_AES_256_GCM") {
    throw new Error("不支持的微信支付通知加密算法");
  }
  const ciphertext = Buffer.from(String(resource?.ciphertext || ""), "base64");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key), Buffer.from(String(resource?.nonce || "")));
  const aad = String(resource?.associated_data || "");
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted);
}

function assertWechatPaidOrderMatches(order: PaymentOrder, payload: any) {
  if (order.provider !== "wechat") throw new Error("微信通知订单 provider 不匹配");
  if (payload?.appid && !isWechatNotifyAppIdAllowed(payload.appid)) throw new Error("微信通知 appid 不匹配");
  if (payload?.mchid && payload.mchid !== getWechatMchId()) throw new Error("微信通知 mchid 不匹配");
  const total = Number(payload?.amount?.total);
  if (Number.isFinite(total) && total !== order.amountCents) throw new Error("微信通知金额不匹配");
}

export async function createAlipayCheckout(order: PaymentOrder): Promise<PaymentCheckout> {
  if (!hasAlipayConfig() && isMockPaymentEnabled()) {
    return {
      provider: "alipay",
      mode: "mock",
      mockPayUrl: `/api/billing/orders/${encodeURIComponent(String(order._id))}/mock-pay`,
      message: "当前环境未配置支付宝，已启用本地模拟支付。",
    };
  }
  const sdk = loadAlipaySdk();
  const returnUrl = `${getPublicBaseUrl()}/pro/success?orderId=${encodeURIComponent(String(order._id))}`;
  const notifyUrl = String(process.env.ALIPAY_NOTIFY_URL || `${getApiBaseUrl()}/api/billing/alipay/notify`);
  const bizContent = {
    out_trade_no: order.outTradeNo,
    product_code: "FAST_INSTANT_TRADE_PAY",
    subject: order.subject,
    body: "先疯Pro 会员服务",
    total_amount: orderAmount(order),
  };
  const paymentUrl = sdk.pageExecute("alipay.trade.page.pay", "GET", {
    bizContent,
    returnUrl,
    notifyUrl,
  });
  return { provider: "alipay", mode: "alipay_page", paymentUrl };
}

export function verifyAlipayNotify(body: Record<string, any>): boolean {
  const sdk = loadAlipaySdk();
  if (typeof sdk.checkNotifySign !== "function") {
    throw new Error("当前 alipay-sdk 不支持 checkNotifySign");
  }
  return sdk.checkNotifySign(body);
}

export async function handleAlipayNotify(body: Record<string, any>) {
  const verified = verifyAlipayNotify(body);
  if (!verified) {
    throw new Error("支付宝回调验签失败");
  }
  const outTradeNo = String(body.out_trade_no || "").trim();
  const tradeStatus = String(body.trade_status || "").trim();
  if (!outTradeNo) throw new Error("支付宝回调缺少 out_trade_no");
  if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
    return PaymentOrderModel.findOne({ outTradeNo });
  }
  return markOrderPaid({
    outTradeNo,
    providerTradeNo: String(body.trade_no || ""),
    paidAt: body.gmt_payment ? new Date(String(body.gmt_payment).replace(" ", "T")) : new Date(),
    rawNotify: body,
  });
}

export async function refundAlipayOrder(order: PaymentOrder, reason: string, amountCents = order.amountCents, refundablePoints = 0) {
  const sdk = loadAlipaySdk();
  const refund = await createRefundRecord(order, reason, amountCents);
  try {
    const result = await sdk.exec("alipay.trade.refund", {
      bizContent: {
        out_trade_no: order.outTradeNo,
        trade_no: order.providerTradeNo || undefined,
        refund_amount: amountText(amountCents),
        refund_reason: reason || "按未使用点数折算退款",
        out_request_no: refund.outRequestNo,
      },
    });
    const fundChange = String(result?.fund_change || result?.fundChange || "").toUpperCase();
    const ok = !fundChange || fundChange === "Y";
    if (!ok) {
      refund.status = "failed";
      refund.errorMessage = "支付宝退款未发生资金变化";
      refund.rawResult = result || {};
      await refund.save();
      throw new Error(refund.errorMessage);
    }
    return markRefundSucceeded(order, refund, result || {}, { refundablePoints });
  } catch (error: any) {
    refund.status = "failed";
    refund.errorMessage = error?.message || "支付宝退款失败";
    await refund.save();
    throw error;
  }
}

export async function createWechatCheckout(order: PaymentOrder): Promise<PaymentCheckout> {
  if (!hasWechatConfig() && isMockPaymentEnabled()) {
    return {
      provider: "wechat",
      mode: "mock",
      mockPayUrl: `/api/billing/orders/${encodeURIComponent(String(order._id))}/mock-pay`,
      message: "当前环境未配置微信支付，已启用本地模拟支付。",
    };
  }
  const data = await wechatRequest("POST", "/v3/pay/transactions/native", {
    appid: getWechatAppId(),
    mchid: getWechatMchId(),
    description: order.subject,
    out_trade_no: order.outTradeNo,
    notify_url: getWechatNotifyUrl(),
    amount: {
      total: order.amountCents,
      currency: "CNY",
    },
  });
  if (!data?.code_url) throw new Error("微信支付二维码生成失败");
  return { provider: "wechat", mode: "wechat_native", codeUrl: data.code_url };
}

export async function createWechatMiniProgramCheckout(order: PaymentOrder, openid?: string): Promise<PaymentCheckout> {
  if (!hasWechatConfig() && isMockPaymentEnabled()) {
    return {
      provider: "wechat",
      mode: "mock",
      mockPayUrl: `/api/billing/orders/${encodeURIComponent(String(order._id))}/mock-pay`,
      message: "当前环境未配置微信支付，已启用本地模拟支付。",
    };
  }
  const appId = getWechatMiniProgramAppId();
  if (!appId) throw new Error("微信支付未配置：请设置 WECHAT_MINI_APP_ID");
  const payerOpenid = String(openid || "").trim();
  if (!payerOpenid) throw new Error("当前账号未绑定微信 openid，请先使用微信登录");
  const data = await wechatRequest("POST", "/v3/pay/transactions/jsapi", {
    appid: appId,
    mchid: getWechatMchId(),
    description: order.subject,
    out_trade_no: order.outTradeNo,
    notify_url: getWechatNotifyUrl(),
    amount: {
      total: order.amountCents,
      currency: "CNY",
    },
    payer: {
      openid: payerOpenid,
    },
  });
  if (!data?.prepay_id) throw new Error("微信支付预支付单生成失败");
  return {
    provider: "wechat",
    mode: "wechat_jsapi",
    paymentParams: buildWechatMiniProgramPaymentParams(data.prepay_id, new Date(), appId),
  };
}

export async function handleWechatNotify(body: Record<string, any>, headers: Record<string, any>, rawBody = JSON.stringify(body || {})) {
  const verified = verifyWechatNotifySignature(headers, rawBody);
  if (!verified) throw new Error("微信支付回调验签失败");

  const payload = decryptWechatResource(body?.resource);
  const outTradeNo = String(payload?.out_trade_no || "").trim();
  if (!outTradeNo) throw new Error("微信支付回调缺少 out_trade_no");
  const order = await PaymentOrderModel.findOne({ outTradeNo });
  if (!order) throw new Error("订单不存在");
  if (String(payload?.trade_state || "").toUpperCase() !== "SUCCESS") return order;

  assertWechatPaidOrderMatches(order, payload);
  return markOrderPaid({
    outTradeNo,
    providerTradeNo: String(payload?.transaction_id || ""),
    paidAt: payload?.success_time ? new Date(String(payload.success_time)) : new Date(),
    rawNotify: payload,
  });
}

export async function queryWechatOrderByOutTradeNo(outTradeNo: string) {
  const normalizedOutTradeNo = String(outTradeNo || "").trim();
  if (!normalizedOutTradeNo) throw new Error("微信查单缺少 out_trade_no");
  const pathWithQuery = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(normalizedOutTradeNo)}?mchid=${encodeURIComponent(getWechatMchId())}`;
  return wechatRequest("GET", pathWithQuery);
}

export async function syncWechatPaidOrder(order: PaymentOrder) {
  if (order.provider !== "wechat" || order.status !== "pending") return order;
  const payload = await queryWechatOrderByOutTradeNo(order.outTradeNo);
  if (String(payload?.trade_state || "").toUpperCase() !== "SUCCESS") return order;

  assertWechatPaidOrderMatches(order, payload);
  return markOrderPaid({
    outTradeNo: order.outTradeNo,
    providerTradeNo: String(payload?.transaction_id || ""),
    paidAt: payload?.success_time ? new Date(String(payload.success_time)) : new Date(),
    rawNotify: { ...payload, source: "wechat-query" },
  });
}

export async function refundWechatOrder(order: PaymentOrder, reason: string, amountCents = order.amountCents, refundablePoints = 0) {
  const refund = await createRefundRecord(order, reason, amountCents);
  try {
    const result = await wechatRequest("POST", "/v3/refund/domestic/refunds", {
      out_trade_no: order.outTradeNo,
      out_refund_no: refund.outRequestNo,
      reason: reason || "按未使用点数折算退款",
      amount: {
        refund: amountCents,
        total: order.amountCents,
        currency: "CNY",
      },
    });
    const status = String(result?.status || "").toUpperCase();
    if (status && status !== "SUCCESS") {
      refund.status = "failed";
      refund.errorMessage = `微信退款${status === "PROCESSING" ? "处理中，请稍后重试" : "未成功"}`;
      refund.rawResult = result || {};
      await refund.save();
      throw new Error(refund.errorMessage);
    }
    return markRefundSucceeded(order, refund, result || {}, { refundablePoints });
  } catch (error: any) {
    const message = error?.message || "微信退款失败";
    if (/订单已全额退款|already.*refund/i.test(message)) {
      return markRefundSucceeded(order, refund, { source: "wechat-refund-idempotent", message }, { refundablePoints });
    }
    refund.status = "failed";
    refund.errorMessage = message;
    await refund.save();
    throw error;
  }
}
