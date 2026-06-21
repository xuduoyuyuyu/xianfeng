import assert from "node:assert/strict";
import test from "node:test";
import { buildJscode2SessionUrl, parseWechatMiniSession } from "./wechatMiniAuth";

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
