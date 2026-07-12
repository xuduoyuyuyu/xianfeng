import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./mpAuthBridge.ts", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const xiaowanziMain = fs.readFileSync(new URL("../main.xiaowanzi.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("mini program auth bridge stores token only for xf_mp web-view entries", () => {
  assert.match(source, /function isMiniProgramWebView\(\)/);
  assert.match(source, /__wxjs_environment/);
  assert.match(source, /url\.searchParams\.has\("xf_tab"\)/);
  assert.match(source, /wechatEnvironment === "miniprogram"/);
  assert.match(source, /\/miniprogram\/i\.test\(userAgent\)/);
  assert.match(source, /document\.referrer/);
  assert.match(source, /referrer\.includes\("servicewechat\.com\/"\)/);
  assert.match(source, /document\.documentElement\.classList\.contains\("xf-mp-webview"\)/);
  assert.match(source, /if \(detected\) \{/);
  assert.match(source, /if \(!isMiniProgramWebView\(\)\) return;/);
  assert.match(source, /window\.sessionStorage\.setItem\("xf_mp_webview", "1"\)/);
  assert.match(source, /document\.documentElement\.classList\.add\("xf-mp-webview"\)/);
  assert.match(source, /url\.searchParams\.get\("xf_token"\)/);
  assert.match(source, /window\.localStorage\.setItem\("token", token\)/);
});

test("mini program auth bridge removes token from the visible URL", () => {
  assert.match(source, /url\.searchParams\.delete\("xf_token"\)/);
  assert.match(source, /window\.history\.replaceState/);
});

test("mini program bridge opens native archive in add-child mode", () => {
  assert.match(source, /async function openMiniProgramNativeArchive\(action: "select" \| "add"\)/);
  assert.match(source, /export async function openMiniProgramNativeArchivePicker\(\)/);
  assert.match(source, /export async function openMiniProgramNativeArchiveCreate\(\)/);
  assert.match(source, /const postArchiveMessage = \(\) => \{/);
  assert.match(source, /const requestNativeAction = \(\) => \{/);
  assert.match(source, /const postMessage = window\.wx\?\.miniProgram\?\.postMessage/);
  assert.match(source, /type: "xianfeng:xiaowanzi-open-archive"/);
  assert.match(source, /action/);
  assert.match(source, /if \(postArchiveMessage\(\)\) return true;/);
  const archiveFunction = source.match(/async function openMiniProgramNativeArchive\(action: "select" \| "add"\) \{[\s\S]*?\n\}/);
  assert.ok(archiveFunction, "archive bridge function should exist");
  assert.doesNotMatch(archiveFunction[0], /reLaunch/, "archive bridge must not relaunch the Xiaowanzi page");
  assert.doesNotMatch(archiveFunction[0], /\/pages\/xiaowanzi\/index\?panel=archive/, "archive bridge should not reopen the native page");
  assert.match(source, /void loadWechatJssdk\(\)\.then\(\(\) => \{/);
  assert.match(source, /void loadWechatJssdk\(\)\.then\(\(\) => \{[\s\S]*if \(postArchiveMessage\(\)\) return;[\s\S]*requestNativeAction\(\);/);
  assert.match(source, /url\.searchParams\.set\("xf_native_action", action === "add" \? "archive_add" : "archive_select"\)/);
  assert.match(source, /url\.searchParams\.set\("xf_native_action_ts", String\(Date\.now\(\)\)\)/);
  assert.match(source, /window\.location\.replace\(url\.toString\(\)\)/);
  assert.doesNotMatch(source, /\/pages\/mine\/archive\/index\?from=xiaowanzi&action=add/);
  assert.doesNotMatch(source, /\/pages\/mine\/index\?panel=archive/);
});

test("mini program bridge opens native Pro page for virtual payment", () => {
  assert.match(source, /export async function openMiniProgramNativePro\(plan\?: "plus" \| "pro"\)/);
  assert.match(source, /\/pages\/pro\/index/);
  assert.match(source, /plan=\$\{encodeURIComponent\(plan\)\}/);
  assert.match(source, /from=webview/);
  assert.match(source, /window\.wx\?\.miniProgram\?\.navigateTo/);
});

test("mini program JSSDK loader waits for the WeChat bridge and environment", () => {
  assert.match(source, /const WECHAT_JSSDK_LOAD_TIMEOUT_MS = 4000/);
  assert.match(source, /WeixinJSBridgeReady/);
  assert.match(source, /getEnv\?: \(callback: \(res: \{ miniprogram\?: boolean \}\) => void\) => void/);
  assert.match(source, /window\.wx\?\.miniProgram\?\.getEnv/);
  assert.match(source, /markMiniProgramWebView\(\)/);
  assert.match(source, /let settled = false/);
  assert.match(source, /const finish = \(loaded: boolean\) => \{/);
  assert.match(source, /window\.clearTimeout\(timer\)/);
  assert.match(source, /window\.setTimeout\(\(\) => finish\(hasMiniProgramBridge\(\)\), WECHAT_JSSDK_LOAD_TIMEOUT_MS\)/);
  assert.match(source, /existing\.addEventListener\("load", \(\) => void waitForMiniProgramBridge\(\)\.then\(finish\), \{ once: true \}\)/);
  assert.match(source, /existing\.addEventListener\("error", \(\) => finish\(false\), \{ once: true \}\)/);
});

test("mini program auth bridge runs before Redux store initializes", () => {
  assert.match(main, /import \{ hydrateMiniProgramAuthFromUrl \} from "\.\/utils\/mpAuthBridge";/);
  assert.match(main, /hydrateMiniProgramAuthFromUrl\(\);[\s\S]*ReactDOM\.createRoot/);
  assert.match(xiaowanziMain, /import \{ hydrateMiniProgramAuthFromUrl \} from "\.\/utils\/mpAuthBridge";/);
  assert.match(xiaowanziMain, /hydrateMiniProgramAuthFromUrl\(\);[\s\S]*ReactDOM\.createRoot/);
});

test("mini program font setting from native shell is applied before app render", () => {
  assert.match(source, /function hydrateMiniProgramFontFromUrl\(url = new URL\(window\.location\.href\)\)/);
  assert.match(source, /hydrateMiniProgramFontFromUrl\(url\);[\s\S]*const token =/);
  assert.match(source, /url\.searchParams\.get\("xf_font"\)/);
  assert.match(source, /window\.localStorage\.setItem\("xf_font_scale", scale\)/);
  assert.match(source, /document\.documentElement\.classList\.add\(`xf-mp-font-\$\{fontSize\}`\)/);
  assert.match(source, /url\.searchParams\.delete\("xf_font"\)/);
  assert.match(styles, /html\.xf-mp-webview\.xf-mp-font-small/);
  assert.match(styles, /html\.xf-mp-webview\.xf-mp-font-large/);
});
