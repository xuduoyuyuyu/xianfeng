import crypto from "crypto";
import mongoose from "mongoose";
import PaymentOrderModel, { BillingPlanId as PaymentOrderPlanId, PaymentOrder, PaymentProviderId } from "../models/PaymentOrder";
import RefundRecordModel from "../models/RefundRecord";
import User from "../models/User";
import { getVirtualProduct } from "./virtualPaymentProducts";
import { queryWechatVirtualOrder, type VerifiedVirtualOrder, type WechatVirtualNotification } from "./wechatVirtualPayment";

export type ProStatus = "none" | "active" | "expired" | "refunded";

export type BillingPlanId = "plus" | "pro";
export type LegacyBillingPlanId = "monthly" | "yearly";
export type BillingPlanCatalogId = BillingPlanId | LegacyBillingPlanId | "free";

export type BillingPlan = {
  id: BillingPlanCatalogId;
  name: string;
  amountCents: number;
  durationMonths: number;
  description: string;
  pointsPerCycle: number;
};

export type ProPointBalanceResult = {
  ok: boolean;
  remainingPointBalance: number;
  message?: string;
};

export type PointUsagePolicyItem = {
  featureKey: string;
  name: string;
  cost: number;
  description: string;
};

export const FREE_DAILY_LOGIN_GRANT_POINTS = 10;
export const FREE_MONTHLY_LOGIN_GRANT_CAP_POINTS = 30;

export const POINT_USAGE_POLICY: Record<string, PointUsagePolicyItem> = {
  xiaowanzi: {
    featureKey: "xiaowanzi",
    name: "小玩子对话",
    cost: 1,
    description: "每发送 1 次小玩子 AI 对话扣 1 点。",
  },
  xiaowanzi_file: {
    featureKey: "xiaowanzi_file",
    name: "小玩子图片文件处理",
    cost: 1,
    description: "每处理 1 张小玩子图片或文件扣 1 点。",
  },
  ai_chat: {
    featureKey: "ai_chat",
    name: "兼容 AI 聊天",
    cost: 1,
    description: "每次通用 AI 聊天请求扣 1 点。",
  },
  guest_agent: {
    featureKey: "guest_agent",
    name: "嘉宾 AI 分身",
    cost: 3,
    description: "每向嘉宾 AI 分身提问 1 次扣 3 点。",
  },
  topic_submit: {
    featureKey: "topic_submit",
    name: "请教一下",
    cost: 5,
    description: "每次生成或提交深度话题扣 5 点。",
  },
  education_planning: {
    featureKey: "education_planning",
    name: "智能教育规划",
    cost: 5,
    description: "每次生成智能教育规划扣 5 点。",
  },
  worthbuy_analysis: {
    featureKey: "worthbuy_analysis",
    name: "知物新分析",
    cost: 5,
    description: "每次发起新的商品/品牌 AI 分析扣 5 点。",
  },
};

export const PUBLIC_POINT_USAGE_POLICY = Object.values(POINT_USAGE_POLICY).filter((item) => item.featureKey !== "ai_chat");

export const BILLING_PLANS: Record<BillingPlanId, BillingPlan> = {
  plus: {
    id: "plus",
    name: "Plus",
    amountCents: 1990,
    durationMonths: 1,
    pointsPerCycle: 200,
    description: "Plus 兑换 200 点，用完可继续补充。",
  },
  pro: {
    id: "pro",
    name: "Pro",
    amountCents: 9900,
    durationMonths: 12,
    pointsPerCycle: 1200,
    description: "Pro 兑换 1,200 点，适合长期使用。",
  },
};

export const FREE_BILLING_PLAN: BillingPlan = {
  id: "free",
  name: "Free",
  amountCents: 0,
  durationMonths: 0,
  pointsPerCycle: FREE_DAILY_LOGIN_GRANT_POINTS,
  description: "免费账户每天登录可获取10点，每月上限30点",
};

type OrderLike = {
  status?: string;
  paidAt?: Date | string | null;
};

type RefundOrderLike = OrderLike & {
  plan?: unknown;
  amountCents?: unknown;
};

