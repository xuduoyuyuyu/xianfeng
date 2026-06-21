import crypto from "crypto";
import fs from "fs";

const SMS_ENDPOINT = process.env.VOLCENGINE_SMS_ENDPOINT || "https://sms.volcengineapi.com";
const SMS_ACTION = "SendSms";
const SMS_VERSION = process.env.VOLCENGINE_SMS_VERSION || "2020-01-01";
const SMS_REGION = process.env.VOLCENGINE_SMS_REGION || "cn-north-1";
const SMS_SERVICE = process.env.VOLCENGINE_SMS_SERVICE || "volcSMS";
const SMS_TIMEOUT_MS = Number(process.env.VOLCENGINE_SMS_TIMEOUT_MS || 8000);

type SendSmsResult = { ok: true; requestId?: string } | { ok: false; error: string; code?: string };

function appendSmsDebugLog(payload: Record<string, any>) {
  try {
    const line = `${new Date().toISOString()} ${JSON.stringify(payload)}\n`;
    fs.appendFileSync("/tmp/xf_sms_debug.log", line);
  } catch {
    // ignore
  }
}

function hmac(key: crypto.BinaryLike, msg: string): Buffer {
  return crypto.createHmac("sha256", key).update(msg).digest();
}

function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function formatDate(date: Date): { date: string; datetime: string } {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return { date: `${y}${m}${d}`, datetime: `${y}${m}${d}T${hh}${mm}${ss}Z` };
}

function buildCanonicalQuery(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join("&");
}

function buildAuthorization(params: {
  method: string;
  pathname: string;
  host: string;
  query: Record<string, string>;
  payload: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
}) {
  const { date, datetime } = formatDate(params.now);
  const canonicalQuery = buildCanonicalQuery(params.query);
  const payloadHash = sha256Hex(params.payload);
  const canonicalHeaders = `content-type:application/json\nhost:${params.host}\nx-content-sha256:${payloadHash}\nx-date:${datetime}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = [
    params.method.toUpperCase(),
    params.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${date}/${SMS_REGION}/${SMS_SERVICE}/request`;
  const stringToSign = `HMAC-SHA256\n${datetime}\n${scope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmac(params.secretAccessKey, date);
  const kRegion = hmac(kDate, SMS_REGION);
  const kService = hmac(kRegion, SMS_SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization = `HMAC-SHA256 Credential=${params.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, datetime, payloadHash, canonicalQuery };
}

function buildPayload(args: {
  mobile: string;
  code: string;
  smsAccount: string;
  signName: string;
  templateId: string;
}): Record<string, string> {
  const payload: Record<string, string> = {
    SmsAccount: args.smsAccount,
    Sign: args.signName,
    TemplateID: args.templateId,
    PhoneNumbers: args.mobile,
  };

  // TemplateParam only when template variables are enabled.
  const withTemplateParam = process.env.VOLCENGINE_SMS_WITH_TEMPLATE_PARAM !== "false";
  if (withTemplateParam) {
    const paramKey = (process.env.VOLCENGINE_SMS_TEMPLATE_PARAM_KEY || "xxxx").trim() || "xxxx";
    payload.TemplateParam = JSON.stringify({ [paramKey]: args.code });
  }

  return payload;
}

export async function sendMobileCodeByVolcengine(args: {
  mobile: string;
  code: string;
}): Promise<SendSmsResult> {
  const accessKeyId = process.env.VOLCENGINE_SMS_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.VOLCENGINE_SMS_SECRET_ACCESS_KEY || "";
  const templateId = process.env.VOLCENGINE_SMS_TEMPLATE_ID || "";
  const signName = process.env.VOLCENGINE_SMS_SIGN_NAME || "";

  const smsAccounts = Array.from(
    new Set(
      [
        process.env.VOLCENGINE_SMS_ACCOUNT || "",
        ...((process.env.VOLCENGINE_SMS_MULTI_ACCOUNT === "true"
          ? (process.env.VOLCENGINE_SMS_ACCOUNT_CANDIDATES || "").split(",")
          : [])),
      ]
        .map((v) => v.trim())
        .filter(Boolean)
    )
  );

  const missing: string[] = [];
  if (!accessKeyId) missing.push("VOLCENGINE_SMS_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("VOLCENGINE_SMS_SECRET_ACCESS_KEY");
  if (!templateId) missing.push("VOLCENGINE_SMS_TEMPLATE_ID");
  if (!signName) missing.push("VOLCENGINE_SMS_SIGN_NAME");
  if (smsAccounts.length === 0) missing.push("VOLCENGINE_SMS_ACCOUNT");
  if (missing.length > 0) {
    return { ok: false, error: `短信服务未配置完整，缺少：${missing.join("、")}` };
  }

  const endpoint = new URL(SMS_ENDPOINT);
  const pathname = endpoint.pathname || "/";
  const host = endpoint.host;

  appendSmsDebugLog({
    type: "config",
    action: SMS_ACTION,
    version: SMS_VERSION,
    service: SMS_SERVICE,
    hasTemplateParam: process.env.VOLCENGINE_SMS_WITH_TEMPLATE_PARAM !== "false",
    smsAccounts,
    templateId,
    signName,
  });

  let lastError: SendSmsResult = { ok: false, error: "短信发送失败" };

  for (const smsAccount of smsAccounts) {
    const body = buildPayload({ ...args, smsAccount, signName, templateId });
    const payload = JSON.stringify(body);
    const query = { Action: SMS_ACTION, Version: SMS_VERSION };
    const signed = buildAuthorization({
      method: "POST",
      pathname,
      host,
      query,
      payload,
      accessKeyId,
      secretAccessKey,
      now: new Date(),
    });

    const requestUrl = `${endpoint.origin}${pathname}?${signed.canonicalQuery}`;

    try {
      const resp = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host,
          "x-date": signed.datetime,
          "x-content-sha256": signed.payloadHash,
          Authorization: signed.authorization,
        },
        body: payload,
        signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
      });

      const data = await resp.json().catch(() => ({}));
      const apiErr = data?.ResponseMetadata?.Error;
      const code = apiErr?.Code || data?.Result?.Code || data?.code;
      const message = apiErr?.Message || data?.Result?.Message || data?.message || "短信发送失败";

      if (!resp.ok || code) {
        appendSmsDebugLog({ type: "api-error", smsAccount, code, message, bodyKeys: Object.keys(body) });
        lastError = { ok: false, code, error: message };
        continue;
      }

      appendSmsDebugLog({ type: "success", smsAccount, requestId: data?.ResponseMetadata?.RequestId });
      return { ok: true, requestId: data?.ResponseMetadata?.RequestId };
    } catch (error) {
      const msg = String((error as Error)?.message || error);
      appendSmsDebugLog({ type: "network-error", smsAccount, message: msg });
      lastError = { ok: false, error: msg.includes("timeout") ? "短信服务网络超时，请稍后重试" : `短信服务网络异常: ${msg}` };
    }
  }

  return lastError;
}
