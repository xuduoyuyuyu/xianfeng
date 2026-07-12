import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const js = readFileSync(new URL("index.js", import.meta.url), "utf8");
const wxml = readFileSync(new URL("index.wxml", import.meta.url), "utf8");
const wxss = readFileSync(new URL("index.wxss", import.meta.url), "utf8");
test("loads WorthBuy detail into a dedicated native route without sharing identity", () => { assert.match(js, /\/api\/worthbuy\/\$\{encodeURIComponent\(this\.data\.query\)\}/); assert.match(js, /path: `\/pages\/worthbuy-detail\/index\?query=/); assert.doesNotMatch(js, /userId=.*path/); });
test("conditionally renders every real Web report block", () => { for (const key of ["hasDimensions","hasPros","hasCons","hasBusinessModel","hasCommentAnalysis","hasDataPoints","hasAudience","hasAlternatives","hasRecommendation","hasBuyAdvice","hasReferences"]) assert.match(wxml, new RegExp(key)); });
test("copies reference URLs when direct opening is unavailable", () => { assert.match(js, /setClipboardData/); assert.match(wxml, /copyReference/); });
test("matches the mobile web trust gauge and five-dimension score card", () => {
  assert.match(wxml, /深度分析报告/);
  assert.match(wxml, /可信指数/);
  assert.match(wxml, /class="wbd-gauge"/);
  assert.match(wxml, /report\.scoreColor/);
  assert.match(wxml, /report\.scoreLabel/);
  assert.match(wxml, /item\.label/);
  assert.match(wxml, /item\.color/);
  assert.match(wxml, /非智商税/);
});
test("uses the shared native back control and a canvas gauge", () => {
  assert.match(wxml, /xf-native-menu-button xf-native-back-button/);
  assert.match(wxss, /@import "\.\.\/\.\.\/styles\/native-list\.wxss"/);
  assert.doesNotMatch(wxml, /class="wbd-back"/);
  assert.match(wxml, /canvas-id="worthbuyGauge"/);
  assert.match(js, /drawGauge/);
  assert.match(js, /normalizeWorthBuyItem\(cachedReport\)/);
  assert.doesNotMatch(wxml, /conic-gradient/);
});
