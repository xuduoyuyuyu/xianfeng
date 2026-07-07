import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  buildAccessTokenRequestBody,
  buildAccessTokenUrl,
  buildGetPhoneNumberUrl,
  buildUnlimitedQRCodeRequestBody,
  buildUnlimitedQRCodeUrl,
  buildJscode2SessionUrl,
  clearWechatMiniAccessTokenCache,
  fetchWechatMiniPhoneNumber,
  fetchWechatMiniUnlimitedQRCode,
  isWechatAccessTokenInvalid,
  parseWechatMiniPhoneNumber,
  parseWechatMiniSession,
} from "./wechatMiniAuth";

const originalFetch = globalThis.fetch;
const originalAppId = process.env.WECHAT_MINI_APP_ID;
const originalAppSecret = process.env.WECHAT_MINI_APP_SECRET;
const originalQrEnv = process.env.WECHAT_MINI_QRCODE_ENV;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  clearWechatMiniAccessTokenCache();
  globalThis.fetch = originalFetch;
  if (originalAppId === undefined) delete process.env.WECHAT_MINI_APP_ID;
  else process.env.WECHAT_MINI_APP_ID = originalAppId;
  if (originalAppSecret === undefined) delete process.env.WECHAT_MINI_APP_SECRET;
  else process.env.WECHAT_MINI_APP_SECRET = originalAppSecret;
  if (originalQrEnv === undefined) delete process.env.WECHAT_MINI_QRCODE_ENV;
  else process.env.WECHAT_MINI_QRCODE_ENV = originalQrEnv;
});

test("buildJscode2SessionUrl encodes required WeChat login parameters", () => {
  const url = new URL(buildJscode2SessionUrl("code value", "appid", "secret value"));

  assert.equal(url.origin + url.pathname, "https://api.weixin.qq.com/sns/jscode2session");
  assert.equal(url.searchParams.get("appid"), "appid");
  assert.equal(url.searchParams.get("secret"), "secret value");
  assert.equal(url.searchParams.get("js_code"), "code value");
  assert.equal(url.searchParams.get("grant_type"), "authorization_code");
});

test("parseWechatMiniSession returns openid, unionid and session key", () => {
  assert.deepEqual(
    parseWechatMiniSession({
      openid: "openid-1",
      unionid: "union-1",
      session_key: "session-key-1",
    }),
    {
      openid: "openid-1",
      unionid: "union-1",
      sessionKey: "session-key-1",
    }
  );
});

test("parseWechatMiniSession rejects WeChat error payloads", () => {
  assert.throws(
    () => parseWechatMiniSession({ errcode: 40029, errmsg: "invalid code" }),
    /invalid code/
  );
});

test("parseWechatMiniSession rejects missing openid", () => {
  assert.throws(
    () => parseWechatMiniSession({ session_key: "session-key" }),
    /未返回 openid/
  );
});

test("buildGetPhoneNumberUrl encodes the WeChat access token", () => {
  const url = new URL(buildGetPhoneNumberUrl("token value"));

  assert.equal(url.origin + url.pathname, "https://api.weixin.qq.com/wxa/business/getuserphonenumber");
  assert.equal(url.searchParams.get("access_token"), "token value");
});

test("buildUnlimitedQRCodeUrl and body encode current mini-program topic scene", () => {
  delete process.env.WECHAT_MINI_QRCODE_ENV;
  const url = new URL(buildUnlimitedQRCodeUrl("token value"));

  assert.equal(url.origin + url.pathname, "https://api.weixin.qq.com/wxa/getwxacodeunlimit");
  assert.equal(url.searchParams.get("access_token"), "token value");
  assert.deepEqual(buildUnlimitedQRCodeRequestBody({
    scene: "t=507f1f77bcf86cd799439011",
    page: "pages/share/index",
    width: 280,
  }), {
    scene: "t=507f1f77bcf86cd799439011",
    page: "pages/share/index",
    width: 280,
    env_version: "release",
    check_path: true,
  });
});

test("buildUnlimitedQRCodeRequestBody honors an explicit mini-program env version", () => {
  const body = buildUnlimitedQRCodeRequestBody({
    scene: "s=507f1f77bcf86cd799439011",
    page: "pages/share/index",
    width: 280,
    envVersion: "develop",
    checkPath: false,
    isHyaline: true,
  });
  assert.equal(body.env_version, "develop");
  assert.equal(body.check_path, false);
  assert.equal(body.is_hyaline, true);
});

