import assert from "node:assert/strict";
import { describe, it } from "node:test";
import billingRoutes from "./billing";
import { BILLING_PLANS, FREE_BILLING_PLAN, serializePlan } from "../services/billing";

describe("billing routes", () => {
  it("registers the Pro billing endpoint surface", () => {
    const routes = ((billingRoutes as any).stack || [])
      .map((layer: any) => ({ path: layer.route?.path, methods: Object.keys(layer.route?.methods || {}) }))
      .filter((route: any) => route.path);

    assert.deepEqual(routes, [
      { path: "/plans", methods: ["get"] },
      { path: "/me", methods: ["get"] },
      { path: "/orders", methods: ["post"] },
      { path: "/orders/:id", methods: ["get"] },
      { path: "/orders/:id/mock-pay", methods: ["post"] },
      { path: "/alipay/notify", methods: ["post"] },
      { path: "/wechat/notify", methods: ["post"] },
      { path: "/refunds", methods: ["post"] },
    ]);
  });

  it("serializes public plan data without exposing payment secrets", () => {
    const data = {
      free: serializePlan(FREE_BILLING_PLAN),
      plus: serializePlan(BILLING_PLANS.plus),
      pro: serializePlan(BILLING_PLANS.pro),
    };

    assert.equal(data.plus.amountCents, 1990);
    assert.equal(data.pro.amountCents, 9900);
    assert.equal(data.free.amountCents, 0);
    assert.equal(data.plus.amountYuan, "19.90");
    assert.equal(data.plus.pointsPerCycle, 200);
    assert.equal(data.pro.pointsPerCycle, 1200);
    assert.equal(JSON.stringify(data).includes("PRIVATE_KEY"), false);
  });
});
