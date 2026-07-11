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
  serializeBillingUser,
  serializePlan,
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
} from "../services/paymentProviders";
import { createWechatVirtualCheckout, exchangeWechatLoginCode, isWechatVirtualPaymentConfigured, parseWechatVirtualNotification } from "../services/wechatVirtualPayment";
import { getVirtualProduct } from "../services/virtualPaymentProducts";
import User from "../models/User";

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

function currentUserId(req: AuthenticatedRequest): string {
  return String(req.user?.id || "");
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
  const [freshUser, latestOrder, latestRefundableOrder] = await Promise.all([
    User.findById(userId),
    PaymentOrderModel.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    getLatestRefundableOrder(userId),
  ]);
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
  });
});

router.post("/orders", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
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
  try {
    const session = await exchangeWechatLoginCode(loginCode);
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
    const message = String(error?.message || "创建虚拟支付订单失败");
    const loginFailure = /微信登录|session_key|code/.test(message);
    res.status(loginFailure ? 400 : 500).json({ message });
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

router.post("/wechat/virtual/notify", async (req: any, res) => {
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
  if (order.paymentChannel === "wechat_virtual") {
    res.status(409).json({ message: "微信虚拟支付退款尚未接入，订单未变更" });
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
  const refund = order.provider === "wechat"
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