test("fetchWechatMiniUnlimitedQRCode returns binary mini-program code image", async () => {
  process.env.WECHAT_MINI_APP_ID = "appid";
  process.env.WECHAT_MINI_APP_SECRET = "secret";
  delete process.env.WECHAT_MINI_QRCODE_ENV;
  const calls: Array<{ url: string; method?: string; body?: any }> = [];
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url === buildAccessTokenUrl()) {
      return jsonResponse({ access_token: "token-1", expires_in: 7200 });
    }
    if (url === buildUnlimitedQRCodeUrl("token-1")) {
      return new Response(pngBytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    return jsonResponse({ errcode: -1, errmsg: "unexpected request" }, 500);
  }) as typeof fetch;

  const buffer = await fetchWechatMiniUnlimitedQRCode({
    scene: "t=507f1f77bcf86cd799439011",
    page: "pages/share/index",
    width: 280,
  });

  assert.deepEqual([...buffer], [...pngBytes]);
  assert.deepEqual(calls.map((call) => call.url), [
    buildAccessTokenUrl(),
    buildUnlimitedQRCodeUrl("token-1"),
  ]);
  assert.deepEqual(calls[1].body, {
    scene: "t=507f1f77bcf86cd799439011",
    page: "pages/share/index",
    width: 280,
    env_version: "release",
    check_path: true,
  });
});

test("buildAccessTokenUrl uses the stable WeChat token endpoint", () => {
  assert.equal(buildAccessTokenUrl(), "https://api.weixin.qq.com/cgi-bin/stable_token");
  assert.deepEqual(buildAccessTokenRequestBody("appid", "secret", true), {
    grant_type: "client_credential",
    appid: "appid",
    secret: "secret",
    force_refresh: true,
  });
});

test("parseWechatMiniPhoneNumber returns the authorized phone number", () => {
  assert.equal(
    parseWechatMiniPhoneNumber({
      errcode: 0,
      phone_info: {
        phoneNumber: "13800138000",
        purePhoneNumber: "13800138000",
        countryCode: "86",
      },
    }),
    "13800138000"
  );
});

test("parseWechatMiniPhoneNumber rejects missing phone info", () => {
  assert.throws(
    () => parseWechatMiniPhoneNumber({ errcode: 0, phone_info: {} }),
    /未返回手机号/
  );
});

test("parseWechatMiniPhoneNumber hides raw WeChat access token errors", () => {
  assert.throws(
    () => parseWechatMiniPhoneNumber({
      errcode: 40001,
      errmsg: "invalid credential, access_token is invalid or not latest",
    }),
    (error: any) => {
      assert.match(error.message, /微信手机号授权已刷新/);
      assert.doesNotMatch(error.message, /invalid credential|access_token|mmbizurl/);
      return true;
    }
  );
  assert.equal(
    isWechatAccessTokenInvalid({ errmsg: "invalid credential, access_token is invalid or not latest" }),
    true
  );
});

test("fetchWechatMiniPhoneNumber refreshes access token once when WeChat reports it is stale", async () => {
  process.env.WECHAT_MINI_APP_ID = "appid";
  process.env.WECHAT_MINI_APP_SECRET = "secret";
  const calls: Array<{ url: string; method?: string; body?: any }> = [];
  let stableTokenCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url === buildAccessTokenUrl()) {
      stableTokenCalls += 1;
      return jsonResponse({
        access_token: stableTokenCalls === 1 ? "stale-token" : "fresh-token",
        expires_in: 7200,
      });
    }
    if (url === buildGetPhoneNumberUrl("stale-token")) {
      return jsonResponse({
        errcode: 40001,
        errmsg: "invalid credential, access_token is invalid or not latest",
      });
    }
    if (url === buildGetPhoneNumberUrl("fresh-token")) {
      return jsonResponse({
        errcode: 0,
        phone_info: { purePhoneNumber: "13800138000" },
      });
    }
    return jsonResponse({ errcode: -1, errmsg: "unexpected request" }, 500);
  }) as typeof fetch;

  const phone = await fetchWechatMiniPhoneNumber("phone-code");

  assert.equal(phone, "13800138000");
  assert.deepEqual(
    calls.filter((call) => call.url === buildAccessTokenUrl()).map((call) => call.body.force_refresh),
    [false, true]
  );
  assert.deepEqual(
    calls.filter((call) => call.url.startsWith("https://api.weixin.qq.com/wxa/business/getuserphonenumber")).map((call) => new URL(call.url).searchParams.get("access_token")),
    ["stale-token", "fresh-token"]
  );
});
