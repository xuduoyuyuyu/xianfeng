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

test("mini program login bridge opens the current native webview auth gate with current web URL", () => {
  assert.match(bridge, /export function isMiniProgramWebView/);
  assert.match(bridge, /export async function openMiniProgramNativeLogin/);
  assert.match(bridge, /function loadWechatJssdk/);
  assert.match(bridge, /https:\/\/res\.wx\.qq\.com\/open\/js\/jweixin-1\.6\.0\.js/);
  assert.match(bridge, /await loadWechatJssdk\(\)/);
  assert.match(bridge, /window\.wx\?\.miniProgram\?\.redirectTo/);
  assert.match(bridge, /window\.wx\?\.miniProgram\?\.navigateTo/);
  assert.match(bridge, /\/pages\/webview\/index\?url=\$\{encodeURIComponent\(window\.location\.href\)\}&title=\$\{encodeURIComponent\(document\.title \|\| "家长先疯"\)\}&login=1/);
  assert.match(bridge, /isMiniProgramWebView\(\) && redirectTo/);
  assert.match(bridge, /isMiniProgramWebView\(\)[\s\S]*\? currentWebviewLoginUrl[\s\S]*: `\/pages\/xiaowanzi\/index\?login=1&redirect=/);
  assert.doesNotMatch(bridge, /\/pages\/login\/index/);
  assert.match(bridge, /encodeURIComponent\(window\.location\.href\)/);
});
