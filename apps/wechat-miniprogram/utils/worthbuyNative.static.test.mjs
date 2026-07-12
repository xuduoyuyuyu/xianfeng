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
