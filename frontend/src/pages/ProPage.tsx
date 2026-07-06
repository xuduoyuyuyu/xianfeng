import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import GlobalPublicNav from "../components/GlobalPublicNav";
import { BillingMembership, BillingOrder, BillingPlan, PointUsagePolicyItem, billingApi, userApi } from "../services/api";
import { useXiaowanziEmbeddedLayer } from "../utils/xiaowanziLayer";

type PlanId = "plus" | "pro";
type PlanCatalogId = "free" | PlanId;

const HIDDEN_USAGE_POLICY_KEYS = new Set(["ai_chat"]);
const FALLBACK_USAGE_POLICY: PointUsagePolicyItem[] = [
  { featureKey: "xiaowanzi", name: "小玩子对话", cost: 2, description: "每发送 1 次小玩子 AI 对话扣 2 点。" },
  { featureKey: "guest_agent", name: "嘉宾 AI 分身", cost: 3, description: "每向嘉宾 AI 分身提问 1 次扣 3 点。" },
  { featureKey: "topic_submit", name: "请教一下", cost: 5, description: "每次生成或提交深度话题扣 5 点。" },
  { featureKey: "education_planning", name: "智能教育规划", cost: 5, description: "每次生成智能教育规划扣 5 点。" },
  { featureKey: "worthbuy_analysis", name: "知物新分析", cost: 5, description: "每次发起新的商品/品牌 AI 分析扣 5 点。" },
];

function normalizeUsagePolicy(items?: PointUsagePolicyItem[]) {
  const byKey = new Map<string, PointUsagePolicyItem>();
  FALLBACK_USAGE_POLICY.forEach((item) => byKey.set(item.featureKey, item));
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = item?.featureKey || item?.name || "";
    if (key) byKey.set(key, item);
  });
  return Array.from(byKey.values()).filter((item) => !HIDDEN_USAGE_POLICY_KEYS.has(item.featureKey));
}

