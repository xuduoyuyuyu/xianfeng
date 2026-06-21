import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./LoginRequiredModal.tsx", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../utils/mpAuthBridge.ts", import.meta.url), "utf8");

test("login modal uses native mini program login inside xf_mp web-view", () => {
  assert.match(source, /isMiniProgramWebView/);
  assert.match(source, /openMiniProgramNativeLogin/);
  assert.match(source, /miniProgramWebView \? \(/);
  assert.match(source, /微信一键登录/);
  assert.match(source, /使用小程序微信身份登录/);
});

test("mini program login bridge navigates to the native login page with current web URL", () => {
  assert.match(bridge, /export function isMiniProgramWebView/);
  assert.match(bridge, /export function openMiniProgramNativeLogin/);
  assert.match(bridge, /window\.wx\?\.miniProgram\?\.navigateTo/);
  assert.match(bridge, /\/pages\/login\/index\?redirect=/);
  assert.match(bridge, /encodeURIComponent\(window\.location\.href\)/);
});
