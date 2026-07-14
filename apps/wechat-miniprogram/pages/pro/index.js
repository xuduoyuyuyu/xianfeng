const { request } = require("../../utils/request");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { ensureBackStackForBackButtonPage, goProgramsHome: navigateProgramsHome, smartBackHome } = require("../../utils/nativePageNav");
const { SETTINGS_SECTIONS, createNativeSettingsMethods } = require("../../utils/nativeSettings");

const SHARE_OPTIONS = {
  title: "家长先疯 Pro",
  path: "/pages/pro/index"
};

const LOGO_HEIGHT_RPX = 56;
const PAYMENT_CONFIRMATION_POLL_DELAYS_MS = [0, 800, 1500, 2500, 4000];
const HIDDEN_USAGE_POLICY_KEYS = { ai_chat: true };

const FALLBACK_PLANS = {
  free: {
    id: "free",
    name: "Free",
    amountYuan: "0.00",
    description: "免费账户每天登录可获取10点，每月上限30点",
    pointsPerCycle: 10
  },
  plus: {
    id: "plus",
    name: "Plus",
    amountYuan: "19.90",
    description: "Plus 兑换 200 点，用完可继续补充。",
    pointsPerCycle: 200
  },
  pro: {
    id: "pro",
    name: "Pro",
    amountYuan: "99.00",
    description: "Pro 兑换 1,200 点，适合长期使用。",
    pointsPerCycle: 1200
  }
};

const FALLBACK_USAGE_POLICY = [
  { featureKey: "xiaowanzi", name: "小玩子对话", cost: 1, description: "每发送 1 次小玩子 AI 对话扣 1 点。" },
  { featureKey: "xiaowanzi_file", name: "小玩子图片文件处理", cost: 1, description: "每处理 1 张小玩子图片或文件扣 1 点。" },
  { featureKey: "guest_agent", name: "嘉宾 AI 分身", cost: 3, description: "每向嘉宾 AI 分身提问 1 次扣 3 点。" },
  { featureKey: "topic_submit", name: "请教一下", cost: 5, description: "每次生成或提交深度话题扣 5 点。" },
  { featureKey: "education_planning", name: "智能教育规划", cost: 5, description: "每次生成智能教育规划扣 5 点。" },
  { featureKey: "worthbuy_analysis", name: "知物新分析", cost: 5, description: "每次发起新的商品/品牌 AI 分析扣 5 点。" }
];

const USAGE_POLICY_OVERRIDES = {
  xiaowanzi: { featureKey: "xiaowanzi", name: "小玩子对话", cost: 1, description: "每发送 1 次小玩子 AI 对话扣 1 点。" },
  xiaowanzi_file: { featureKey: "xiaowanzi_file", name: "小玩子图片文件处理", cost: 1, description: "每处理 1 张小玩子图片或文件扣 1 点。" }
};

