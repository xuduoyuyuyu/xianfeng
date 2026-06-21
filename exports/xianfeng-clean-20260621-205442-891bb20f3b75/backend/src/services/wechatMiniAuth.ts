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

export function signUserJwt(user: { _id: unknown; role: string }) {
  const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];
  return jwt.sign(
    { id: user._id, role: user.role },
    (process.env.JWT_SECRET || "your-secret-key") as jwt.Secret,
    { expiresIn }
  );
}
