import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "SearchPage.tsx"), "utf8");

test("global search material results open the materials page with the result title as query", () => {
  assert.match(source, /function buildMaterialSearchUrl\(title: string\)/);
  assert.match(source, /new URLSearchParams\(\{ q: clean \}\)/);
  assert.match(source, /url: buildMaterialSearchUrl\(material\.title\)/);
  assert.doesNotMatch(source, /url:\s*"\/materials"/);
});

test("empty global search does not show default result groups", () => {
  assert.match(source, /function includesQuery\(text: string, query: string\)/);
  assert.match(source, /if \(!query\) return false;/);
  assert.match(source, /\{query\.trim\(\) \? "没有找到相关内容，可以换个关键词试试。" : "请输入关键词搜索。"\}/);
});

test("search page uses native mini program chrome spacing when embedded", () => {
  assert.match(source, /function isMiniProgramSearchWebView\(\)/);
  assert.match(source, /headless=\{miniProgramWebView\}/);
  assert.match(source, /const persistentSearchParams = \(\) =>/);
  assert.match(source, /\["xf_mp", "xf_token", "xw_layer", "xw_return"\]/);
  assert.match(source, /setParams\(\{ \.\.\.persistentSearchParams\(\), \.\.\.\(q \? \{ q \} : \{\}\)/);
  assert.match(source, /html\.xf-mp-webview \.xf-search-page/);
  assert.match(source, /html\.xf-mp-webview \.xf-search-main/);
  assert.match(source, /padding-top:var\(--xf-mp-nav-height,88px\)!important/);
  assert.match(source, /padding-bottom:0!important/);
});

test("search page reuses the current home program visual system", () => {
  assert.match(source, /background-color:#f3f2f8/);
  assert.match(source, /repeating-linear-gradient\(45deg,rgba\(118,83,205,\.06\)/);
  assert.match(source, /\.xf-search-bar\{[\s\S]*border:1px solid #dbe1ea[\s\S]*border-radius:999px[\s\S]*background:#fff/);
  assert.match(source, /\.xf-search-btn\{[\s\S]*border-radius:999px[\s\S]*background:#5e17eb/);
  assert.match(source, /html\.xf-mp-webview \.xf-search-bar\{[\s\S]*height:40px!important[\s\S]*border:1px solid #dbe1ea!important[\s\S]*border-radius:999px!important/);
  assert.match(source, /html\.xf-mp-webview \.xf-search-btn\{[\s\S]*height:34px!important[\s\S]*border-radius:999px!important[\s\S]*background:#5e17eb!important/);
  assert.match(source, /placeholder="搜索"/);
  assert.match(source, /\{query\.trim\(\) \? <button type="button" className="xf-search-btn" onClick=\{submitSearch\}>搜索<\/button> : null\}/);
  assert.match(source, /\.xf-search-result\{[\s\S]*border:1px solid #e1daf0[\s\S]*border-radius:22px[\s\S]*background:#fff/);
  assert.match(source, /\.xf-search-tag\{[\s\S]*border:1px solid #d9c8ff[\s\S]*background:#f6f0ff[\s\S]*color:#5e17eb/);
});
