import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("buildUrl joins API origin with relative paths", () => {
  global.wx = { getStorageSync: () => "" };
  const { buildUrl } = require("./request.js");

  assert.equal(buildUrl("/api/wechat-mini/login"), "https://xianfeng.xinzhi.info/api/wechat-mini/login");
});

test("request failure exposes the attempted URL for domain-list debugging", async () => {
  global.wx = {
    getStorageSync: () => "",
    request(options) {
      options.fail({ errMsg: "request:fail url not in domain list" });
    }
  };
  const { request } = require("./request.js");

  await assert.rejects(
    () => request({ method: "POST", url: "/api/wechat-mini/login" }),
    (error) => {
      assert.equal(error.message, "request:fail url not in domain list");
      assert.equal(error.url, "https://xianfeng.xinzhi.info/api/wechat-mini/login");
      return true;
    }
  );
});
