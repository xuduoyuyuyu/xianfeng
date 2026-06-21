import { Router } from "express";
import PaymentOrderModel from "../models/PaymentOrder";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import {
  BILLING_PLANS,
  FREE_BILLING_PLAN,
  POINT_USAGE_POLICY,
  canRefundOrder,
  createPaymentOrder,
  grantFreeLoginPointsForUser,
  getLatestRefundableOrder,
  isMockPaymentEnabled,
  markOrderPaid,
  normalizeBillingPlan,
  serializeBillingUser,
  serializePlan,
} from "../services/billing";
import { createAlipayCheckout, createWechatCheckout, handleAlipayNotify, handleWechatNotify, refundAlipayOrder, refundWechatOrder } from "../services/paymentProviders";
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

router.get("/plans", (_req, res) => {
  res.json({
    plans: {
      free: serializePlan(FREE_BILLING_PLAN),
      monthly: serializePlan(BILLING_PLANS.monthly),
      yearly: serializePlan(BILLING_PLANS.yearly),
    },
    refundPolicy: {
      fullRefundDays: 3,
      description: "支付成功后3天内可在订阅页自助申请全额退款。",
    },
    providers: {
      alipay: { enabled: false, note: "支付宝暂不启用" },
      wechat: { enabled: true },
    },
    usagePolicy: Object.values(POINT_USAGE_POLICY),
  });
});

router.get("/me", authenticate, async (req: AuthenticatedRequest, res) => {
  const user = await User.findById(currentUserId(req));
  if (!user) {
    res.status(404).json({ message: "用户不存在" });
    return;
  }
  await grantFreeLoginPointsForUser(user);
  const latestOrder = await PaymentOrderModel.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean();
  res.json({
    membership: serializeBillingUser(user),
    latestOrder: latestOrder ? serializeOrder(latestOrder) : null,
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
    const checkout = provider === "wechat" ? await createWechatCheckout(order) : await createAlipayCheckout(order);
    res.status(201).json({ order: serializeOrder(order), checkout });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "创建订单失败" });
  }
});

router.get("/orders/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const order = await findOwnedOrder(req, String(req.params.id));
  if (!order) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
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
  const refund = order.provider === "wechat"
    ? await refundWechatOrder(order, String(req.body?.reason || "3天不满意全额退款"))
    : await refundAlipayOrder(order, String(req.body?.reason || "3天不满意全额退款"));
  const user = await User.findById(currentUserId(req)).lean();
  res.json({
    refund: {
      id: String(refund._id),
      orderId: String(refund.orderId),
      status: refund.status,
      amountCents: refund.amountCents,
      refundedAt: refund.refundedAt ? refund.refundedAt.toISOString() : null,
    },
    membership: serializeBillingUser(user),
  });
});

export default router;