type RefundUserLike = {
  proPointBalance?: unknown;
};

type UserProLike = {
  proStatus?: string;
  proExpiresAt?: Date | string | null;
};

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

type SpendPointsInput = {
  userId: string;
  featureKey: string;
  points: number;
  now?: Date;
};

function pointDeficitMessage(featureKey: string, remaining: number): string {
  return `${featureKey} 当前可用点数不足，剩余 ${remaining} 点。请先升级套餐或续费后再继续。`;
}

function safePointBalance(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric * 100) / 100);
}

function defaultPointBalanceForPlan(planId: BillingPlanCatalogId): number {
  return planId === "free" ? 0 : planPoints(planId);
}

function normalizeStoredBillingPlan(value: unknown): BillingPlanId | null {
  if (value === "plus" || value === "monthly") return "plus";
  if (value === "pro" || value === "yearly") return "pro";
  return null;
}

function membershipLabel(planId: BillingPlanCatalogId): string {
  const normalized = normalizeStoredBillingPlan(planId);
  if (normalized === "plus") return "Plus";
  if (normalized === "pro") return "Pro";
  return "Free";
}

function chinaDateParts(now: Date): { dateKey: string; monthKey: string } {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return {
    dateKey: `${year}-${month}-${day}`,
    monthKey: `${year}-${month}`,
  };
}

export function calculateFreeLoginPointGrant(input: {
  balance?: unknown;
  grantDate?: unknown;
  grantMonth?: unknown;
  grantedThisMonth?: unknown;
  now?: Date;
}) {
  const { dateKey, monthKey } = chinaDateParts(input.now || new Date());
  const grantedThisMonth = String(input.grantMonth || "") === monthKey
    ? Math.min(FREE_MONTHLY_LOGIN_GRANT_CAP_POINTS, safePointBalance(input.grantedThisMonth, 0))
    : 0;
  const currentBalance = Math.min(FREE_MONTHLY_LOGIN_GRANT_CAP_POINTS, safePointBalance(input.balance, 0));

  if (String(input.grantDate || "") === dateKey) {
    return {
      grantedPoints: 0,
      pointBalance: currentBalance,
      grantDate: dateKey,
      grantMonth: monthKey,
      grantedThisMonth,
    };
  }

  const remainingMonthlyGrant = Math.max(0, FREE_MONTHLY_LOGIN_GRANT_CAP_POINTS - grantedThisMonth);
  const grantedPoints = Math.min(FREE_DAILY_LOGIN_GRANT_POINTS, remainingMonthlyGrant);

  return {
    grantedPoints,
    pointBalance: Math.min(FREE_MONTHLY_LOGIN_GRANT_CAP_POINTS, currentBalance + grantedPoints),
    grantDate: dateKey,
    grantMonth: monthKey,
    grantedThisMonth: grantedThisMonth + grantedPoints,
  };
}

export function normalizeBillingPlan(value: unknown): BillingPlanId | null {
  return normalizeStoredBillingPlan(value);
}

export function getCatalogPlanById(planId: BillingPlanCatalogId): BillingPlan {
  const normalized = normalizeStoredBillingPlan(planId);
  return normalized ? BILLING_PLANS[normalized] : FREE_BILLING_PLAN;
}

function planPoints(planId: BillingPlanCatalogId): number {
  return getCatalogPlanById(planId).pointsPerCycle;
}

export function getPointCostForFeature(featureKey: string, overrideCost?: number): number {
  const normalizedOverride = Number(overrideCost);
  if (Number.isFinite(normalizedOverride) && normalizedOverride > 0) {
    return Math.round(normalizedOverride * 100) / 100;
  }
  return POINT_USAGE_POLICY[featureKey]?.cost || 1;
}

export function isMockPaymentEnabled(): boolean {
  if (process.env.BILLING_ENABLE_MOCK_PAY === "true") return true;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.BILLING_DISABLE_MOCK_PAY !== "true";
}

export function isProBillingEnabled(): boolean {
  return process.env.PRO_BILLING_ENABLED === "true";
}

