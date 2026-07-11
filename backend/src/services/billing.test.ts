import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/User";
import PaymentOrderModel from "../models/PaymentOrder";
import {
  BILLING_PLANS,
  FREE_BILLING_PLAN,
  POINT_USAGE_POLICY,
  PUBLIC_POINT_USAGE_POLICY,
  addPlanDuration,
  canRefundOrder,
  calculatePointBasedRefund,
  calculateFreeLoginPointGrant,
  createVirtualPaymentOrder,
  consumeProPoints,
  getPointCostForFeature,
  getLatestRefundableOrder,
  grantProForOrder,
  isProActive,
  isMockPaymentEnabled,
  normalizeBillingPlan,
  processWechatVirtualNotification,
  resetFreeAccountPointGrants,
  serializeBillingUser,
} from "./billing";

describe("billing rules", () => {
  it("exposes Plus and Pro plans, free 10 point login grants, and legacy plan aliases", () => {
    assert.equal(BILLING_PLANS.plus.amountCents, 1990);
    assert.equal(BILLING_PLANS.pro.amountCents, 9900);
    assert.equal(BILLING_PLANS.plus.pointsPerCycle, 200);
    assert.equal(BILLING_PLANS.pro.pointsPerCycle, 1200);
    assert.equal(FREE_BILLING_PLAN.pointsPerCycle, 10);
    assert.match(FREE_BILLING_PLAN.description, /每月上限30点/);
    assert.match(BILLING_PLANS.plus.description, /200 点/);
    assert.match(BILLING_PLANS.pro.description, /1,200 点/);
    assert.equal(normalizeBillingPlan("plus"), "plus");
    assert.equal(normalizeBillingPlan("pro"), "pro");
    assert.equal(normalizeBillingPlan("monthly"), "plus");
    assert.equal(normalizeBillingPlan("yearly"), "pro");
    assert.equal(normalizeBillingPlan("bad-value"), null);
  });

  it("adds plan duration from an active expiry when the user already has Pro", () => {
    const now = new Date("2026-06-05T00:00:00.000Z");
    const currentExpiry = new Date("2026-06-20T00:00:00.000Z");

    assert.equal(addPlanDuration("plus", now, currentExpiry).toISOString(), "2026-07-20T00:00:00.000Z");
    assert.equal(addPlanDuration("pro", now, currentExpiry).toISOString(), "2027-06-20T00:00:00.000Z");
  });

  it("starts a new plan from now when the existing Pro is expired", () => {
    const now = new Date("2026-06-05T00:00:00.000Z");
    const expired = new Date("2026-06-01T00:00:00.000Z");

    assert.equal(addPlanDuration("plus", now, expired).toISOString(), "2026-07-05T00:00:00.000Z");
  });

  it("treats refunded and expired accounts as non-Pro", () => {
    const now = new Date("2026-06-05T00:00:00.000Z");

    assert.equal(isProActive({ proStatus: "active", proExpiresAt: "2026-06-06T00:00:00.000Z" }, now), true);
    assert.equal(isProActive({ proStatus: "active", proExpiresAt: "2026-06-01T00:00:00.000Z" }, now), false);
    assert.equal(isProActive({ proStatus: "refunded", proExpiresAt: "2026-06-06T00:00:00.000Z" }, now), false);
  });

  it("refunds by unused points instead of payment age", () => {
    const paidAt = new Date("2026-06-05T00:00:00.000Z");
    const oldPaidOrder = {
      status: "paid",
      plan: "pro",
      amountCents: 9900,
      paidAt,
    };

    assert.equal(canRefundOrder(oldPaidOrder, new Date("2026-07-08T00:00:01.000Z")).ok, true);
    assert.equal(canRefundOrder({ ...oldPaidOrder, status: "pending" }, new Date("2026-06-06T00:00:00.000Z")).ok, false);

    const refund = calculatePointBasedRefund(oldPaidOrder, { proPointBalance: 900 });
    assert.equal(refund.ok, true);
    assert.equal(refund.totalPoints, 1200);
    assert.equal(refund.refundablePoints, 900);
    assert.equal(refund.usedPoints, 300);
    assert.equal(refund.amountCents, 7425);

    const empty = calculatePointBasedRefund(oldPaidOrder, { proPointBalance: 0 });
    assert.equal(empty.ok, false);
    assert.equal(empty.amountCents, 0);
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

  it("adds free login points up to the 30 point monthly cap and immediately caps old balances", () => {
    const first = calculateFreeLoginPointGrant({
      balance: 0,
      grantDate: "",
      grantMonth: "",
      grantedThisMonth: 0,
      now: new Date("2026-06-05T01:00:00.000Z"),
    });

    assert.equal(first.grantedPoints, 10);
    assert.equal(first.pointBalance, 10);
    assert.equal(first.grantDate, "2026-06-05");
    assert.equal(first.grantMonth, "2026-06");
    assert.equal(first.grantedThisMonth, 10);

    const sameDay = calculateFreeLoginPointGrant({
      balance: first.pointBalance,
      grantDate: first.grantDate,
      grantMonth: first.grantMonth,
      grantedThisMonth: first.grantedThisMonth,
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.equal(sameDay.grantedPoints, 0);
    assert.equal(sameDay.pointBalance, 10);

    const sameDayAfterSpend = calculateFreeLoginPointGrant({
      balance: 43.5,
      grantDate: first.grantDate,
      grantMonth: first.grantMonth,
      grantedThisMonth: first.grantedThisMonth,
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.equal(sameDayAfterSpend.grantedPoints, 0);
    assert.equal(sameDayAfterSpend.pointBalance, 30);

    const nextDay = calculateFreeLoginPointGrant({
      balance: 10,
      grantDate: "2026-06-04",
      grantMonth: "2026-06",
      grantedThisMonth: 10,
      now: new Date("2026-06-06T01:00:00.000Z"),
    });

    assert.equal(nextDay.grantedPoints, 10);
    assert.equal(nextDay.pointBalance, 20);
    assert.equal(nextDay.grantedThisMonth, 20);
  });

  it("stops free daily login grants at the 30 point monthly cap", () => {
    const partialCap = calculateFreeLoginPointGrant({
      balance: 20,
      grantDate: "2026-06-09",
      grantMonth: "2026-06",
      grantedThisMonth: 25,
      now: new Date("2026-06-10T01:00:00.000Z"),
    });

    assert.equal(partialCap.grantedPoints, 5);
    assert.equal(partialCap.pointBalance, 25);
    assert.equal(partialCap.grantedThisMonth, 30);

    const exhausted = calculateFreeLoginPointGrant({
      balance: 0,
      grantDate: "2026-06-10",
      grantMonth: "2026-06",
      grantedThisMonth: 30,
      now: new Date("2026-06-11T01:00:00.000Z"),
    });

    assert.equal(exhausted.grantedPoints, 0);
    assert.equal(exhausted.pointBalance, 0);
    assert.equal(exhausted.grantedThisMonth, 30);

    const nextMonth = calculateFreeLoginPointGrant({
      balance: 0,
      grantDate: "2026-06-30",
      grantMonth: "2026-06",
      grantedThisMonth: 30,
      now: new Date("2026-07-01T01:00:00.000Z"),
    });

    assert.equal(nextMonth.grantedPoints, 10);
    assert.equal(nextMonth.pointBalance, 10);
    assert.equal(nextMonth.grantedThisMonth, 10);
  });

  it("serializes legacy paid plan ids as Plus and Pro membership tiers", () => {
    const now = new Date("2026-06-05T00:00:00.000Z");
    const plus = serializeBillingUser({
      proStatus: "active",
      proPlan: "plus",
      proExpiresAt: "2026-07-05T00:00:00.000Z",
      proPointBalance: 12,
    }, now);
    const pro = serializeBillingUser({
      proStatus: "active",
      proPlan: "yearly",
      proExpiresAt: "2027-06-05T00:00:00.000Z",
      proPointBalance: 99,
    }, now);

    assert.equal(plus.proPlan, "plus");
    assert.equal(plus.membershipTier, "plus");
    assert.equal(plus.membershipLabel, "Plus");
    assert.equal(pro.proPlan, "pro");
    assert.equal(pro.membershipTier, "pro");
    assert.equal(pro.membershipLabel, "Pro");
  });

  it("exposes a point consumption policy for gated AI behavior", () => {
    assert.equal(POINT_USAGE_POLICY.xiaowanzi.cost, 1);
    assert.equal(POINT_USAGE_POLICY.xiaowanzi_file.name, "小玩子图片文件处理");
    assert.equal(POINT_USAGE_POLICY.xiaowanzi_file.cost, 1);
    assert.equal(POINT_USAGE_POLICY.ai_chat.cost, 1);
    assert.equal(POINT_USAGE_POLICY.guest_agent.cost, 3);
    assert.equal(POINT_USAGE_POLICY.education_planning.name, "智能教育规划");
    assert.equal(POINT_USAGE_POLICY.education_planning.cost, 5);
    assert.equal(POINT_USAGE_POLICY.worthbuy_analysis.cost, 5);
    assert.equal(PUBLIC_POINT_USAGE_POLICY.some((item) => item.featureKey === "ai_chat"), false);
    assert.equal(PUBLIC_POINT_USAGE_POLICY.some((item) => item.featureKey === "xiaowanzi_file"), true);
    assert.equal(PUBLIC_POINT_USAGE_POLICY.some((item) => item.featureKey === "education_planning"), true);
    assert.equal(getPointCostForFeature("topic_submit"), 5);
    assert.equal(getPointCostForFeature("education_planning"), 5);
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

  it("creates a pending WeChat virtual order from the fixed product catalog", async () => {
    await PaymentOrderModel.deleteMany({});
    const userId = new mongoose.Types.ObjectId().toString();

    const order = await createVirtualPaymentOrder({ userId, productId: "plus", quantity: 1 });

    assert.equal(order.amountCents, 1990);
    assert.equal(order.plan, "plus");
    assert.equal(order.provider, "wechat");
    assert.equal(order.paymentChannel, "wechat_virtual");
    assert.equal(order.virtualProductId, "plus");
    assert.equal(order.virtualQuantity, 1);
    assert.equal(order.status, "pending");
  });

  it("rejects invalid virtual order product, quantity, and user IDs", async () => {
    const userId = new mongoose.Types.ObjectId().toString();

    await assert.rejects(
      createVirtualPaymentOrder({ userId, productId: "plus", quantity: 2 }),
      /数量非法/,
    );
    await assert.rejects(
      createVirtualPaymentOrder({ userId, productId: "unknown", quantity: 1 }),
      /商品不存在/,
    );
    await assert.rejects(
      createVirtualPaymentOrder({ userId: "invalid", productId: "plus", quantity: 1 }),
      /用户 ID 非法/,
    );
  });

  it("queries every virtual delivery trigger and grants its entitlement only once", async () => {
    await User.deleteMany({});
    await PaymentOrderModel.deleteMany({});
    const user = await User.create({ username: "virtual-paid-user", password: "hashed", wechatMiniOpenid: "openid-1", proPointBalance: 0 });
    const order = await createVirtualPaymentOrder({ userId: String(user._id), productId: "plus", quantity: 1 });
    order.virtualEnvironment = 1;
    await order.save();
    let queryCount = 0;
    const queryOrder = async () => {
      queryCount += 1;
      return { outTradeNo: order.outTradeNo, status: 2, amountCents: 1990, paidAmountCents: 1990, environment: 1 as const, transactionId: "wx-virtual-1", raw: { trusted: true } };
    };
    const trigger = { event: "xpay_goods_deliver_notify" as const, outTradeNo: order.outTradeNo, openid: "openid-1", productId: "plus", quantity: 1, raw: { untrusted: true } };

    await processWechatVirtualNotification(trigger, { queryOrder });
    const first = await User.findById(user._id).lean();
    const firstExpiry = first?.proExpiresAt?.toISOString();
    await processWechatVirtualNotification(trigger, { queryOrder });
    const second = await User.findById(user._id).lean();

    assert.equal(queryCount, 2);
    assert.equal(first?.proPointBalance, 200);
    assert.equal(second?.proPointBalance, 200);
    assert.equal(second?.proExpiresAt?.toISOString(), firstExpiry);
  });

  it("rejects untrusted or mismatched virtual delivery without fulfilling", async () => {
    await User.deleteMany({});
    await PaymentOrderModel.deleteMany({});
    const user = await User.create({ username: "virtual-mismatch-user", password: "hashed", wechatMiniOpenid: "openid-1", proPointBalance: 0 });
    const order = await createVirtualPaymentOrder({ userId: String(user._id), productId: "plus", quantity: 1 });
    order.virtualEnvironment = 1;
    await order.save();
    const base = { outTradeNo: order.outTradeNo, status: 2, amountCents: 1990, paidAmountCents: 1990, environment: 1 as const, transactionId: "wx-virtual-2", raw: {} };
    const trigger = { event: "xpay_goods_deliver_notify" as const, outTradeNo: order.outTradeNo, openid: "openid-1", productId: "plus", quantity: 1, raw: {} };
    for (const queryResult of [{ ...base, amountCents: 9900 }, { ...base, environment: 0 as const }]) {
      await assert.rejects(processWechatVirtualNotification(trigger, { queryOrder: async () => queryResult }), /不匹配/);
    }
    await assert.rejects(processWechatVirtualNotification({ ...trigger, productId: "pro" }, { queryOrder: async () => base }), /不匹配/);
    await assert.rejects(processWechatVirtualNotification({ ...trigger, openid: "other-openid" }, { queryOrder: async () => base }), /不匹配/);
    const savedOrder = await PaymentOrderModel.findById(order._id).lean();
    const savedUser = await User.findById(user._id).lean();
    assert.equal(savedOrder?.status, "pending");
    assert.equal(savedUser?.proPointBalance, 0);
  });

  it("resets issued free account grants without clearing active paid Pro balances", async () => {
    await User.deleteMany({});

    const now = new Date("2026-06-12T00:00:00.000Z");
    const freeUser = await User.create({
      username: "free-reset-user",
      password: "hashed",
      proStatus: "none",
      proPointBalance: 100,
      proFreeGrantDate: "2026-06-12",
      proFreeGrantMonth: "2026-06",
      proFreeGrantedThisMonth: 500,
    });
    const expiredUser = await User.create({
      username: "expired-reset-user",
      password: "hashed",
      proStatus: "active",
      proPlan: "plus",
      proExpiresAt: new Date("2026-06-01T00:00:00.000Z"),
      proPointBalance: 80,
      proFreeGrantDate: "2026-06-12",
      proFreeGrantMonth: "2026-06",
      proFreeGrantedThisMonth: 300,
    });
    const activeUser = await User.create({
      username: "active-paid-user",
      password: "hashed",
      proStatus: "active",
      proPlan: "monthly",
      proExpiresAt: new Date("2026-07-12T00:00:00.000Z"),
      proPointBalance: 200,
      proFreeGrantDate: "2026-06-12",
      proFreeGrantMonth: "2026-06",
      proFreeGrantedThisMonth: 100,
    });

    const result = await resetFreeAccountPointGrants(now);

    assert.equal(result.matchedCount, 2);
    assert.equal(result.modifiedCount, 2);

    const savedFree = await User.findById(freeUser._id).lean();
    assert.equal(savedFree?.proPointBalance, 30);
    assert.equal(savedFree?.proFreeGrantDate, "");
    assert.equal(savedFree?.proFreeGrantMonth, "");
    assert.equal(savedFree?.proFreeGrantedThisMonth, 0);

    const savedExpired = await User.findById(expiredUser._id).lean();
    assert.equal(savedExpired?.proPointBalance, 30);
    assert.equal(savedExpired?.proFreeGrantDate, "");
    assert.equal(savedExpired?.proFreeGrantMonth, "");
    assert.equal(savedExpired?.proFreeGrantedThisMonth, 0);

    const savedActive = await User.findById(activeUser._id).lean();
    assert.equal(savedActive?.proPointBalance, 200);
    assert.equal(savedActive?.proFreeGrantDate, "2026-06-12");
    assert.equal(savedActive?.proFreeGrantMonth, "2026-06");
    assert.equal(savedActive?.proFreeGrantedThisMonth, 100);
  });

  it("adds purchased package points to existing balances and stores the current membership tier", async () => {
    await User.deleteMany({});

    const user = await User.create({
      username: "top-up-user",
      password: "hashed",
      proStatus: "active",
      proPlan: "plus",
      proExpiresAt: new Date("2026-06-20T00:00:00.000Z"),
      proPointBalance: 15,
    });

    await grantProForOrder({
      _id: new mongoose.Types.ObjectId(),
      userId: user._id,
      plan: "pro",
    } as any, new Date("2026-06-05T00:00:00.000Z"));

    const saved = await User.findById(user._id).lean();
    assert.equal(saved?.proStatus, "active");
    assert.equal(saved?.proPlan, "pro");
    assert.equal(saved?.proPointBalance, 1215);
  });

  it("returns the newest still-paid order as the next refundable order", async () => {
    await User.deleteMany({});
    await PaymentOrderModel.deleteMany({});

    const user = await User.create({
      username: "multi-refund-user",
      password: "hashed",
      proStatus: "active",
      proPlan: "plus",
      proExpiresAt: new Date("2026-08-06T00:00:00.000Z"),
      proPointBalance: 400,
    });

    const firstPaidOrder = await PaymentOrderModel.create({
      userId: user._id,
      plan: "plus",
      provider: "wechat",
      amountCents: 1990,
      currency: "CNY",
      subject: "订阅 Plus",
      outTradeNo: "XFPROREFUNDORDER1",
      status: "paid",
      paidAt: new Date("2026-07-06T09:00:00.000Z"),
    });
    await PaymentOrderModel.create({
      userId: user._id,
      plan: "plus",
      provider: "wechat",
      amountCents: 1990,
      currency: "CNY",
      subject: "订阅 Plus",
      outTradeNo: "XFPROREFUNDORDER2",
      status: "refunded",
      paidAt: new Date("2026-07-06T10:00:00.000Z"),
      refundedAt: new Date("2026-07-06T10:10:00.000Z"),
    });

    const refundableOrder = await getLatestRefundableOrder(String(user._id));

    assert.equal(String(refundableOrder?._id), String(firstPaidOrder._id));
    assert.equal(refundableOrder?.status, "paid");
  });
});
