import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("buildUrl joins API origin with relative paths", () => {
  global.wx = { getStorageSync: () => "" };
  const { API_ORIGIN } = require("./config.js");
  const { buildUrl } = require("./request.js");

  assert.equal(buildUrl("/api/wechat-mini/login"), `${API_ORIGIN}/api/wechat-mini/login`);
});

test("request failure exposes the attempted URL for domain-list debugging", async () => {
  global.wx = {
    getStorageSync: () => "",
    request(options) {
      options.fail({ errMsg: "request:fail url not in domain list" });
    }
  };
  const { API_ORIGIN } = require("./config.js");
  const { request } = require("./request.js");

  await assert.rejects(
    () => request({ method: "POST", url: "/api/wechat-mini/login" }),
    (error) => {
      assert.equal(error.message, "request:fail url not in domain list");
      assert.equal(error.url, `${API_ORIGIN}/api/wechat-mini/login`);
      return true;
    }
  );
});

test("request HTTP errors also expose the attempted URL", async () => {
  global.wx = {
    getStorageSync: () => "",
    request(options) {
      options.success({ statusCode: 403, data: { message: "无权限访问管理接口" } });
    }
  };
  const { API_ORIGIN } = require("./config.js");
  const { request } = require("./request.js");

  await assert.rejects(
    () => request({ method: "POST", url: "/api/wechat-mini/xiaowanzi/attachments/recognize" }),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.message, "无权限访问管理接口");
      assert.equal(error.url, `${API_ORIGIN}/api/wechat-mini/xiaowanzi/attachments/recognize`);
      return true;
    }
  );
});

test("request HTTP errors preserve tutorbot content messages", async () => {
  global.wx = {
    getStorageSync: () => "",
    request(options) {
      options.success({ statusCode: 502, data: { type: "error", content: "⚠️ 小玩子调用失败：上游调用失败(deepseek/deepseek-v4-flash): 401 invalid api key" } });
    }
  };
  const { API_ORIGIN } = require("./config.js");
  const { request } = require("./request.js");

  await assert.rejects(
    () => request({ method: "POST", url: "/api/v1/tutorbot/xiaowanzi_debug_bot/messages" }),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.message, "⚠️ 小玩子调用失败：上游调用失败(deepseek/deepseek-v4-flash): 401 invalid api key");
      assert.equal(error.url, `${API_ORIGIN}/api/v1/tutorbot/xiaowanzi_debug_bot/messages`);
      return true;
    }
  );
});