export function isProActive(user: UserProLike | null | undefined, now = new Date()): boolean {
  if (!user || user.proStatus !== "active") return false;
  const expiresAt = asDate(user.proExpiresAt);
  return !!expiresAt && expiresAt.getTime() > now.getTime();
}

export function addPlanDuration(planId: BillingPlanId, now = new Date(), existingExpiry?: Date | string | null): Date {
  const base = (() => {
    const expiry = asDate(existingExpiry);
    return expiry && expiry.getTime() > now.getTime() ? new Date(expiry) : new Date(now);
  })();
  const next = new Date(base);
  const normalizedPlan = normalizeBillingPlan(planId);
  if (!normalizedPlan) throw new Error("请选择有效套餐");
  next.setMonth(next.getMonth() + BILLING_PLANS[normalizedPlan].durationMonths);
  return next;
}

export function canRefundOrder(order: OrderLike, _now = new Date()): { ok: boolean; reason?: string; deadline?: Date } {
  if (order.status !== "paid") {
    return { ok: false, reason: "订单未支付或已退款，无法申请退款" };
  }
  const paidAt = asDate(order.paidAt);
  if (!paidAt) {
    return { ok: false, reason: "订单缺少支付时间，无法申请退款" };
  }
  return { ok: true };
}

export function calculatePointBasedRefund(order: RefundOrderLike, user: RefundUserLike | null | undefined) {
  const baseCheck = canRefundOrder(order);
  const plan = normalizeStoredBillingPlan(order.plan);
  const amountCents = Math.max(0, Math.floor(Number(order.amountCents) || 0));
  const totalPoints = plan ? planPoints(plan) : 0;
  if (!baseCheck.ok) {
    return { ok: false, reason: baseCheck.reason, amountCents: 0, totalPoints, refundablePoints: 0, usedPoints: 0 };
  }
  if (!plan || totalPoints <= 0 || amountCents <= 0) {
    return { ok: false, reason: "订单套餐信息异常，无法申请退款", amountCents: 0, totalPoints, refundablePoints: 0, usedPoints: 0 };
  }

  const currentBalance = safePointBalance(user?.proPointBalance, 0);
  const refundablePoints = Math.min(totalPoints, currentBalance);
  const usedPoints = Math.max(0, totalPoints - refundablePoints);
  const refundableAmountCents = Math.floor((amountCents * refundablePoints) / totalPoints);
  if (refundablePoints <= 0 || refundableAmountCents <= 0) {
    return {
      ok: false,
      reason: "当前套餐点数已用完，无可退金额",
      amountCents: 0,
      totalPoints,
      refundablePoints,
      usedPoints,
    };
  }

  return {
    ok: true,
    amountCents: refundableAmountCents,
    totalPoints,
    refundablePoints,
    usedPoints,
  };
}

function amountText(cents: number): string {
  return (cents / 100).toFixed(2);
}

