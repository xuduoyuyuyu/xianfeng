import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getVirtualProduct } from "./virtualPaymentProducts";

describe("virtual payment product catalog", () => {
  it("returns the fixed Plus product sourced from billing plans", () => {
    assert.deepEqual(getVirtualProduct("plus"), {
      productId: "plus",
      plan: "plus",
      name: "Plus",
      amountCents: 1990,
      points: 200,
      maxQuantity: 1,
    });
  });

  it("rejects unknown product IDs", () => {
    assert.equal(getVirtualProduct("unknown"), null);
  });
});
