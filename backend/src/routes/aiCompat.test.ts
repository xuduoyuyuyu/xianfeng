import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import aiCompatRoutes, { normalizeWorthBuyAnalysis } from "./aiCompat";

describe("ai compatibility routes", () => {
  it("registers chat and product-analysis AI endpoints", () => {
    const routes = ((aiCompatRoutes as any).stack || [])
      .map((layer: any) => ({ path: layer.route?.path, methods: Object.keys(layer.route?.methods || {}) }))
      .filter((route: any) => route.path);

    assert.deepEqual(routes, [
      { path: "/chat", methods: ["post"] },
      { path: "/analyze-product", methods: ["post"] },
    ]);
  });

  it("injects shared RAG context into generic chat prompts", () => {
    const source = readFileSync(resolve(__dirname, "aiCompat.ts"), "utf8");

    assert.match(source, /buildRagContext/);
    assert.match(source, /routeKey:\s*"ai_chat"/);
    assert.match(source, /rag\.promptBlock/);
  });

  it("requests and returns the WorthBuy report shape consumed by the detail page", () => {
    const source = readFileSync(resolve(__dirname, "aiCompat.ts"), "utf8");

    for (const field of [
      "score",
      "isIqTax",
      "reason",
      "pros",
      "cons",
      "businessModel",
      "commentAnalysis",
      "recommendation",
      "ratingDimensions",
    ]) {
      assert.match(source, new RegExp(`"${field}"`), `product analysis should include ${field}`);
    }
    assert.doesNotMatch(source, /strengths, risks, suggestions/, "product analysis should not return the old compact schema");
  });

  it("normalizes model output into detail-page WorthBuy fields", () => {
    const result = normalizeWorthBuyAnalysis({
      brand: "公牛护眼灯",
      score: 73.4,
      verdict: "不是纯智商税，但需要看照度证据。",
      strengths: ["有明确使用场景"],
      risks: ["价格偏高"],
      suggestions: ["先看国标认证"],
      evidence: ["淘宝分享标题"],
      ratingDimensions: { cost: 61, quality: 72, safety: 80, experience: 70, afterSales: 65 },
    }, "fallback");

    assert.equal(result.brand, "公牛护眼灯");
    assert.equal(result.score, 73);
    assert.equal(result.reason, "不是纯智商税，但需要看照度证据。");
    assert.deepEqual(result.pros, ["有明确使用场景"]);
    assert.deepEqual(result.cons, ["价格偏高"]);
    assert.equal(result.recommendation, "先看国标认证");
    assert.deepEqual(result.dataPoints, ["淘宝分享标题"]);
  });

  it("fills missing deep-analysis fields when the model returns a partial product report", () => {
    const result = normalizeWorthBuyAnalysis({
      brand: "公牛Ai智能小晴空大路灯",
      score: 50,
      reason: "品牌可靠且功能定位清晰，但护眼效果需要实际验证。",
      pros: ["公牛是国内知名电工品牌"],
      cons: ["产品未提供具体技术参数"],
      recommendation: "购买前确认是否有权威护眼认证。",
    }, "fallback");

    assert.notEqual(result.businessModel, "");
    assert.notEqual(result.commentAnalysis, "");
    assert.ok(result.dataPoints.length >= 3);
    assert.deepEqual(result.ratingDimensions, {
      cost: 50,
      quality: 50,
      safety: 50,
      experience: 50,
      afterSales: 50,
    });
  });
});
