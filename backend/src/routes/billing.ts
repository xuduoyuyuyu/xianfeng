import { Router } from "express";
import PaymentOrderModel from "../models/PaymentOrder";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import { requirePro } from "../middlewares/requirePro";
import {
  BILLING_PLANS,
  FREE_BILLING_PLAN,
  POINT_USAGE_POLICY,
  PUBLIC_POINT_USAGE_POLICY,
  canRefundOrder,
  calculatePointBasedRefund,
  createPaymentOrder,
  createVirtualPaymentOrder,
  grantFreeLoginPointsForUser,
  getLatestRefundableOrder,
  isMockPaymentEnabled,
  markOrderPaid,
  normalizeBillingPlan,
  processWechatVirtualNotification,
  refundWechatVirtualOrder,
  serializeBillingUser,
  serializePlan,
  syncWechatVirtualPaidOrder,
} from "../services/billing";
import {
  createAlipayCheckout,
  createWechatCheckout,
  createWechatMiniProgramCheckout,
  handleAlipayNotify,
  handleWechatNotify,
  refundAlipayOrder,
  refundWechatOrder,
  syncWechatPaidOrder,
  syncRecentWechatRefundsForUser,
} from "../services/paymentProviders";
import { createWechatVirtualCheckout, exchangeWechatLoginCode, isWechatVirtualPaymentConfigured, parseWechatVirtualNotification, verifyWechatMessageCallback } from "../services/wechatVirtualPayment";
import { getVirtualProduct } from "../services/virtualPaymentProducts";
import User from "../models/User";
import RefundRecordModel from "../models/RefundRecord";

const router = Router();

function serializeOrder(order: any) {
  return {
    id: String(order._id),
    plan: order.plan,
    provider: order.provider,
    amountCents: order.amountCents,
    currency: order.currency,
    subject: order.subject,
    outTradeNo: order.outTradeNo,
    providerTradeNo: order.providerTradeNo || "",
    status: order.status,
    paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
    refundedAt: order.refundedAt ? new Date(order.refundedAt).toISOString() : null,
    createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
  };
}

function statusLabel(order: any) {
  if (order.status === "paid") return "已支付";
  if (order.status === "refunded") return "已退款";
  if (order.status === "pending") return "待支付";
  if (order.status === "closed") return "已关闭";
  if (order.status === "failed") return "支付失败";
  return "未知状态";
}

function formatAmount(cents: number) {
  return (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
}

function formatPaymentTime(value: any) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function refundRecordStatusLabel(refund: any) {
  if (!refund) return "";
  if (refund.status === "pending") return "退款处理中";
  if (refund.status === "succeeded") return "已退款";
  if (refund.status === "failed") return refund.errorMessage ? `退款失败：${refund.errorMessage}` : "退款失败";
  return "";
}

function serializePaymentOrder(order: any, user: any, latestRefund?: any) {
  const base = serializeOrder(order);
  const pointRefund = calculatePointBasedRefund(order, user);
  const latestRefundLabel = refundRecordStatusLabel(latestRefund);
  const refundRetryBlocked = latestRefund?.status === "pending"
    || latestRefund?.status === "succeeded"
    || (latestRefund?.status === "failed" && String(latestRefund?.errorMessage || "").includes("OS订单不支持开发者发起退款"));
  const refundable = canRefundOrder(order).ok && pointRefund.ok && !refundRetryBlocked;
  return {
    ...base,
    amountYuan: formatAmount(order.amountCents),
    paidAtText: formatPaymentTime(order.paidAt || order.createdAt),
    statusLabel: statusLabel(order),
    canRefund: refundable,
    refundablePoints: refundable ? pointRefund.refundablePoints : 0,
    refundableAmountCents: refundable ? pointRefund.amountCents : 0,
    refundableAmountYuan: formatAmount(refundable ? pointRefund.amountCents : 0),
    latestRefund: latestRefund ? {
      id: String(latestRefund._id),
      status: latestRefund.status,
      amountCents: latestRefund.amountCents,
      refundablePoints: latestRefund.refundablePoints || 0,
      errorMessage: latestRefund.errorMessage || "",
      refundedAt: latestRefund.refundedAt ? new Date(latestRefund.refundedAt).toISOString() : null,
      createdAt: latestRefund.createdAt ? new Date(latestRefund.createdAt).toISOString() : null,
    } : null,
    refundStatusLabel: order.status === "refunded"
      ? "已退款"
      : latestRefundLabel
        ? latestRefundLabel
      : refundable
        ? "可申请退款"
        : order.status === "paid"
          ? pointRefund.reason || "不可退款"
          : statusLabel(order),
  };
}

function currentUserId(req: AuthenticatedRequest): string {
  return String(req.user?.id || "");
}

function isWechatMiniProgramRequest(req: AuthenticatedRequest): boolean {
  const channel = String(req.body?.channel || "").trim();
  const userAgent = String(req.headers["user-agent"] || "").toLowerCase();
  const referer = String(req.headers.referer || req.headers.referrer || "").toLowerCase();
  return channel === "mini_program"
    || userAgent.includes("miniprogramenv")
    || referer.includes("servicewechat.com/");
}

async function findOwnedOrder(req: AuthenticatedRequest, orderId: string) {
  const order = await PaymentOrderModel.findById(orderId);
  if (!order) return null;
  if (req.user?.role === "admin" || String(order.userId) === currentUserId(req)) return order;
  return null;
}

async function syncPendingWechatOrder(order: any) {
  if (!order || order.provider !== "wechat" || order.status !== "pending") return order;
  try {
    return await syncWechatPaidOrder(order);
  } catch (error) {
    console.error("Wechat pay order sync failed:", error);
    return order;
  }
}

async function syncRecentPendingWechatOrders(userId: string) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const orders = await PaymentOrderModel.find({
    userId,
    provider: "wechat",
    status: "pending",
    createdAt: { $gte: cutoff },
  }).sort({ createdAt: -1 }).limit(5);
  for (const order of orders) {
    await syncPendingWechatOrder(order);
  }
}

