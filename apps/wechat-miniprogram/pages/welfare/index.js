const { request } = require("../../utils/request");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { goProgramsHome: navigateProgramsHome } = require("../../utils/nativePageNav");

const SHARE_OPTIONS = {
  title: "小玩子百宝箱",
  path: "/pages/welfare/index"
};

const LOGO_HEIGHT_RPX = 56;

const STATUS_TEXT = {
  active: "可领取",
  expired: "已过期",
  sold_out: "已抢完",
  upcoming: "未开始"
};

function isNotFoundError(error) {
  const statusCode = Number(error && (error.statusCode || error.status) || 0);
  const message = String(error && error.message || "").trim();
  return statusCode === 404 || /status code 404/i.test(message);
}

function normalizeImage(value) {
  const source = String(value || "").trim();
  return source || "/assets/menu/welfare-gift-icon.png";
}

function dateText(value) {
  if (!value) return "长期有效";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "长期有效";
  return `${date.getMonth() + 1}.${date.getDate()} 截止`;
}

function normalizeCampaign(item) {
  const availability = String(item && item.availability || "active");
  const totalStock = Number(item && item.totalStock || 0);
  const remainingStock = Number(item && item.remainingStock || 0);
  const unavailable = availability === "expired" || availability === "sold_out" || availability === "upcoming";
  const actionText = availability === "expired"
    ? "已过期"
    : availability === "sold_out"
      ? "已抢完"
      : availability === "upcoming"
        ? "未开始"
        : String(item && item.claimButtonText || "立即领取");

  return {
    _id: String(item && (item._id || item.id) || ""),
    title: String(item && item.title || "未命名福利"),
    subtitle: String(item && (item.subtitle || item.description) || `剩余 ${remainingStock} 份 · ${dateText(item && item.endsAt)}`),
    coverImageUrl: normalizeImage(item && item.coverImageUrl),
    availability,
    statusText: STATUS_TEXT[availability] || "福利",
    stockText: unavailable ? dateText(item && item.endsAt) : `剩余 ${remainingStock} / ${totalStock} 份`,
    actionText,
    unavailable
  };
}

function friendlyError(error, fallback) {
  const message = String(error && error.message || "").trim();
  if (/^request\.fail$/i.test(message)) return fallback;
  if (/^Request failed with status code \d+$/i.test(message)) return fallback;
  return message || fallback;
}

Page({
  data: {
    topbarHeight: 88,
    chromeHeight: 88,
    backTop: 8,
    backSize: 32,
    logoTop: 10,
    logoHeight: 28,
    activeCampaigns: [],
    historyCampaigns: [],
    loading: true,
    message: "",
    claimingId: ""
  },

  onLoad() {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.loadCampaigns();
  },

  onShow() {
    enableShareMenu();
    this.syncTopbarMetrics();
  },

  syncTopbarMetrics() {
    try {
      const metrics = getNativeTopbarMetrics();
      const topbarHeight = Math.max(72, Math.round(metrics.topbarHeight || 88));
      const windowWidth = Math.max(320, Number(metrics.windowWidth || 375));
      const logoHeight = Math.round((LOGO_HEIGHT_RPX * windowWidth) / 750);
      const capsuleHeight = Math.max(28, Math.round(metrics.capsuleHeight || 32));
      const searchButtonTop = Math.max(8, Math.round(metrics.searchButtonTop || 8));
      this.setData({
        topbarHeight,
        chromeHeight: topbarHeight,
        backTop: searchButtonTop,
        backSize: capsuleHeight,
        logoHeight,
        logoTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - logoHeight / 2))
      });
    } catch (_error) {}
  },

  loadCampaigns() {
    this.setData({ loading: true, message: "" });
    request({ url: "/api/welfare/campaigns" })
      .then((response) => {
        this.setData({
          activeCampaigns: (response.active || []).map(normalizeCampaign),
          historyCampaigns: (response.history || []).map(normalizeCampaign),
          loading: false
        });
      })
      .catch((error) => {
        if (isNotFoundError(error)) {
          this.setData({ activeCampaigns: [], historyCampaigns: [], loading: false, message: "" });
          return;
        }
        this.setData({ loading: false, message: friendlyError(error, "福利加载失败，请稍后重试") });
      });
  },

  claimWelfare(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ claimingId: id, message: "" });
    request({ url: `/api/welfare/campaigns/${id}/claims`, method: "POST" })
      .then((response) => {
        const campaign = response && response.campaign || {};
        this.setData({ message: campaign.claimInstructions || "领取成功，运营会根据福利说明联系你。" });
        this.loadCampaigns();
      })
      .catch((error) => {
        this.setData({
          message: isNotFoundError(error) ? "这个福利暂时不可领取，稍后再看看" : friendlyError(error, "领取失败，请稍后重试")
        });
      })
      .finally(() => {
        this.setData({ claimingId: "" });
      });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  goProgramsHome: navigateProgramsHome,

  ...createPageShare(SHARE_OPTIONS)
});
