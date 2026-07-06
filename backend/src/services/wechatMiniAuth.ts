import jwt from "jsonwebtoken";

export type WechatMiniSession = {
  openid: string;
  unionid?: string;
  sessionKey?: string;
};

export function getWechatMiniConfig() {
  return {
    appId: String(process.env.WECHAT_MINI_APP_ID || "").trim(),
    appSecret: String(process.env.WECHAT_MINI_APP_SECRET || "").trim(),
  };
}

export function buildJscode2SessionUrl(code: string, appId: string, appSecret: string): string {
  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    js_code: code,
    grant_type: "authorization_code",
  });
  return `https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`;
}

export function buildAccessTokenUrl(): string {
  return "https://api.weixin.qq.com/cgi-bin/stable_token";
}

export function buildAccessTokenRequestBody(appId: string, appSecret: string, forceRefresh = false) {
  return {
    grant_type: "client_credential",
    appid: appId,
    secret: appSecret,
    force_refresh: forceRefresh,
  };
}

export function buildGetPhoneNumberUrl(accessToken: string): string {
  const params = new URLSearchParams({ access_token: accessToken });
  return `https://api.weixin.qq.com/wxa/business/getuserphonenumber?${params.toString()}`;
}

export function buildUnlimitedQRCodeUrl(accessToken: string): string {
  const params = new URLSearchParams({ access_token: accessToken });
  return `https://api.weixin.qq.com/wxa/getwxacodeunlimit?${params.toString()}`;
}

export function buildUnlimitedQRCodeRequestBody(options: {
  scene: string;
  page?: string;
  width?: number;
  envVersion?: string;
  checkPath?: boolean;
}) {
  return {
    scene: String(options.scene || "").trim(),
    page: String(options.page || "pages/share/index").trim(),
    width: Number(options.width || 280),
    env_version: String(options.envVersion || process.env.WECHAT_MINI_QRCODE_ENV || "release").trim(),
    check_path: options.checkPath !== false,
  };
}

export function isWechatAccessTokenInvalid(payload: any): boolean {
  const errcode = Number(payload?.errcode || 0);
  const errmsg = String(payload?.errmsg || "");
  return [40001, 40014, 42001].includes(errcode) || /access_token.*(invalid|not latest)/i.test(errmsg);
}

function getWechatPhoneNumberErrorMessage(payload: any): string {
  if (isWechatAccessTokenInvalid(payload)) {
    return "微信手机号授权已刷新，请重新点击授权";
  }
  return "微信手机号授权失败，请重新授权";
}

export function parseWechatMiniSession(payload: any): WechatMiniSession {
  if (payload?.errcode) {
    throw new Error(payload.errmsg || `微信登录失败：${payload.errcode}`);
  }
  const openid = String(payload?.openid || "").trim();
  if (!openid) {
    throw new Error("微信登录失败：未返回 openid");
  }
  return {
    openid,
    unionid: payload?.unionid ? String(payload.unionid) : undefined,
    sessionKey: payload?.session_key ? String(payload.session_key) : undefined,
  };
}

export function parseWechatMiniPhoneNumber(payload: any): string {
  if (payload?.errcode) {
    throw new Error(getWechatPhoneNumberErrorMessage(payload));
  }
  const phoneInfo = payload?.phone_info || payload?.phoneInfo || {};
  const rawPhone = String(phoneInfo.purePhoneNumber || phoneInfo.phoneNumber || "").trim();
  const phone = rawPhone.startsWith("+86") ? rawPhone.slice(3) : rawPhone;
  if (!/^1\d{10}$/.test(phone)) {
    throw new Error("微信手机号授权失败：未返回手机号");
  }
  return phone;
}

export async function fetchWechatMiniSession(code: string): Promise<WechatMiniSession> {
  const { appId, appSecret } = getWechatMiniConfig();
  if (!appId || !appSecret) {
    throw new Error("微信小程序未配置：请设置 WECHAT_MINI_APP_ID 和 WECHAT_MINI_APP_SECRET");
  }
  const url = buildJscode2SessionUrl(code, appId, appSecret);
  const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.errmsg || "微信登录服务暂不可用");
  }
  return parseWechatMiniSession(payload);
}

let accessTokenCache: { token: string; expiresAt: number } = { token: "", expiresAt: 0 };

export function clearWechatMiniAccessTokenCache() {
  accessTokenCache = { token: "", expiresAt: 0 };
}

export async function fetchWechatMiniAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
  if (!options.forceRefresh && accessTokenCache.token && accessTokenCache.expiresAt > Date.now() + 60_000) {
    return accessTokenCache.token;
  }
  const { appId, appSecret } = getWechatMiniConfig();
  if (!appId || !appSecret) {
    throw new Error("微信小程序未配置：请设置 WECHAT_MINI_APP_ID 和 WECHAT_MINI_APP_SECRET");
  }
  const response = await fetch(buildAccessTokenUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildAccessTokenRequestBody(appId, appSecret, Boolean(options.forceRefresh))),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errcode) {
    throw new Error("微信手机号授权服务暂不可用，请稍后重试");
  }
  const token = String(payload?.access_token || "").trim();
  if (!token) {
    throw new Error("微信手机号授权失败：未返回 access_token");
  }
  const expiresIn = Math.max(60, Number(payload?.expires_in || 7200) - 60);
  accessTokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export async function fetchWechatMiniPhoneNumber(code: string): Promise<string> {
  const phoneCode = String(code || "").trim();
  if (!phoneCode) {
    throw new Error("请授权手机号登录");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await fetchWechatMiniAccessToken({ forceRefresh: attempt > 0 });
    const response = await fetch(buildGetPhoneNumberUrl(accessToken), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: phoneCode }),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error("微信手机号授权服务暂不可用，请稍后重试");
    }
    if (payload?.errcode && isWechatAccessTokenInvalid(payload) && attempt === 0) {
      clearWechatMiniAccessTokenCache();
      continue;
    }
    return parseWechatMiniPhoneNumber(payload);
  }

  throw new Error("微信手机号授权失败，请重新授权");
}

export async function fetchWechatMiniUnlimitedQRCode(options: {
  scene: string;
  page?: string;
  width?: number;
  envVersion?: string;
  checkPath?: boolean;
}): Promise<Buffer> {
  const scene = String(options.scene || "").trim();
  if (!scene) throw new Error("缺少小程序码 scene");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await fetchWechatMiniAccessToken({ forceRefresh: attempt > 0 });
    const response = await fetch(buildUnlimitedQRCodeUrl(accessToken), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildUnlimitedQRCodeRequestBody(options)),
      signal: AbortSignal.timeout(8000),
    });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = String(response.headers.get("content-type") || "");
    const looksJson = contentType.includes("application/json") || buffer.subarray(0, 1).toString("utf8") === "{";
    if (!looksJson && response.ok && buffer.length > 0) return buffer;

    let payload: any = {};
    try {
      payload = JSON.parse(buffer.toString("utf8"));
    } catch (_error) {}
    if (payload?.errcode && isWechatAccessTokenInvalid(payload) && attempt === 0) {
      clearWechatMiniAccessTokenCache();
      continue;
    }
    throw new Error(payload?.errmsg || "生成小程序码失败");
  }

  throw new Error("生成小程序码失败");
}

export function signUserJwt(user: { _id: unknown; role: string }) {
  const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];
  return jwt.sign(
    { id: user._id, role: user.role },
    (process.env.JWT_SECRET || "your-secret-key") as jwt.Secret,
    { expiresIn }
  );
}