function formatYuan(value, fallback) {
  const source = String(value || fallback || "").trim();
  if (!source) return "";
  return source.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatPoints(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatDate(value) {
  if (!value) return "未开通";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "未开通";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function planLabel(planId) {
  const normalized = normalizePlanId(planId);
  if (normalized === "plus") return "Plus";
  if (normalized === "pro") return "Pro";
  return "Free";
}

function paymentStatusLabel(order) {
  if (!order) return "未知状态";
  if (order.statusLabel) return order.statusLabel;
  if (order.status === "paid") return "已支付";
  if (order.status === "refunded") return "已退款";
  if (order.status === "pending") return "待支付";
  return "未知状态";
}

function normalizePaymentOrder(order) {
  const item = order || {};
  const amountYuan = formatYuan(item.amountYuan, item.amountCents ? (Number(item.amountCents) / 100).toFixed(2) : "");
  const refundableAmountYuan = formatYuan(item.refundableAmountYuan, item.refundableAmountCents ? (Number(item.refundableAmountCents) / 100).toFixed(2) : "");
  const paidAtText = item.paidAtText || formatDate(item.paidAt || item.createdAt).replace(/\//g, "-");
  const refundStatusLabel = item.status === "refunded" ? "已退款" : "虚拟支付不支持退款";
  return {
    ...item,
    planLabel: planLabel(item.plan),
    amountYuan,
    paidAtText,
    statusLabel: paymentStatusLabel(item),
    refundStatusLabel,
    refundablePointsText: formatPoints(item.refundablePoints || 0),
    refundableAmountYuan
  };
}

function normalizePaymentOrders(orders) {
  return Array.isArray(orders) ? orders.map(normalizePaymentOrder).filter((item) => item.id) : [];
}

function normalizePlanId(planId) {
  if (planId === "plus" || planId === "monthly") return "plus";
  if (planId === "pro" || planId === "yearly") return "pro";
  return "free";
}

function normalizePlan(plan, id) {
  const fallback = FALLBACK_PLANS[id] || FALLBACK_PLANS.free;
  const item = plan || {};
  return {
    id,
    name: item.name || fallback.name,
    amountYuan: formatYuan(item.amountYuan, fallback.amountYuan),
    description: item.description || fallback.description,
    pointsPerCycle: Number.isFinite(Number(item.pointsPerCycle)) ? Number(item.pointsPerCycle) : fallback.pointsPerCycle,
    pointsText: formatPoints(Number.isFinite(Number(item.pointsPerCycle)) ? Number(item.pointsPerCycle) : fallback.pointsPerCycle)
  };
}

function buildPlanCards(plans, selectedPlan) {
  const normalizedSelectedPlan = normalizePlanId(selectedPlan);
  return ["free", "plus", "pro"].map((id) => {
    const plan = normalizePlan(plans && plans[id], id);
    const paid = id === "plus" || id === "pro";
    return {
      ...plan,
      paid,
      selected: paid && normalizedSelectedPlan === id,
      recommended: id === "pro"
    };
  });
}

function selectedPaidPlanId(state) {
  const selectedCard = (state.planCards || []).find((item) => item && item.paid && item.selected);
  const cardPlan = normalizePlanId(selectedCard && selectedCard.id);
  if (cardPlan === "plus" || cardPlan === "pro") return cardPlan;
  const dataPlan = normalizePlanId(state.selectedPlan);
  if (dataPlan === "plus" || dataPlan === "pro") return dataPlan;
  return "";
}

function normalizeUsagePolicy(items) {
  const remoteItems = Array.isArray(items) ? items : [];
  const byKey = {};
  FALLBACK_USAGE_POLICY.forEach((item) => {
    byKey[String(item.featureKey || item.name || "")] = item;
  });
  remoteItems.forEach((item) => {
    const key = String(item && (item.featureKey || item.name) || "");
    if (key) byKey[key] = item;
  });
  Object.keys(USAGE_POLICY_OVERRIDES).forEach((key) => {
    byKey[key] = USAGE_POLICY_OVERRIDES[key];
  });
  const orderedKeys = FALLBACK_USAGE_POLICY.map((item) => String(item.featureKey || item.name || ""));
  remoteItems.forEach((item) => {
    const key = String(item && (item.featureKey || item.name) || "");
    if (key && !orderedKeys.includes(key)) orderedKeys.push(key);
  });
  return orderedKeys.map((key) => byKey[key]).filter((item) => !HIDDEN_USAGE_POLICY_KEYS[String(item && item.featureKey || "")]).map((item) => ({
    featureKey: String(item.featureKey || item.name || ""),
    name: String(item.name || ""),
    costText: `${formatPoints(item.cost)} 点/次`,
    description: String(item.description || "")
  })).filter((item) => item.name);
}

function statusLabel(membership) {
  if (membership && membership.isProActive) return `${membershipBadgeLabel(membership)} 会员`;
  if (membership && membership.proStatus === "refunded") return "已退款，订阅已关闭";
  return "未开通订阅";
}

function membershipBadgeLabel(membership) {
  if (!membership || !membership.isProActive) return "";
  const normalized = normalizePlanId(membership.membershipTier || membership.proPlan);
  if (normalized === "plus") return "Plus";
  if (normalized === "pro") return "Pro";
  return "";
}

function buildStatusRows(membership) {
  const activePlan = membership && membership.isProActive ? planLabel(membership.proPlan) : "Free";
  return [
    { label: "套餐", value: activePlan },
    { label: "到期", value: formatDate(membership && membership.proExpiresAt) },
    { label: "购买说明", value: "虚拟支付不支持退款" }
  ];
}

function requestWechatLoginCode() {
  if (typeof wx.login !== "function") {
    return Promise.reject(new Error("当前环境不支持微信登录"));
  }
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        const code = String(result && result.code || "").trim();
        if (!code) {
          reject(new Error("微信登录 code 不能为空"));
          return;
        }
        resolve(code);
      },
      fail(error) {
        reject(error);
      }
    });
  });
}

