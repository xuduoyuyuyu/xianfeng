import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WORTHBUY_FAILURE_GUIDANCE, buildWorthBuyResultForSave, canReadWorthBuyItem, extractProductInfo, isUndeliverableWorthBuyAnalysis, resolveWorthBuyUserId } from "./worthbuy";

describe("worthbuy submit result shaping", () => {
  it("keeps the extracted product title instead of the model's short brand", () => {
    const result = buildWorthBuyResultForSave({
      analyzeResult: {
        brand: "公牛",
        score: 72,
        isIqTax: false,
        reason: "可考虑",
        pros: ["品牌有知名度"],
        cons: ["缺少参数"],
      },
      brandName: "杨幂同款公牛Ai智能小晴空大路灯学习阅读专用儿童生护眼落地台灯",
      url: "https://e.tb.cn/h.RIfrvfFBTilOjfl?tk=sDuOg3Id11h",
    });

    assert.equal(result.brand, "杨幂同款公牛Ai智能小晴空大路灯学习阅读专用儿童生护眼落地台灯");
    assert.equal(result.url, "https://e.tb.cn/h.RIfrvfFBTilOjfl?tk=sDuOg3Id11h");
    assert.equal(result.score, 72);
    assert.deepEqual(result.pros, ["品牌有知名度"]);
  });
});

describe("worthbuy owner identity", () => {
  it("uses the same query userId fallback for deleting my submissions as listing them", () => {
    const userId = resolveWorthBuyUserId({
      query: { userId: "user_local_123" },
    });

    assert.equal(userId, "user_local_123");
  });

  it("allows draft detail reads when the local query userId matches the submitter", () => {
    assert.equal(
      canReadWorthBuyItem({ status: "draft", submittedBy: "user_local_123" }, "user_local_123", false),
      true
    );
  });
});

describe("worthbuy product page extraction", () => {
  it("does not treat JD generic platform slogans as product titles for 3.cn links", () => {
    const info = extractProductInfo(
      '<html><head><title>多快好省，购物上京东</title><meta name="description" content="京东JD.COM，多快好省，只为品质生活。"></head><body>多快好省，购物上京东</body></html>',
      "https://3.cn/2R-LTixT?jkl=@Z1bBHD1aPtPm@"
    );

    assert.equal(info.includes("商品标题: 多快好省，购物上京东"), false);
    assert.match(info, /来源平台: 3\.cn|页面文本摘要:/);
  });

  it("treats inaccessible JD short-link analysis as undeliverable before saving", () => {
    assert.equal(
      isUndeliverableWorthBuyAnalysis("https://3.cn/2RM4-Deu?jkl=@XEb5J47Z2fxY@", {
        brand: "CA1507",
        score: 0,
        reason: "页面无法访问，提示活动火爆或加载失败，无法获取商品信息。",
      }),
      true
    );
  });
});

describe("worthbuy failure guidance", () => {
  it("keeps actionable next-step guidance in the submit failure response", () => {
    assert.match(WORTHBUY_FAILURE_GUIDANCE.message, /暂时没有解析到有效商品信息/);
    assert.ok(WORTHBUY_FAILURE_GUIDANCE.tips.some((tip) => tip.includes("完整商品标题")));
    assert.ok(WORTHBUY_FAILURE_GUIDANCE.examples.some((example) => example.includes("品牌 + 型号 + 品类")));
    assert.ok(WORTHBUY_FAILURE_GUIDANCE.examples.some((example) => example.includes("复制电商分享文案")));
    assert.ok(WORTHBUY_FAILURE_GUIDANCE.examples.some((example) => example.includes("商品链接 + 商品名称")));
  });
});