function formatDate(value?: string | null) {
  if (!value) return "未开通";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatYuan(value?: string, fallback = "") {
  if (!value) return fallback;
  return value.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatPoints(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function planLabel(planId: PlanCatalogId) {
  if (planId === "free") return "Free";
  if (planId === "plus") return "Plus";
  return "Pro";
}

function normalizePlanId(planId?: string | null): PlanCatalogId {
  if (planId === "plus" || planId === "monthly") return "plus";
  if (planId === "pro" || planId === "yearly") return "pro";
  return "free";
}

const ProPage: React.FC = () => {
  const superModePage = useXiaowanziEmbeddedLayer();
  const [plans, setPlans] = useState<Record<PlanCatalogId, BillingPlan> | null>(null);
  const [usagePolicy, setUsagePolicy] = useState<PointUsagePolicyItem[]>([]);
  const [membership, setMembership] = useState<BillingMembership | null>(null);
  const [latestOrder, setLatestOrder] = useState<BillingOrder | null>(null);
  const [selected, setSelected] = useState<PlanId>("pro");
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [message, setMessage] = useState("");
  const [wechatQr, setWechatQr] = useState("");

  const orderIdFromUrl = useMemo(() => new URLSearchParams(window.location.search).get("orderId") || "", []);
  const isSuccessRoute = window.location.pathname === "/pro/success";

  const load = async () => {
    setLoading(true);
    try {
      const [planRes, meRes] = await Promise.all([
        billingApi.getPlans(),
        billingApi.getMe().catch(() => null),
      ]);
      setPlans(planRes.data.plans);
      setUsagePolicy(normalizeUsagePolicy(planRes.data.usagePolicy));
      if (meRes?.data) {
        setMembership(meRes.data.membership);
        setLatestOrder(meRes.data.latestOrder);
      } else {
        const profileRes = await userApi.getMe().catch(() => null);
        const profile = profileRes?.data;
        if (profile && typeof profile.proPointBalance === "number") {
          setMembership({
            proPointBalance: profile.proPointBalance,
            proStatus: profile.proStatus || "none",
            proPlan: profile.proPlan || "",
            membershipTier: profile.membershipTier || normalizePlanId(profile.proPlan),
            membershipLabel: profile.membershipLabel || planLabel(normalizePlanId(profile.proPlan)),
            proExpiresAt: profile.proExpiresAt || null,
            proPurchasedAt: profile.proPurchasedAt || null,
            proRefundEligibleUntil: profile.proRefundEligibleUntil || null,
            proLatestOrderId: profile.proLatestOrderId || "",
            isProActive: profile.proStatus === "active",
            canRefundLatestOrder: false,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const refreshBilling = () => {
      void load();
    };
    document.addEventListener("xf-billing-balance-changed", refreshBilling);
    window.addEventListener("focus", refreshBilling);
    return () => {
      document.removeEventListener("xf-billing-balance-changed", refreshBilling);
      window.removeEventListener("focus", refreshBilling);
    };
  }, []);

  const pollOrderPaid = (orderId: string) => {
    let stopped = false;
    let count = 0;
    const poll = async () => {
      count += 1;
      try {
        const res = await billingApi.getOrder(orderId);
        setLatestOrder(res.data.order);
        if (res.data.order.status === "paid") {
          setMessage("订阅已生效，积分已更新");
          await load();
          stopped = true;
          return;
        }
      } catch {}
      if (!stopped && count < 20) window.setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      stopped = true;
    };
  };

  useEffect(() => {
    if (!orderIdFromUrl) return;
    return pollOrderPaid(orderIdFromUrl);
  }, [orderIdFromUrl]);

  const createOrder = async () => {
    setOrdering(true);
    setMessage("");
    setWechatQr("");
    try {
      const res = await billingApi.createOrder(selected, "wechat");
      setLatestOrder(res.data.order);
      const checkout = res.data.checkout;
      if (checkout.mode === "mock" && checkout.mockPayUrl) {
        setMessage(checkout.message || "当前环境已启用模拟支付，正在开通订阅计划。");
        const paidRes = await billingApi.completeMockPayment(res.data.order.id);
        setLatestOrder(paidRes.data.order);
        setMembership(paidRes.data.membership);
        window.location.href = `/pro/success?orderId=${encodeURIComponent(res.data.order.id)}`;
        return;
      }
      if (checkout.mode === "wechat_native" && checkout.codeUrl) {
        setWechatQr(await QRCode.toDataURL(checkout.codeUrl, { margin: 1, width: 220 }));
        setMessage("请使用微信扫码支付，支付成功后将自动刷新订阅状态。");
        pollOrderPaid(res.data.order.id);
        return;
      }
      const paymentUrl = checkout.paymentUrl;
      if (paymentUrl) {
        window.location.href = paymentUrl;
        return;
      }
      setMessage("微信支付二维码生成失败，请稍后重试。");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "下单失败");
    } finally {
      setOrdering(false);
    }
  };

  const requestRefund = async () => {
    if (!latestOrder?.id) return;
    setRefunding(true);
    setMessage("");
    try {
      const res = await billingApi.requestRefund(latestOrder.id);
      setMembership(res.data.membership);
      setMessage("退款成功，订阅状态已回到可用积分方案。");
      await load();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "退款失败");
    } finally {
      setRefunding(false);
    }
  };

  const activePlan = plans?.[selected];
  const freePlan = plans?.free;
  const catalogPlanIds: PlanCatalogId[] = ["free", "plus", "pro"];
  const mainTopPadding = superModePage ? "pt-4 sm:pt-5" : "pt-[84px]";
  const primaryPanelPadding = superModePage ? "p-4 shadow-sm lg:p-5" : "p-5 shadow-sm lg:p-6";
  const blockTopClass = superModePage ? "mt-4" : "mt-5";
  const compactPanelPadding = superModePage ? "p-3" : "p-4";
  const planCardSizing = superModePage ? "min-h-[108px] p-3" : "min-h-[128px] p-4";
  const asideTopClass = superModePage ? "lg:top-5" : "lg:top-[84px]";

  const pointsText = useMemo(() => {
    const value = membership?.proPointBalance;
    return typeof value === "number" && Number.isFinite(value) ? `${formatPoints(value)} 点` : "-";
  }, [membership?.proPointBalance]);

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <style>{`
        html.xf-mp-webview .pro-page-main {
          padding-top: var(--xf-mp-nav-height, 88px) !important;
          padding-bottom: 0 !important;
        }
      `}</style>
      {!superModePage ? <GlobalPublicNav compactMobile /> : null}
      <main className={`pro-page-main mx-auto max-w-[1240px] px-4 pb-14 ${mainTopPadding} sm:px-6 lg:px-8`}>
        <div className={`grid items-start ${superModePage ? "gap-4" : "gap-5"} lg:grid-cols-[minmax(0,1fr)_320px]`}>
          <section className={`rounded-2xl border border-slate-200 bg-white ${primaryPanelPadding}`}>
            <div className="inline-flex rounded-full bg-[#6c27d6] px-3 py-1 text-[11px] font-black uppercase text-white">订阅计划</div>
            <h1 className={`${superModePage ? "mt-3 text-xl sm:text-2xl" : "mt-4 text-2xl sm:text-3xl"} font-black`}>订阅计划</h1>
            <p className={`${superModePage ? "mt-1 leading-6" : "mt-2 leading-7"} max-w-2xl text-sm font-bold text-slate-600`}>
              基础浏览、详情页、历史内容和公开资料继续免费。订阅后将开启小玩子、智能教育规划、嘉宾 AI 分身与知物新分析，并按套餐兑换对应点数。
            </p>

            <div className={`${blockTopClass} rounded-2xl border border-slate-100 bg-slate-50 ${compactPanelPadding}`}>
              <div className="text-xs font-black text-slate-500">当前可用点数</div>
              <div className={`mt-1 ${superModePage ? "text-2xl" : "text-3xl"} font-black text-slate-950`}>{pointsText}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">
                {membership?.isProActive
                  ? `当前为${membership.membershipLabel || planLabel(normalizePlanId(membership?.proPlan))}，可用点数可继续补充。`
                  : "免费账户每天登录可获取10点，每月上限30点"}
              </div>
            </div>

            <div className={`${blockTopClass} grid ${superModePage ? "gap-2" : "gap-3"} md:grid-cols-3`}>
              {catalogPlanIds.map((planId) => {
                const plan = plans?.[planId] as BillingPlan;
                const paidPlan = planId === "plus" || planId === "pro";
                const on = paidPlan && selected === planId;
                const label = plan?.name || planLabel(planId);
                const fallbackAmount = planId === "free" ? "0" : planId === "plus" ? "19.9" : "99";
                return (
                  <button
                    key={planId}
                    type="button"
                    onClick={() => {
                      if (paidPlan) setSelected(planId);
                    }}
                    disabled={!paidPlan}
                    className={`${planCardSizing} rounded-2xl border text-left transition ${
                      on ? "border-[#6c27d6] bg-[#6c27d6] text-white" : "border-slate-200 bg-white text-slate-950"
                    } ${paidPlan ? "hover:border-[#b79bff]" : "cursor-default"}
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-black">{label}</div>
                      {planId === "pro" ? <span className="rounded-full bg-[#f8d375] px-2 py-1 text-[11px] font-black text-slate-950">推荐</span> : null}
                    </div>
                    <div className={`${superModePage ? "mt-3 text-2xl" : "mt-4 text-3xl"} font-black`}>¥{formatYuan(plan?.amountYuan, fallbackAmount)}</div>
                    <div className={`mt-2 text-xs font-bold ${on ? "text-slate-200" : "text-slate-500"}`}>{plan?.description}</div>
                    <div className={`mt-2 text-xs ${on ? "text-white/80" : "text-slate-500"}`}>可用点数：{formatPoints(plan?.pointsPerCycle)}</div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={ordering || loading || !activePlan}
              onClick={createOrder}
              className={`${blockTopClass} ${superModePage ? "h-11" : "h-12"} w-full rounded-full bg-[#6c27d6] text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300`}
            >
              {ordering ? "正在创建微信订单..." : `立即订阅 ¥${formatYuan(activePlan?.amountYuan)}`}
            </button>
            {wechatQr ? (
              <div className={`${blockTopClass} rounded-2xl border border-[#d8ccff] bg-[#f7f4ff] ${compactPanelPadding} text-center`}>
                <img src={wechatQr} alt="微信支付二维码" className="mx-auto h-[220px] w-[220px] rounded-xl bg-white p-2" />
                <div className="mt-3 text-sm font-black text-slate-800">微信扫码支付</div>
                <div className="mt-1 text-xs font-bold text-slate-500">支付成功后本页会自动更新订阅状态</div>
              </div>
            ) : null}
            <div className={`${blockTopClass} grid ${superModePage ? "gap-2 text-[13px] leading-5" : "gap-3 text-sm leading-6"} font-bold text-slate-700 md:grid-cols-3`}>
              <div className={`rounded-2xl bg-slate-50 ${compactPanelPadding}`}>小玩子对话</div>
              <div className={`rounded-2xl bg-slate-50 ${compactPanelPadding}`}>智能教育规划</div>
              <div className={`rounded-2xl bg-slate-50 ${compactPanelPadding}`}>嘉宾 AI 分身提问</div>
              <div className={`rounded-2xl bg-slate-50 ${compactPanelPadding}`}>知物新分析</div>
            </div>
            <div className={`${blockTopClass} rounded-2xl border border-slate-200 bg-white ${compactPanelPadding}`}>
              <h2 className="text-base font-black text-slate-950">点数消耗策略</h2>
              <div className="mt-3 grid gap-2 xl:grid-cols-2">
                {usagePolicy.length ? usagePolicy.map((item) => (
                  <div key={item.featureKey} className={`grid ${superModePage ? "min-h-[64px] px-3 py-2 text-[13px]" : "min-h-[76px] px-4 py-3 text-sm"} grid-cols-[1fr_auto] gap-3 rounded-2xl bg-slate-50 font-bold text-slate-700`}>
                    <div>
                      <div className="font-black text-slate-950">{item.name}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                    </div>
                    <div className="self-center rounded-full bg-white px-3 py-1 text-xs font-black text-[#6c27d6]">{formatPoints(item.cost)} 点/次</div>
                  </div>
                )) : (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">读取中...</div>
                )}
              </div>
            </div>
          </section>

          <aside className={`rounded-2xl border border-slate-200 bg-white ${superModePage ? "p-4" : "p-5"} shadow-sm lg:sticky ${asideTopClass}`}>
            <h2 className="text-lg font-black">订阅状态</h2>
            {loading ? (
              <p className="mt-4 text-sm font-bold text-slate-500">读取中...</p>
            ) : (
              <div className="mt-4 space-y-3 text-sm font-bold text-slate-700">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">当前状态</div>
                  <div className="mt-1 text-xl font-black text-slate-950">{membership?.isProActive ? `${membership.membershipLabel || planLabel(normalizePlanId(membership?.proPlan))} 会员` : membership?.proStatus === "refunded" ? "已退款，订阅已关闭" : "未开通订阅"}</div>
                </div>
                <div>会员：{membership?.isProActive ? membership.membershipLabel || planLabel(normalizePlanId(membership.proPlan)) : "Free"}</div>
                <div>到期：{formatDate(membership?.proExpiresAt)}</div>
                <div>退款方式：{membership?.isProActive ? "按未使用点数折算" : "未开通"}</div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                  退款按未使用点数折算，已使用点数对应费用不退；退款成功后高级 AI 调用立即不可用。
                </div>
                {membership?.canRefundLatestOrder && latestOrder?.status === "paid" ? (
                  <button
                    type="button"
                    disabled={refunding}
                    onClick={requestRefund}
                    className="h-11 w-full rounded-full border border-red-200 bg-white text-sm font-black text-red-600 disabled:opacity-50"
                  >
                    {refunding ? "退款处理中..." : "申请退款"}
                  </button>
                ) : null}
              </div>
            )}
            {isSuccessRoute && latestOrder?.status !== "paid" ? <p className="mt-4 text-sm font-bold text-slate-500">正在等待微信支付异步通知...</p> : null}
            {message ? <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{message}</p> : null}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default ProPage;