function requestWechatVirtualPayment(paymentParams) {
  const params = paymentParams || {};
  if (!params.mode || !params.signData || !params.paySig || !params.signature) {
    return Promise.reject(new Error("微信虚拟支付参数缺失，请稍后重试"));
  }
  if (typeof wx.requestVirtualPayment !== "function") {
    return Promise.reject(new Error("当前微信版本不支持小程序虚拟支付，请升级微信后重试"));
  }
  return new Promise((resolve, reject) => {
    wx.requestVirtualPayment({
      mode: params.mode,
      signData: params.signData,
      paySig: params.paySig,
      signature: params.signature,
      success: resolve,
      fail(error) {
        reject(error);
      }
    });
  });
}

function paymentErrorMessage(error) {
  const raw = String(error && (error.message || error.errMsg) || "");
  if (/cancel/i.test(raw)) return "已取消微信支付";
  return requestErrorMessage(error, "微信支付未完成，请稍后重试");
}

function requestErrorMessage(error, fallback) {
  const raw = String(error && (error.message || error.errMsg) || "").trim();
  const url = String(error && error.url || "").trim();
  const message = raw || fallback || "请求失败";
  if (url) return `${message}（${url}）`;
  return message;
}

function isAuthExpiredError(error) {
  return Number(error && error.statusCode) === 401;
}