function createTradeNo(): string {
  return `XFPRO${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function createRefundNo(): string {
  return `XFRF${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export function serializePlan(plan: BillingPlan) {
  return {
    ...plan,
    amountYuan: amountText(plan.amountCents),
  };
}

export function serializeBillingUser(user: any, now = new Date()) {
  const active = isProActive(user, now);
  const expiresAt = asDate(user?.proExpiresAt);
  const activePlan = active ? normalizeStoredBillingPlan(user?.proPlan) : null;
  const currentPlan: BillingPlanCatalogId = activePlan || "free";
  const rawBalance = Number(user?.proPointBalance);
  const pointBalance = Number.isFinite(rawBalance)
    ? Math.max(0, activePlan ? rawBalance : Math.min(rawBalance, FREE_MONTHLY_LOGIN_GRANT_CAP_POINTS))
    : defaultPointBalanceForPlan(currentPlan);
  const tier = activePlan || "free";
  return {
    proPointBalance: pointBalance,
    proStatus: active ? "active" : user?.proStatus === "refunded" ? "refunded" : expiresAt && expiresAt <= now ? "expired" : user?.proStatus || "none",
    proPlan: activePlan || "",
    membershipTier: tier,
    membershipLabel: membershipLabel(tier),
    proExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    proPurchasedAt: asDate(user?.proPurchasedAt)?.toISOString() || null,
    proRefundEligibleUntil: null,
    proLatestOrderId: user?.proLatestOrderId ? String(user.proLatestOrderId) : "",
    isProActive: active,
    canRefundLatestOrder: active && !!user?.proLatestOrderId,
  };
}

export async function grantFreeLoginPointsForUser(user: any, now = new Date()) {
  if (!user || isProActive(user, now)) return user;
  const next = calculateFreeLoginPointGrant({
    balance: user.proPointBalance,
    grantDate: user.proFreeGrantDate,
    grantMonth: user.proFreeGrantMonth,
    grantedThisMonth: user.proFreeGrantedThisMonth,
    now,
  });
  user.proPointBalance = next.pointBalance;
  user.proFreeGrantDate = next.grantDate;
  user.proFreeGrantMonth = next.grantMonth;
  user.proFreeGrantedThisMonth = next.grantedThisMonth;
  if (typeof user.save === "function") await user.save();
  return user;
}

export async function resetFreeAccountPointGrants(now = new Date()) {
  const filter = {
    $or: [
      { proStatus: { $ne: "active" } },
      { proExpiresAt: { $exists: false } },
      { proExpiresAt: null },
      { proExpiresAt: { $lte: now } },
    ],
  };
  const result = await User.collection.updateMany(
    filter,
    [
      {
        $set: {
          proPointBalance: { $min: ["$proPointBalance", FREE_MONTHLY_LOGIN_GRANT_CAP_POINTS] },
          proFreeGrantDate: "",
          proFreeGrantMonth: "",
          proFreeGrantedThisMonth: 0,
        },
      },
    ]
  );

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  };
}

export async function createPaymentOrder(input: {
  userId: string;
  plan: BillingPlanId;
  provider?: PaymentProviderId;
}): Promise<PaymentOrder> {
  if (!mongoose.Types.ObjectId.isValid(input.userId)) {
    throw new Error("用户 ID 非法");
  }
  const plan = BILLING_PLANS[input.plan];
  const order = await PaymentOrderModel.create({
    userId: new mongoose.Types.ObjectId(input.userId),
    plan: input.plan,
    provider: input.provider || "alipay",
    amountCents: plan.amountCents,
    currency: "CNY",
    subject: `订阅 ${plan.name}`,
    outTradeNo: createTradeNo(),
    status: "pending",
  });
  return order;
}

export async function createVirtualPaymentOrder(input: {
  userId: string;
  productId: unknown;
  quantity: number;
}): Promise<PaymentOrder> {
  if (!mongoose.Types.ObjectId.isValid(input.userId)) {
    throw new Error("用户 ID 非法");
  }
  const product = getVirtualProduct(input.productId);
  if (!product) {
    throw new Error("虚拟商品不存在");
  }
  if (input.quantity !== product.maxQuantity) {
    throw new Error("虚拟商品数量非法");
  }
  const environmentText = String(process.env.WECHAT_VIRTUAL_PAY_ENV || "").trim();
  const virtualEnvironment: 0 | 1 | null = environmentText === "0" ? 0 : environmentText === "1" ? 1 : null;
  return PaymentOrderModel.create({
    userId: new mongoose.Types.ObjectId(input.userId),
    plan: product.plan,
    provider: "wechat",
    paymentChannel: "wechat_virtual",
    amountCents: product.amountCents,
    currency: "CNY",
    subject: `订阅 ${product.name}`,
    outTradeNo: createTradeNo(),
    status: "pending",
    virtualProductId: product.productId,
    virtualQuantity: input.quantity,
    virtualEnvironment,
  });
}

export async function processWechatVirtualNotification(
  notification: WechatVirtualNotification,
  dependencies: { queryOrder?: (input: { outTradeNo: string; openid: string }) => Promise<VerifiedVirtualOrder> } = {},
): Promise<PaymentOrder | null> {
  if (notification.event !== "xpay_goods_deliver_notify") return null;
  const order = await PaymentOrderModel.findOne({ outTradeNo: notification.outTradeNo });
  if (!order || order.paymentChannel !== "wechat_virtual") throw new Error("微信虚拟支付订单不存在");

  const trusted = await (dependencies.queryOrder || queryWechatVirtualOrder)({
    outTradeNo: order.outTradeNo,
    openid: notification.openid,
  });
  const user = await User.findById(order.userId).select("wechatMiniOpenid").lean();
  const boundOpenid = String(user?.wechatMiniOpenid || "").trim();
  const product = getVirtualProduct(order.virtualProductId);
  const mismatch = trusted.outTradeNo !== order.outTradeNo
    || trusted.status !== 2
    || trusted.amountCents !== order.amountCents
    || trusted.paidAmountCents !== order.amountCents
    || trusted.environment !== order.virtualEnvironment
    || !trusted.transactionId
    || (order.providerTradeNo && order.providerTradeNo !== trusted.transactionId)
    || !product
    || trusted.bizMeta.orderId !== order.outTradeNo
    || trusted.bizMeta.userId !== String(order.userId)
    || trusted.bizMeta.productId !== order.virtualProductId
    || trusted.bizMeta.quantity !== order.virtualQuantity
    || (boundOpenid && boundOpenid !== notification.openid);
  if (mismatch) throw new Error("微信虚拟支付查单结果与本地订单不匹配");

  return markOrderPaid({
    outTradeNo: order.outTradeNo,
    providerTradeNo: trusted.transactionId,
    rawNotify: { trigger: notification.raw, verifiedOrder: trusted.raw },
  });
}

export async function markOrderPaid(input: {
  outTradeNo: string;
  providerTradeNo?: string;
  paidAt?: Date;
  rawNotify?: Record<string, any>;
  afterEntitlement?: () => Promise<void>;
}): Promise<PaymentOrder> {
  const order = await PaymentOrderModel.findOne({ outTradeNo: input.outTradeNo });
  if (!order) throw new Error("订单不存在");
  if (order.status === "paid") return order;
  if (order.status === "refunded") return order;

  const paidAt = input.paidAt || new Date();
  await grantProForOrder(order, paidAt);
  await input.afterEntitlement?.();
  order.status = "paid";
  order.providerTradeNo = input.providerTradeNo || order.providerTradeNo || "";
  order.paidAt = paidAt;
  order.rawNotify = input.rawNotify || {};
  await order.save();
  return order;
}

export async function consumeProPoints(input: SpendPointsInput): Promise<ProPointBalanceResult> {
  if (!mongoose.Types.ObjectId.isValid(input.userId)) {
    return { ok: false, remainingPointBalance: 0, message: "用户不存在" };
  }
  const now = input.now || new Date();
  const user = await User.findById(input.userId).select("proStatus proExpiresAt proPlan proPointBalance").lean();
  if (!user) {
    return { ok: false, remainingPointBalance: 0, message: "用户不存在" };
  }

  const active = isProActive(user, now);
  const currentPlan: BillingPlanCatalogId = active ? normalizeStoredBillingPlan(user?.proPlan) || "free" : "free";

  const pointsToSpend = Number(input.points);
  const spend = Number.isFinite(pointsToSpend) && pointsToSpend > 0 ? Math.round(pointsToSpend * 100) / 100 : 1;
  const currentBalance = safePointBalance((user as any).proPointBalance, planPoints(currentPlan));

  if (currentBalance < spend) {
    return {
      ok: false,
      remainingPointBalance: currentBalance,
      message: pointDeficitMessage(input.featureKey, currentBalance),
    };
  }

  const updated = await User.findOneAndUpdate(
    { _id: input.userId, proPointBalance: { $gte: spend } },
    { $inc: { proPointBalance: -spend } },
    { new: true }
  ).select("proPointBalance");

  if (!updated) {
    return {
      ok: false,
      remainingPointBalance: currentBalance,
      message: pointDeficitMessage(input.featureKey, currentBalance),
    };
  }
  const remaining = safePointBalance((updated as any).proPointBalance, 0);
  return {
    ok: true,
    remainingPointBalance: remaining,
  };
}

export async function grantProForOrder(order: PaymentOrder, paidAt = new Date()) {
  const user = await User.findById(order.userId).lean();
  if (!user) throw new Error("用户不存在");
  const plan = normalizeBillingPlan(order.plan);
  if (!plan) throw new Error("请选择有效套餐");
  const expiresAt = addPlanDuration(plan, paidAt, (user as any).proExpiresAt);
  const updated = await User.findOneAndUpdate(
    { _id: order.userId, fulfilledPaymentOrderIds: { $ne: order._id } },
    {
      $set: { proStatus: "active", proPlan: plan, proPurchasedAt: paidAt, proExpiresAt: expiresAt, proRefundEligibleUntil: null, proLatestOrderId: order._id },
      $inc: { proPointBalance: planPoints(plan) },
      $addToSet: { fulfilledPaymentOrderIds: order._id },
    },
    { returnDocument: "after" },
  );
  return updated || User.findById(order.userId);
}

export async function recomputeUserProFromOrders(userId: string) {
  const objectId = new mongoose.Types.ObjectId(userId);
  const paidOrders = await PaymentOrderModel.find({ userId: objectId, status: "paid" }).sort({ paidAt: 1, createdAt: 1 });
  const user = await User.findById(objectId);
  if (!user) throw new Error("用户不存在");

  let expiry: Date | null = null;
  let latest: PaymentOrder | null = null;
  for (const order of paidOrders) {
    const paidAt = asDate(order.paidAt) || asDate(order.createdAt) || new Date();
    const plan = normalizeBillingPlan(order.plan);
    if (!plan) continue;
    expiry = addPlanDuration(plan, paidAt, expiry);
    latest = order;
  }

  if (!expiry || expiry.getTime() <= Date.now()) {
    (user as any).proStatus = latest ? "expired" : "refunded";
    (user as any).proPlan = latest?.plan || "";
    (user as any).proExpiresAt = expiry;
    (user as any).proRefundEligibleUntil = null;
    (user as any).proLatestOrderId = latest?._id || null;
    (user as any).proPointBalance = Math.min(safePointBalance((user as any).proPointBalance, 0), FREE_MONTHLY_LOGIN_GRANT_CAP_POINTS);
  } else {
    const latestPlan = normalizeBillingPlan(latest?.plan);
    (user as any).proStatus = "active";
    (user as any).proPlan = latestPlan || "";
    (user as any).proExpiresAt = expiry;
    (user as any).proPurchasedAt = latest?.paidAt || latest?.createdAt || null;
    (user as any).proRefundEligibleUntil = null;
    (user as any).proLatestOrderId = latest?._id || null;
    (user as any).proPointBalance = safePointBalance((user as any).proPointBalance, 0);
  }

  await user.save();
  return user;
}

export async function createRefundRecord(order: PaymentOrder, reason: string, amountCents = order.amountCents, options: { refundablePoints?: number } = {}) {
  return RefundRecordModel.create({
    orderId: order._id,
    userId: order.userId,
    provider: order.provider,
    amountCents,
    refundablePoints: safePointBalance(options.refundablePoints, 0),
    reason: reason || "按未使用点数折算退款",
    outRequestNo: createRefundNo(),
    status: "pending",
  });
}

export async function markRefundSucceeded(order: PaymentOrder, refund: any, rawResult: Record<string, any> = {}, options: { refundablePoints?: number } = {}) {
  refund.status = "succeeded";
  refund.refundedAt = new Date();
  refund.rawResult = rawResult;
  refund.providerRefundId = String(rawResult?.trade_no || rawResult?.refund_id || rawResult?.out_request_no || "");
  await refund.save();

  const refundablePoints = safePointBalance(options.refundablePoints, 0);
  if (refundablePoints > 0) {
    const user = await User.findById(order.userId);
    if (user) {
      (user as any).proPointBalance = Math.max(0, safePointBalance((user as any).proPointBalance, 0) - refundablePoints);
      await user.save();
    }
  }

  order.status = "refunded";
  order.refundedAt = refund.refundedAt;
  await order.save();

  await recomputeUserProFromOrders(String(order.userId));
  return refund;
}

export async function getLatestRefundableOrder(userId: string) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  return PaymentOrderModel.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    status: "paid",
  }).sort({ paidAt: -1, createdAt: -1 });
}