router.get("/plans", (_req, res) => {
  res.json({
    plans: {
      free: serializePlan(FREE_BILLING_PLAN),
      plus: serializePlan(BILLING_PLANS.plus),
      pro: serializePlan(BILLING_PLANS.pro),
    },
    refundPolicy: {
      fullRefundDays: 0,
      mode: "points_prorated",
      description: "退款按未使用点数折算，可退金额=订单金额×剩余可退点数/套餐点数；退款后对应点数扣回。",
    },
    providers: {
      alipay: { enabled: false, note: "支付宝暂不启用" },
      wechat: { enabled: true },
    },
    usagePolicy: PUBLIC_POINT_USAGE_POLICY,
    virtualProducts: [getVirtualProduct("plus"), getVirtualProduct("pro")].map((product) => ({
      productId: product!.productId,
      name: product!.name,
      amountCents: product!.amountCents,
      points: product!.points,
    })),
  });
});

router.get("/me", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = currentUserId(req);
  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ message: "用户不存在" });
    return;
  }
  await grantFreeLoginPointsForUser(user);
  await syncRecentPendingWechatOrders(userId);
  await syncRecentWechatRefundsForUser(userId);
  const [freshUser, latestOrder, latestRefundableOrder, paymentOrders] = await Promise.all([
    User.findById(userId),
    PaymentOrderModel.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    getLatestRefundableOrder(userId),
    PaymentOrderModel.find({ userId: user._id, status: { $in: ["paid", "refunded"] } }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const orderIds = paymentOrders.map((order) => order._id);
  const refundRecords = orderIds.length
    ? await RefundRecordModel.find({ userId: user._id, orderId: { $in: orderIds } }).sort({ createdAt: -1 }).lean()
    : [];
  const latestRefundByOrderId = new Map<string, any>();
  for (const refund of refundRecords) {
    const key = String(refund.orderId);
    if (!latestRefundByOrderId.has(key)) latestRefundByOrderId.set(key, refund);
  }
  const membership = serializeBillingUser(freshUser || user);
  membership.canRefundLatestOrder = !!(
    membership.isProActive
    && latestRefundableOrder
    && calculatePointBasedRefund(latestRefundableOrder, freshUser || user).ok
  );
  res.json({
    membership,
    latestOrder: latestOrder ? serializeOrder(latestOrder) : null,
    latestRefundableOrder: latestRefundableOrder ? serializeOrder(latestRefundableOrder) : null,
    paymentOrders: paymentOrders.map((order) => serializePaymentOrder(order, freshUser || user, latestRefundByOrderId.get(String(order._id)))),
  });
});

router.post("/orders", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (isWechatMiniProgramRequest(req)) {
      res.status(400).json({ message: "微信小程序内虚拟商品购买必须使用微信虚拟支付，请返回小程序订阅页完成支付" });
      return;
    }
    const plan = normalizeBillingPlan(req.body?.plan);
    if (!plan) {
      res.status(400).json({ message: "请选择有效套餐" });
      return;
    }
    const provider = req.body?.provider === "alipay" ? "alipay" : "wechat";
    const order = await createPaymentOrder({ userId: currentUserId(req), plan, provider });
    let checkout;
    if (provider === "wechat" && req.body?.channel === "mini_program") {
      const user = await User.findById(currentUserId(req)).lean();
      checkout = await createWechatMiniProgramCheckout(order, user?.wechatMiniOpenid);
    } else {
      checkout = provider === "wechat" ? await createWechatCheckout(order) : await createAlipayCheckout(order);
    }
    res.status(201).json({ order: serializeOrder(order), checkout });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "创建订单失败" });
  }
});

