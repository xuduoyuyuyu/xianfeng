import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getVirtualProduct } from "./virtualPaymentProducts";

describe("virtual payment product catalog", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns the fixed Plus product sourced from billing plans", () => {
    assert.deepEqual(getVirtualProduct("plus"), {
      productId: "plus",
      wechatProductId: "plus",
      plan: "plus",
      name: "Plus",
      amountCents: 1990,
      points: 200,
      maxQuantity: 1,
    });
  });

  it("separates internal plan IDs from WeChat published product IDs", () => {
    process.env.WECHAT_VIRTUAL_PAY_PRODUCT_PLUS = "wx_plus_200_points";
    process.env.WECHAT_VIRTUAL_PAY_PRODUCT_PRO = "wx_pro_1200_points";

    assert.deepEqual(getVirtualProduct("plus"), {
      productId: "plus",
      wechatProductId: "wx_plus_200_points",
      plan: "plus",
      name: "Plus",
      amountCents: 1990,
      points: 200,
      maxQuantity: 1,
    });
    assert.equal(getVirtualProduct("pro")?.wechatProductId, "wx_pro_1200_points");
  });

  it("rejects unknown product IDs", () => {
    assert.equal(getVirtualProduct("unknown"), null);
  });
});