Page({
  data: {
    settingsSections: SETTINGS_SECTIONS,
    topbarHeight: 88,
    chromeHeight: 88,
    profilePanelTop: 30,
    profileHeaderHeight: 32,
    logoTop: 10,
    logoHeight: 28,
    welfareRight: 101,
    backTop: 8,
    backSize: 32,
    settingsPanelOpen: false,
    settingsPanelView: "menu",
    settingsProfilePanelSupported: true,
    launchedFromSettings: false,
    accountTitle: "登录/注册",
    accountSubtitle: "登录后同步档案和个性化推荐",
    accountPage: "",
    loading: true,
    ordering: false,
    refunding: false,
    selectedPlan: "pro",
    plans: FALLBACK_PLANS,
    planCards: buildPlanCards(FALLBACK_PLANS, "pro"),
    usagePolicy: normalizeUsagePolicy(FALLBACK_USAGE_POLICY),
    membership: null,
    latestOrder: null,
    latestRefundableOrder: null,
    paymentOrders: [],
    pointsText: "-",
    memberBadgeLabel: "",
    statusLabel: "未开通订阅",
    statusRows: buildStatusRows(null),
    message: "",
    loginRequired: false
  },

  onLoad(options = {}) {
    if (ensureBackStackForBackButtonPage(options)) return;
    enableShareMenu();
    this._billingLoaded = false;
    this.setData({ launchedFromSettings: String(options.from || "") === "settings" });
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    return this.loadBilling().then((result) => {
      this._billingLoaded = true;
      return result;
    });
  },

  onShow() {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    if (this._billingLoaded) {
      return this.refreshBillingMembership().catch(() => null);
    }
    return undefined;
  },

  syncTopbarMetrics() {
    try {
      const metrics = getNativeTopbarMetrics();
      const topbarHeight = Math.max(72, Math.round(metrics.topbarHeight || 88));
      const windowWidth = Math.max(320, Number(metrics.windowWidth || 375));
      const logoHeight = Math.round((LOGO_HEIGHT_RPX * windowWidth) / 750);
      const capsuleHeight = Math.max(28, Math.round(metrics.capsuleHeight || 32));
      const searchButtonTop = Math.max(8, Math.round(metrics.searchButtonTop || 8));
      const backSize = Math.max(32, Math.round(capsuleHeight));
      const welfareRight = Math.max(72, Math.round(metrics.capsuleRight || 96) + 5);
      this.setData({
        topbarHeight,
        chromeHeight: topbarHeight,
        profilePanelTop: searchButtonTop,
        profileHeaderHeight: capsuleHeight,
        logoHeight,
        logoTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - logoHeight / 2)),
        backTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - backSize / 2)),
        backSize,
        welfareRight
      });
    } catch (_error) {}
  },

  goProgramsHome() {
    navigateProgramsHome();
  },

  goBack() {
    smartBackHome();
  },

  ...createNativeSettingsMethods(),

  showLoginGate() {
    this.setData({ loginRequired: true, message: "" });
  },

  handleLoginSuccess() {
    this.setData({ loginRequired: false });
    this.syncAccountEntry();
    this.loadBilling();
  },

  loadBilling() {
    this.setData({ loading: true, message: "" });
    return request({ url: "/api/billing/plans" })
      .then((plansResponse) => {
        const plans = plansResponse && plansResponse.plans ? plansResponse.plans : FALLBACK_PLANS;
        const usagePolicy = normalizeUsagePolicy(plansResponse && plansResponse.usagePolicy);
        this.setData({
          plans,
          planCards: buildPlanCards(plans, this.data.selectedPlan),
          usagePolicy
        });
        return request({ url: "/api/billing/me" }).catch(() => null);
      })
      .then((meResponse) => {
        this.applyBillingResponse(meResponse);
        this.setData({ loading: false });
        return meResponse;
      })
      .catch((error) => {
        this.setData({
          planCards: buildPlanCards(FALLBACK_PLANS, this.data.selectedPlan),
          usagePolicy: normalizeUsagePolicy(FALLBACK_USAGE_POLICY),
          loading: false,
          message: error && error.message ? error.message : "订阅信息加载失败，请稍后重试"
        });
      });
  },

  applyBillingResponse(meResponse) {
    const membership = meResponse && meResponse.membership ? meResponse.membership : null;
    this.setData({
      membership,
      latestOrder: meResponse && meResponse.latestOrder ? meResponse.latestOrder : null,
      latestRefundableOrder: meResponse && meResponse.latestRefundableOrder ? meResponse.latestRefundableOrder : null,
      paymentOrders: normalizePaymentOrders(meResponse && meResponse.paymentOrders),
      pointsText: membership && typeof membership.proPointBalance === "number" ? `${formatPoints(membership.proPointBalance)} 点` : "-",
      memberBadgeLabel: membershipBadgeLabel(membership),
      statusLabel: statusLabel(membership),
      statusRows: buildStatusRows(membership)
    });
  },

  refreshBillingMembership() {
    return request({ url: "/api/billing/me" }).then((meResponse) => {
      this.applyBillingResponse(meResponse);
      return meResponse;
    });
  },

  waitForWechatPaymentConfirmation(attempt = 0) {
    return this.refreshBillingMembership()
      .then((meResponse) => {
        const membership = meResponse && meResponse.membership ? meResponse.membership : null;
        const latestOrder = meResponse && meResponse.latestOrder ? meResponse.latestOrder : null;
        if (membership && membership.isProActive && latestOrder && latestOrder.status === "paid") {
          return meResponse;
        }
        if (attempt >= PAYMENT_CONFIRMATION_POLL_DELAYS_MS.length - 1) {
          return meResponse;
        }
        this.setData({ message: "支付已完成，正在确认订阅权益..." });
        return new Promise((resolve) => {
          setTimeout(resolve, PAYMENT_CONFIRMATION_POLL_DELAYS_MS[attempt + 1]);
        }).then(() => this.waitForWechatPaymentConfirmation(attempt + 1));
      });
  },

  syncWechatVirtualOrder(orderId) {
    if (!orderId) return Promise.resolve(null);
    return request({
      method: "POST",
      url: `/api/billing/virtual-orders/${orderId}/sync`
    }).then((response) => {
      const membership = response && response.membership ? response.membership : null;
      const order = response && response.order ? response.order : null;
      this.setData({
        membership: membership || this.data.membership,
        latestOrder: order || this.data.latestOrder,
        pointsText: membership && typeof membership.proPointBalance === "number" ? `${formatPoints(membership.proPointBalance)} 点` : this.data.pointsText,
        memberBadgeLabel: membershipBadgeLabel(membership || this.data.membership),
        statusLabel: statusLabel(membership || this.data.membership),
        statusRows: buildStatusRows(membership || this.data.membership)
      });
      return response;
    });
  },

  selectPlan(event) {
    const plan = normalizePlanId(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.plan);
    if (plan !== "plus" && plan !== "pro") return;
    this.setData({
      selectedPlan: plan,
      planCards: buildPlanCards(this.data.plans, plan)
    });
  },

  createOrder() {
    if (this.data.ordering) return Promise.resolve();
    const plan = selectedPaidPlanId(this.data);
    if (!plan) {
      this.setData({ message: "请选择 Plus 或 Pro 套餐" });
      return Promise.resolve();
    }
    this.setData({ ordering: true, message: "" });
    return requestWechatLoginCode()
      .then((loginCode) => request({
        method: "POST",
        url: "/api/billing/virtual-orders",
        data: { productId: plan, quantity: 1, loginCode }
      }))
      .then((response) => {
        const order = response && response.order ? response.order : null;
        const checkout = response && response.checkout ? response.checkout : {};
        if (checkout.mode === "mock" && checkout.mockPayUrl) {
          return request({ method: "POST", url: checkout.mockPayUrl }).then((mockResponse) => {
            const membership = mockResponse && mockResponse.membership ? mockResponse.membership : null;
            this.setData({
              membership,
              latestOrder: mockResponse && mockResponse.order ? mockResponse.order : order,
              pointsText: membership && typeof membership.proPointBalance === "number" ? `${formatPoints(membership.proPointBalance)} 点` : this.data.pointsText,
              memberBadgeLabel: membershipBadgeLabel(membership),
              statusLabel: statusLabel(membership),
              statusRows: buildStatusRows(membership),
              ordering: false,
              message: "支付已完成，订阅权益已生效。"
            });
            return mockResponse;
          });
        }
        if (checkout.paymentChannel === "wechat_virtual") {
          return requestWechatVirtualPayment(checkout.paymentParams)
            .then(() => this.syncWechatVirtualOrder(order && order.id).catch(() => null))
            .then(() => this.waitForWechatPaymentConfirmation())
            .then((meResponse) => {
              const membership = meResponse && meResponse.membership ? meResponse.membership : null;
              this.setData({
                ordering: false,
                message: membership && membership.isProActive
                  ? "支付已完成，订阅权益已生效。"
                  : "支付已完成，正在等待微信确认订阅权益。"
              });
              return response;
            });
        }
        this.setData({
          latestOrder: order,
          ordering: false,
          message: checkout.message || "微信订单已创建，但当前小程序无法直接拉起支付。"
        });
        return response;
      })
      .catch((error) => {
        if (isAuthExpiredError(error)) {
          this.setData({
            ordering: false,
            message: ""
          });
          this.syncAccountEntry();
          return;
        }
        this.setData({
          ordering: false,
          message: paymentErrorMessage(error)
        });
      });
  },

  onShareAppMessage() {
    return createPageShare(SHARE_OPTIONS).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare(SHARE_OPTIONS).onShareTimeline();
  }
});
