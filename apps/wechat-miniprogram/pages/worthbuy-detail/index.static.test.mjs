import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const js = readFileSync(new URL("index.js", import.meta.url), "utf8");
const wxml = readFileSync(new URL("index.wxml", import.meta.url), "utf8");
test("loads WorthBuy detail into a dedicated native route without sharing identity", () => { assert.match(js, /\/api\/worthbuy\/\$\{encodeURIComponent\(this\.data\.query\)\}/); assert.match(js, /path: `\/pages\/worthbuy-detail\/index\?query=/); assert.doesNotMatch(js, /userId=.*path/); });
test("conditionally renders every real Web report block", () => { for (const key of ["hasDimensions","hasPros","hasCons","hasBusinessModel","hasCommentAnalysis","hasDataPoints","hasAudience","hasAlternatives","hasRecommendation","hasBuyAdvice","hasReferences"]) assert.match(wxml, new RegExp(key)); });
test("copies reference URLs when direct opening is unavailable", () => { assert.match(js, /setClipboardData/); assert.match(wxml, /copyReference/); });
