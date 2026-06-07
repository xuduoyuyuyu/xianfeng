import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/User";
import {
  BILLING_PLANS,
  FREE_BILLING_PLAN,
  POINT_USAGE_POLICY,
  addPlanDuration,
  canRefundOrder,
  calculateFreeLoginPointGrant,
  consumeProPoints,
  getPointCostForFeature,
  isProActive,
  isMockPaymentEnabled,
  normalizeBillingPlan,
} from "./billing";

describe("billing rules", () => {
  it("exposes monthly and yearly plans and default free points", () => {
    assert.equal(BILLING_PLANS.monthly.amountCents, 1990);
    assert.equal(BILLING_PLANS.yearly.amountCents, 9900);
    assert.equal(BILLING_PLANS.monthly.pointsPerCycle, 8800);
    assert.equal(BILLING_PLANS.yearly.pointsPerCycle, 105600);
    assert.equal(FREE_BILLING_PLAN.pointsPerCycle, 200);
    assert.match(BILLING_PLANS.monthly.description, /点/);
    assert.match(BILLING_PLANS.yearly.description, /点/);
    assert.equal(normalizeBillingPlan("monthly"), "monthly");
    assert.equal(normalizeBillingPlan("yearly"), "yearly");
    assert.equal(normalizeBillingPlan("bad-value"), null);
  });

  it("adds plan duration from an active expiry when the user already has Pro", () => {
    const now = new Date("2026-06-05T00:00:00.000Z");
    const currentExpiry = new Date("2026-06-20T00:00:00.000Z");

    assert.equal(addPlanDuration("monthly", now, currentExpiry).toISOString(), "2026-07-20T00:00:00.000Z");
    assert.equal(addPlanDuration("yearly", now, currentExpiry).toISOString(), "2027-06-20T00:00:00.000Z");
  });

  it("starts a new plan from now when the existing Pro is expired", () => {
    const now = new Date("2026-06-05T00:00:00.000Z");
    const expired = new Date("2026-06-01T00:00:00.000Z");

    assert.equal(addPlanDuration("monthly", now, expired).toISOString(), "2026-07-05T00:00:00.000Z");
  });

  it("treats refunded and expired accounts as non-Pro", () => {
    const now = new Date("2026-06-05T00:00:00.000Z");

    assert.equal(isProActive({ proStatus: "active", proExpiresAt: "2026-06-06T00:00:00.000Z" }, now), true);
    assert.equal(isProActive({ proStatus: "active", proExpiresAt: "2026-06-01T00:00:00.000Z" }, now), false);
    assert.equal(isProActive({ proStatus: "refunded", proExpiresAt: "2026-06-06T00:00:00.000Z" }, now), false);
  });

  it("allows full refund only within three days of payment", () => {
    const paidAt = new Date("2026-06-05T00:00:00.000Z");

    assert.equal(canRefundOrder({ status: "paid", paidAt }, new Date("2026-06-07T23:59:59.000Z")).ok, true);
    assert.equal(canRefundOrder({ status: "paid", paidAt }, new Date("2026-06-08T00:00:01.000Z")).ok, false);
    assert.equal(canRefundOrder({ status: "pending", paidAt }, new Date("2026-06-06T00:00:00.000Z")).ok, false);
  });

  it("keeps mock payment disabled in production unless explicitly enabled", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldEnable = process.env.BILLING_ENABLE_MOCK_PAY;
    const oldDisable = process.env.BILLING_DISABLE_MOCK_PAY;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.BILLING_ENABLE_MOCK_PAY;
      delete process.env.BILLING_DISABLE_MOCK_PAY;
      assert.equal(isMockPaymentEnabled(), false);

      process.env.BILLING_ENABLE_MOCK_PAY = "true";
      assert.equal(isMockPaymentEnabled(), true);

      process.env.NODE_ENV = "development";
      delete process.env.BILLING_ENABLE_MOCK_PAY;
      assert.equal(isMockPaymentEnabled(), true);

      process.env.BILLING_DISABLE_MOCK_PAY = "true";
      assert.equal(isMockPaymentEnabled(), false);
    } finally {
      if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldNodeEnv;
      if (oldEnable === undefined) delete process.env.BILLING_ENABLE_MOCK_PAY;
      else process.env.BILLING_ENABLE_MOCK_PAY = oldEnable;
      if (oldDisable === undefined) delete process.env.BILLING_DISABLE_MOCK_PAY;
      else process.env.BILLING_DISABLE_MOCK_PAY = oldDisable;
    }
  });

  it("resets free users to 200 daily points without accumulating grants", () => {
    const first = calculateFreeLoginPointGrant({
      balance: 0,
      grantDate: "",
      grantMonth: "",
      grantedThisMonth: 0,
      now: new Date("2026-06-05T01:00:00.000Z"),
    });

    assert.equal(first.grantedPoints, 200);
    assert.equal(first.pointBalance, 200);
    assert.equal(first.grantDate, "2026-06-05");
    assert.equal(first.grantMonth, "2026-06");
    assert.equal(first.grantedThisMonth, 200);

    const sameDay = calculateFreeLoginPointGrant({
      balance: first.pointBalance,
      grantDate: first.grantDate,
      grantMonth: first.grantMonth,
      grantedThisMonth: first.grantedThisMonth,
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.equal(sameDay.grantedPoints, 0);
    assert.equal(sameDay.pointBalance, 200);

    const sameDayAfterSpend = calculateFreeLoginPointGrant({
      balance: 123.5,
      grantDate: first.grantDate,
      grantMonth: first.grantMonth,
      grantedThisMonth: first.grantedThisMonth,
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.equal(sameDayAfterSpend.grantedPoints, 0);
    assert.equal(sameDayAfterSpend.pointBalance, 123.5);

    const nextDay = calculateFreeLoginPointGrant({
      balance: 591.5,
      grantDate: "2026-06-04",
      grantMonth: "2026-06",
      grantedThisMonth: 200,
      now: new Date("2026-06-06T01:00:00.000Z"),
    });

    assert.equal(nextDay.grantedPoints, 200);
    assert.equal(nextDay.pointBalance, 200);
    assert.equal(nextDay.grantedThisMonth, 200);
  });

  it("exposes a point consumption policy for gated AI behavior", () => {
    assert.equal(POINT_USAGE_POLICY.xiaowanzi.cost, 2);
    assert.equal(POINT_USAGE_POLICY.ai_chat.cost, 1);
    assert.equal(POINT_USAGE_POLICY.guest_agent.cost, 3);
    assert.equal(POINT_USAGE_POLICY.worthbuy_analysis.cost, 5);
    assert.equal(getPointCostForFeature("topic_submit"), 5);
    assert.equal(getPointCostForFeature("unknown_feature"), 1);
    assert.equal(getPointCostForFeature("xiaowanzi", 0.75), 0.75);
  });
});

describe("billing point consumption", () => {
  let mongo: MongoMemoryServer;

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
  });

  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it("deducts points from the real user balance and rejects insufficient balances", async () => {
    const user = await User.create({
      username: "point-user",
      password: "hashed",
      proPointBalance: 4,
    });

    const spend = await consumeProPoints({
      userId: String(user._id),
      featureKey: "guest_agent",
      points: getPointCostForFeature("guest_agent"),
    });

    assert.equal(spend.ok, true);
    assert.equal(spend.remainingPointBalance, 1);

    const afterSpend = await User.findById(user._id).lean();
    assert.equal(afterSpend?.proPointBalance, 1);

    const insufficient = await consumeProPoints({
      userId: String(user._id),
      featureKey: "worthbuy_analysis",
      points: getPointCostForFeature("worthbuy_analysis"),
    });

    assert.equal(insufficient.ok, false);
    assert.equal(insufficient.remainingPointBalance, 1);
  });
});
