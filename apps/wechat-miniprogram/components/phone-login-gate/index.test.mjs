import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const componentPath = require.resolve("./index.js");
const requestPath = require.resolve("../../utils/request.js");
const sessionPath = require.resolve("../../utils/session.js");
const authExpiryPath = require.resolve("../../utils/authExpiry.js");

test("shared phone login gate saves the session and emits success", async () => {
  const originalComponent = global.Component;
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const calls = [];
  const saved = [];
  let resolved = 0;
  let definition;

  require.cache[requestPath] = { exports: { request: async (options) => {
    calls.push(options);
    return { token: "token-1", user: { _id: "user-1" } };
  } } };
  require.cache[sessionPath] = { exports: { setSession: (payload) => saved.push(payload) } };
  require.cache[authExpiryPath] = { exports: { resolveAuthExpired: () => { resolved += 1; } } };
  global.Component = (value) => { definition = value; };
  global.wx = { login: ({ success }) => success({ code: "wx-code" }) };
  global.getApp = () => ({ setLoginSession() {} });

  try {
    delete require.cache[componentPath];
    require(componentPath);
    const events = [];
    const context = {
      data: { bindingPhone: false },
      setData(patch) { Object.assign(this.data, patch); },
      triggerEvent(name, detail) { events.push({ name, detail }); }
    };

    definition.methods.loginWithPhone.call(context, { detail: { code: "phone-code" } });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(calls, [{ method: "POST", url: "/api/wechat-mini/login", data: { code: "wx-code", phoneCode: "phone-code" } }]);
    assert.equal(saved[0].token, "token-1");
    assert.equal(resolved, 1);
    assert.deepEqual(events, [{ name: "success", detail: { session: saved[0] } }]);
  } finally {
    delete require.cache[componentPath];
    delete require.cache[requestPath];
    delete require.cache[sessionPath];
    delete require.cache[authExpiryPath];
    global.Component = originalComponent;
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});

test("shared phone login gate owns the only phone authorization button", () => {
  const wxml = readFileSync(new URL("index.wxml", import.meta.url), "utf8");
  assert.equal((wxml.match(/open-type="getPhoneNumber"/g) || []).length, 1);
  assert.match(wxml, /bindgetphonenumber="loginWithPhone"/);
  assert.match(wxml, /wx:if="\{\{visible\}\}"/);
});

test("shared phone login gate emits failure when phone authorization is rejected", () => {
  const originalComponent = global.Component;
  let definition;
  global.Component = (value) => { definition = value; };
  try {
    delete require.cache[componentPath];
    require(componentPath);
    const events = [];
    const context = {
      data: { bindingPhone: false },
      setData(patch) { Object.assign(this.data, patch); },
      triggerEvent(name, detail) { events.push({ name, detail }); }
    };
    definition.methods.loginWithPhone.call(context, { detail: {} });
    assert.deepEqual(events, [{ name: "failure", detail: { message: "需要授权手机号后登录", reason: "phone-denied" } }]);
  } finally {
    delete require.cache[componentPath];
    global.Component = originalComponent;
  }
});
