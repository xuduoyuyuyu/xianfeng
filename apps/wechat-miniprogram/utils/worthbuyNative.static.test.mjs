import test from "node:test";
import assert from "node:assert/strict";

globalThis.wx = {
  _store: new Map(),
  getStorageSync(key) { return this._store.get(key); },
  setStorageSync(key, value) { this._store.set(key, value); },
  removeStorageSync(key) { this._store.delete(key); }
};

const api = await import("./worthbuyNative.js").then((mod) => mod.default || mod);

test("normalizes the complete WorthBuy report without inventing empty blocks", () => {
  const item = api.normalizeWorthBuyItem({ query: "台灯", result: { score: 86, pros: ["护眼"], cons: [], businessModel: "直营", references: [{ title: "检测", url: "https://example.com" }] } });
  assert.equal(item.title, "台灯");
  assert.equal(item.score, 86);
  assert.deepEqual(item.pros, ["护眼"]);
  assert.equal(item.hasCons, false);
  assert.equal(item.hasBusinessModel, true);
  assert.equal(item.hasReferences, true);
});

test("maps mobile web score, dimension, emoji, and category presentation", () => {
  const item = api.normalizeWorthBuyItem({
    query: "贝亲宽口径奶瓶",
    result: {
      score: 0,
      isIqTax: false,
      ratingDimensions: { cost: 50, quality: 51, safety: 52, experience: 53, afterSales: 54 }
    }
  });

  assert.equal(item.scoreLabel, "建议避坑 🚫");
  assert.equal(item.scoreColor, "#EF4444");
  assert.deepEqual(item.dimensions, [
    { key: "cost", label: "性价比", color: "#F59E0B", score: 50 },
    { key: "quality", label: "质量", color: "#10B981", score: 51 },
    { key: "safety", label: "安全性", color: "#3B82F6", score: 52 },
    { key: "experience", label: "使用体验", color: "#8B5CF6", score: 53 },
    { key: "afterSales", label: "售后", color: "#EC4899", score: 54 }
  ]);
  assert.equal(item.displayEmoji, "🍼");
  assert.equal(item.categoryLabel, "非智商税");
  assert.equal(item.title, "贝亲宽口径奶瓶");
});

test("re-normalizes cached dimension rows with labels and colors", () => {
  const item = api.normalizeWorthBuyItem({
    query: "缓存商品",
    score: 65,
    dimensions: [{ key: "cost", score: 25 }, { key: "quality", score: 72 }]
  });
  assert.deepEqual(item.dimensions, [
    { key: "cost", label: "性价比", color: "#F59E0B", score: 25 },
    { key: "quality", label: "质量", color: "#10B981", score: 72 }
  ]);
});

test("classifies auth, pro, points, validation, and network errors separately", () => {
  assert.equal(api.classifyWorthBuyError({ statusCode: 401 }), "auth");
  assert.equal(api.classifyWorthBuyError({ statusCode: 402, data: { code: "PRO_REQUIRED" } }), "pro");
  assert.equal(api.classifyWorthBuyError({ statusCode: 402, data: { remainingPointBalance: 0 } }), "points");
  assert.equal(api.classifyWorthBuyError({ statusCode: 422 }), "validation");
  assert.equal(api.classifyWorthBuyError({ statusCode: 0 }), "network");
});

test("keeps personal caches isolated by owner and encodes native detail routes", () => {
  api.writeWorthBuyCache("history", "user-a", [{ query: "A" }]);
  assert.deepEqual(api.readWorthBuyCache("history", "user-a"), [{ query: "A" }]);
  assert.equal(api.readWorthBuyCache("history", "user-b"), null);
  assert.equal(api.worthBuyDetailPath("公牛 台灯"), "/pages/worthbuy-detail/index?query=%E5%85%AC%E7%89%9B%20%E5%8F%B0%E7%81%AF");
});