router.post("/virtual-orders", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isWechatVirtualPaymentConfigured()) {
    res.status(503).json({ message: "微信虚拟支付暂不可用" });
    return;
  }
  const productId = req.body?.productId;
  const quantity = req.body?.quantity;
  const loginCode = String(req.body?.loginCode || "").trim();
  if (!getVirtualProduct(productId) || quantity !== 1) {
    res.status(400).json({ message: "虚拟商品或数量无效" });
    return;
  }
  if (!loginCode) {
    res.status(400).json({ message: "微信登录 code 不能为空" });
    return;
  }
  let session: Awaited<ReturnType<typeof exchangeWechatLoginCode>>;
  try {
    session = await exchangeWechatLoginCode(loginCode);
  } catch (error) {
    console.error("Wechat virtual login exchange failed:", error);
    res.status(400).json({ message: "微信登录状态无效" });
    return;
  }
  try {
    const user = await User.findById(currentUserId(req)).select("wechatMiniOpenid").lean();
    if (!user) {
      res.status(401).json({ message: "登录状态无效" });
      return;
    }
    const boundOpenid = String(user.wechatMiniOpenid || "").trim();
    if (boundOpenid && boundOpenid !== session.openid) {
      res.status(401).json({ message: "微信账号与当前账号不匹配" });
      return;
    }
    const order = await createVirtualPaymentOrder({ userId: currentUserId(req), productId, quantity });
    const checkout = createWechatVirtualCheckout(order, session);
    res.status(201).json({ order: serializeOrder(order), checkout });
  } catch (error: any) {
    console.error("Wechat virtual checkout failed:", error);
    res.status(500).json({ message: "创建虚拟支付订单失败" });
  }
});

router.post("/virtual-orders/:id/sync", authenticate, async (req: AuthenticatedRequest, res) => {
  const order = await findOwnedOrder(req, String(req.params.id));
  if (!order) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  if (order.paymentChannel !== "wechat_virtual") {
    res.status(400).json({ message: "不是微信虚拟支付订单" });
    return;
  }
  const user = await User.findById(order.userId).select("wechatMiniOpenid").lean();
  const openid = String(user?.wechatMiniOpenid || "").trim();
  if (!openid) {
    res.status(400).json({ message: "微信登录状态无效" });
    return;
  }
  try {
    const syncedOrder = await syncWechatVirtualPaidOrder(order, openid, { rawTrigger: { source: "client-sync" } });
    const syncedUser = await User.findById(order.userId).lean();
    res.json({ order: serializeOrder(syncedOrder), membership: serializeBillingUser(syncedUser) });
  } catch (error: any) {
    console.error("Wechat virtual order sync failed:", error);
    res.status(409).json({ message: error?.message || "微信虚拟支付订单尚未确认" });
  }
});

router.get("/orders/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  let order = await findOwnedOrder(req, String(req.params.id));
  if (!order) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  order = await syncPendingWechatOrder(order);
  res.json({ order: serializeOrder(order) });
});

