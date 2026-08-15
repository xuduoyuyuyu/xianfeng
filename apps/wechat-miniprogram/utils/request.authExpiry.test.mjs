import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("auth expiry notifications are deduplicated until resolved", () => {
  const { notifyAuthExpired, resolveAuthExpired, subscribeAuthExpired } = require("./authExpiry.js");
  resolveAuthExpired();
  let calls = 0;
  const unsubscribe = subscribeAuthExpired(() => {
    calls += 1;
  });

  notifyAuthExpired();
  notifyAuthExpired();
  assert.equal(calls, 1);

  resolveAuthExpired();
  notifyAuthExpired();
  assert.equal(calls, 2);

  unsubscribe();
  resolveAuthExpired();
});

test("native request clears the session and notifies listeners on 401", async () => {
  const originalWx = global.wx;
  const removed = [];
  global.wx = {
    getStorageSync() {
      return "expired-token";
    },
    removeStorageSync(key) {
      removed.push(key);
    },
    request(options) {
      options.success({ statusCode: 401, data: { message: "未登录或登录已过期" } });
    }
  };

  const { resolveAuthExpired, subscribeAuthExpired } = require("./authExpiry.js");
  const { request } = require("./request.js");
  resolveAuthExpired();
  let calls = 0;
  const unsubscribe = subscribeAuthExpired(() => {
    calls += 1;
  });

  try {
    await assert.rejects(request({ url: "/api/protected" }), (error) => error.statusCode === 401);
    assert.deepEqual(removed, ["xf_token", "xf_user"]);
    assert.equal(calls, 1);
  } finally {
    unsubscribe();
    resolveAuthExpired();
    global.wx = originalWx;
  }
});

test("public requests neither attach a token nor clear the session on 401", async () => {
  const originalWx = global.wx;
  const removed = [];
  let authorization;
  global.wx = {
    getStorageSync() {
      return "local-dev-token";
    },
    removeStorageSync(key) {
      removed.push(key);
    },
    request(options) {
      authorization = options.header.Authorization;
      options.success({ statusCode: 401, data: { message: "未登录" } });
    }
  };

  const { request } = require("./request.js");
  try {
    await assert.rejects(
      request({ url: "https://xianfeng.xinzhi.info/api/flash-tests/pronunciation", auth: false }),
      (error) => error.statusCode === 401
    );
    assert.equal(authorization, undefined);
    assert.deepEqual(removed, []);
  } finally {
    global.wx = originalWx;
  }
});

test("a listener subscribing after auth expiry receives the pending login request", () => {
  const { notifyAuthExpired, resolveAuthExpired, subscribeAuthExpired } = require("./authExpiry.js");
  resolveAuthExpired();
  notifyAuthExpired();
  let calls = 0;

  const unsubscribe = subscribeAuthExpired(() => {
    calls += 1;
  });

  assert.equal(calls, 1);
  unsubscribe();
  resolveAuthExpired();
});
