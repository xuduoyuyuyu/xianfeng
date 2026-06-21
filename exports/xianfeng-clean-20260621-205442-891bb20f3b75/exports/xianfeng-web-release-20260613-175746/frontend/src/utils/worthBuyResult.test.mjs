import test from "node:test";
import assert from "node:assert/strict";
import { isInvalidWorthBuyResultForQuery, normalizeWorthBuyResult, resolveWorthBuyDisplayTitle } from "./worthBuyResult.ts";

test("normalizes legacy model fields for the WorthBuy detail page", () => {
  const result = normalizeWorthBuyResult({
    brand: "公牛",
    verdict: "不是纯智商税，但证据不足。",
    strengths: ["品牌有知名度"],
    risks: ["缺少护眼参数"],
    suggestions: ["先查国AA级认证"],
    evidence: ["淘宝分享标题"],
  }, "公牛护眼灯");

  assert.equal(result.reason, "不是纯智商税，但证据不足。");
  assert.deepEqual(result.pros, ["品牌有知名度"]);
  assert.deepEqual(result.cons, ["缺少护眼参数"]);
  assert.equal(result.recommendation, "先查国AA级认证");
  assert.deepEqual(result.dataPoints, ["淘宝分享标题"]);
  assert.equal(result.score, 50);
});

test("prefers Taobao share product title over short model brand", () => {
  const query = "【淘宝】大促价保 https://e.tb.cn/h.RIfrvfFBTilOjfl?tk=sDuOg3Id11h MF278 「杨幂同款公牛Ai智能小晴空大路灯学习阅读专用儿童生护眼落地台灯」 点击链接直接打开 或者 淘宝搜索直接打开";
  const displayTitle = resolveWorthBuyDisplayTitle(query, { brand: "公牛" });
  const result = normalizeWorthBuyResult({ brand: "公牛" }, displayTitle);

  assert.equal(displayTitle, "公牛Ai智能小晴空大路灯");
  assert.equal(result.brand, "公牛Ai智能小晴空大路灯");
});

test("normalizes saved marketing titles to the refined display title", () => {
  const result = normalizeWorthBuyResult({
    brand: "杨幂同款公牛Ai智能小晴空大路灯学习阅读专用儿童生护眼落地台灯",
  }, "公牛Ai智能小晴空大路灯");

  assert.equal(result.brand, "公牛Ai智能小晴空大路灯");
});

test("resolves saved marketing title even without the original Taobao share text", () => {
  const displayTitle = resolveWorthBuyDisplayTitle("https://e.tb.cn/h.RIfrvfFBTilOjfl?tk=sDuOg3Id11h", {
    brand: "杨幂同款公牛Ai智能小晴空大路灯学习阅读专用儿童生护眼落地台灯",
  });

  assert.equal(displayTitle, "公牛Ai智能小晴空大路灯");
});

test("fills missing deep analysis fields for incomplete saved WorthBuy results", () => {
  const result = normalizeWorthBuyResult({
    brand: "公牛Ai智能小晴空大路灯",
    score: 50,
    reason: "品牌可靠且功能定位清晰，但护眼效果需要实际验证。",
    pros: ["公牛是国内知名电工品牌"],
    cons: ["产品未提供具体技术参数"],
    recommendation: "购买前确认是否有权威护眼认证。",
  }, "公牛Ai智能小晴空大路灯");

  assert.notEqual(result.businessModel, "");
  assert.notEqual(result.commentAnalysis, "");
  assert.ok(result.dataPoints && result.dataPoints.length >= 3);
  assert.deepEqual(result.ratingDimensions, {
    cost: 50,
    quality: 50,
    safety: 50,
    experience: 50,
    afterSales: 50,
  });
});

test("marks generic JD platform results as invalid for JD short-link detail pages", () => {
  assert.equal(
    isInvalidWorthBuyResultForQuery("https://3.cn/2R-LTixT?jkl=@Z1bBHD1aPtPm@", {
      brand: "多快好省，购物上京东",
      title: "多快好省，购物上京东",
      reason: "页面无有效商品信息，仅显示京东平台通用提示，无法进行分析。",
    }),
    true
  );
});

test("marks inaccessible JD short-link analysis as invalid even when the model returns a product code", () => {
  assert.equal(
    isInvalidWorthBuyResultForQuery("https://3.cn/2RM4-Deu?jkl=@XEb5J47Z2fxY@", {
      brand: "CA1507",
      score: 0,
      reason: "页面无法访问，提示活动火爆或加载失败，无法获取商品信息。",
    }),
    true
  );
});