router.post("/orders/:id/mock-pay", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isMockPaymentEnabled()) {
    res.status(404).json({ message: "当前环境未开启模拟支付" });
    return;
  }
  const order = await findOwnedOrder(req, String(req.params.id));
  if (!order) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  if (order.status !== "pending" && order.status !== "paid") {
    res.status(400).json({ message: "当前订单状态无法模拟支付", status: order.status });
    return;
  }
  const paidOrder = order.status === "paid"
    ? order
    : await markOrderPaid({
      outTradeNo: order.outTradeNo,
      providerTradeNo: `MOCK-${order.outTradeNo}`,
      paidAt: new Date(),
      rawNotify: { mock: true, paidBy: currentUserId(req), paidVia: "billing.mock-pay" },
    });
  const user = await User.findById(currentUserId(req)).lean();
  res.json({
    order: serializeOrder(paidOrder),
    membership: serializeBillingUser(user),
  });
});

router.post("/consume/education-planning", authenticate, requirePro("education_planning"), async (req: AuthenticatedRequest, res) => {
  const user = await User.findById(currentUserId(req)).lean();
  res.json({
    ok: true,
    featureKey: "education_planning",
    cost: POINT_USAGE_POLICY.education_planning.cost,
    membership: serializeBillingUser(user),
  });
});

router.post("/alipay/notify", async (req, res) => {
  try {
    await handleAlipayNotify(req.body || {});
    res.type("text/plain").send("success");
  } catch (error) {
    console.error("Alipay notify failed:", error);
    res.type("text/plain").status(400).send("fail");
  }
});

router.post("/wechat/notify", async (req: any, res) => {
  try {
    await handleWechatNotify(req.body || {}, req.headers || {}, req.rawBody || JSON.stringify(req.body || {}));
    res.json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    console.error("Wechat pay notify failed:", error);
    res.status(400).json({ code: "FAIL", message: "失败" });
  }
});

router.route("/wechat/virtual/notify")
  .get((req, res) => {
    const echostr = verifyWechatMessageCallback(req.query || {});
    if (!echostr) {
      res.type("text/plain").status(403).send("fail");
      return;
    }
    res.type("text/plain").send(echostr);
  })
  .post(async (req: any, res) => {
    try {
      const notification = parseWechatVirtualNotification(req.rawBody || JSON.stringify(req.body || {}));
      await processWechatVirtualNotification(notification);
      res.json({ ErrCode: 0, ErrMsg: "success" });
    } catch (error) {
      console.error("Wechat virtual pay notify failed:", error);
      res.status(400).json({ ErrCode: -1, ErrMsg: "fail" });
    }
  });

router.post("/refunds", authenticate, async (req: AuthenticatedRequest, res) => {
  const order = req.body?.orderId
    ? await findOwnedOrder(req, String(req.body.orderId))
    : await getLatestRefundableOrder(currentUserId(req));
  if (!order) {
    res.status(404).json({ message: "没有可退款订单" });
    return;
  }
  if (String(order.userId) !== currentUserId(req) && req.user?.role !== "admin") {
    res.status(403).json({ message: "无权退款该订单" });
    return;
  }
  const refundCheck = canRefundOrder(order);
  if (!refundCheck.ok) {
    res.status(400).json({ message: refundCheck.reason, refundDeadline: refundCheck.deadline?.toISOString() || null });
    return;
  }
  const userForRefund = await User.findById(order.userId).lean();
  const pointRefund = calculatePointBasedRefund(order, userForRefund);
  if (!pointRefund.ok) {
    res.status(400).json({ message: pointRefund.reason, refundablePoints: pointRefund.refundablePoints, amountCents: pointRefund.amountCents });
    return;
  }
  const defaultReason = `按未使用点数折算退款，已用 ${pointRefund.usedPoints} 点`;
  const refundReason = String(req.body?.reason || defaultReason);
  const refund = order.paymentChannel === "wechat_virtual"
    ? await refundWechatVirtualOrder(order, refundReason, pointRefund.amountCents, pointRefund.refundablePoints)
    : order.provider === "wechat"
      ? await refundWechatOrder(order, refundReason, pointRefund.amountCents, pointRefund.refundablePoints)
      : await refundAlipayOrder(order, refundReason, pointRefund.amountCents, pointRefund.refundablePoints);
  const user = await User.findById(order.userId).lean();
  res.json({
    refund: {
      id: String(refund._id),
      orderId: String(refund.orderId),
      status: refund.status,
      amountCents: refund.amountCents,
      refundablePoints: pointRefund.refundablePoints,
      usedPoints: pointRefund.usedPoints,
      refundedAt: refund.refundedAt ? refund.refundedAt.toISOString() : null,
    },
    membership: serializeBillingUser(user),
  });
});

export default router;
