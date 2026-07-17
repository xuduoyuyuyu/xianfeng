const { request } = require("../../utils/request");
const { copyTextSilently } = require("../../utils/clipboard");
const { getToken } = require("../../utils/session");
const { subscribeAuthExpired } = require("../../utils/authExpiry");
const { API_ORIGIN } = require("../../utils/config");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { goProgramsHome: navigateProgramsHome, smartBackHome } = require("../../utils/nativePageNav");

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
  if (source.startsWith("emoji:")) return "";
  if (source === "/assets/welfare-gift-icon.png") return "/assets/menu/welfare-gift-icon.png";
  if (source.startsWith("/uploads/")) return `${API_ORIGIN}${source}`;
  if (/^http:\/\/xianfeng\.xinzhi\.info\//i.test(source)) return source.replace(/^http:/i, "https:");
  return source || "/assets/menu/welfare-gift-icon.png";
}

function normalizeEmoji(value) {
  const source = String(value || "").trim();
  return source.startsWith("emoji:") ? source.slice("emoji:".length).trim() : "";
}

function dateText(value) {
  if (!value) return "长期有效";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "长期有效";
  return `${date.getMonth() + 1}.${date.getDate()} 截止`;
}

function normalizeCampaign(item) {
  const availability = String(item && item.availability || "active");
  const claimedByMe = Boolean(item && item.claimedByMe);
  const totalStock = Number(item && item.totalStock || 0);
  const remainingStock = Number(item && item.remainingStock || 0);
  const lifecycleUnavailable = availability === "expired" || availability === "sold_out" || availability === "upcoming";
  const unavailable = claimedByMe || lifecycleUnavailable;
  const actionText = claimedByMe
    ? "已领取"
    : availability === "expired"
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
    coverEmoji: normalizeEmoji(item && item.coverImageUrl),
    availability,
    claimedByMe,
    statusText: STATUS_TEXT[availability] || "福利",
    stockText: lifecycleUnavailable ? dateText(item && item.endsAt) : `剩余 ${remainingStock} / ${totalStock} 份`,
    actionText,
    unavailable,
    claimDisabled: lifecycleUnavailable,
    claimInstructions: String(item && item.claimInstructions || ""),
    externalUrl: String(item && item.externalUrl || ""),
    activationCode: String(item && item.activationCode || "")
  };
}

function sortClaimableCampaigns(campaigns) {
  return campaigns.slice().sort((left, right) => Number(left.claimedByMe) - Number(right.claimedByMe));
}

function markCampaignClaimed(campaigns, id, campaign) {
  return sortClaimableCampaigns(campaigns.map((item) => {
    if (item._id !== id) return item;
    return normalizeCampaign({
      ...item,
      ...(campaign || {}),
      _id: id,
      claimedByMe: true
    });
  }));
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
    hasSession: Boolean(getToken()),
    claimingId: "",
    claimDialogVisible: false,
    claimDialogTitle: "",
    claimDialogInstructions: "",
    claimDialogExternalUrl: "",
    claimDialogIsMiniProgramLink: false,
    claimDialogActivationCode: ""
  },

  onLoad() {
    enableShareMenu();
    this.syncTopbarMetrics();
    this._unsubscribeAuthExpired = subscribeAuthExpired(() => this.showLoginGate());
    this.loadCampaigns();
  },

  onUnload() {
    if (typeof this._unsubscribeAuthExpired === "function") this._unsubscribeAuthExpired();
    this._unsubscribeAuthExpired = null;
  },

  onShow() {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.setData({ hasSession: Boolean(getToken()) });
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

  showLoginGate() {
    this.setData({ hasSession: false, loading: false, message: "" });
  },

  handleLoginSuccess() {
    const id = String(this._pendingClaimId || "");
    this._pendingClaimId = "";
    this.setData({ hasSession: true, message: "" });
    if (id) {
      this.claimWelfare({ currentTarget: { dataset: { id } } });
      return;
    }
    this.loadCampaigns();
  },

  onClaimButtonTap(event) {
    if (!this.data.hasSession) return;
    this.claimWelfare(event);
  },

  loginAndClaimWelfare(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "");
    if (!id) return;
    if (!String(event && event.detail && event.detail.code || "")) {
      wx.showToast({ title: "需要授权手机号后领取", icon: "none" });
      return;
    }
    const loginGate = this.selectComponent("#welfarePhoneLoginGate");
    if (!loginGate || typeof loginGate.loginWithPhone !== "function") return;
    this._pendingClaimId = id;
    loginGate.loginWithPhone(event);
  },

  loadCampaigns() {
    this.setData({ loading: true, message: "" });
    request({ url: "/api/welfare/campaigns" })
      .then((response) => {
        this.setData({
          activeCampaigns: sortClaimableCampaigns((response.active || []).map(normalizeCampaign)),
          historyCampaigns: (response.history || []).map(normalizeCampaign),
          loading: false
        });
      })
      .catch((error) => {
        if (Number(error && error.statusCode || 0) === 401) {
          this.showLoginGate();
          return;
        }
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
    const activeCampaign = this.data.activeCampaigns.find((campaign) => campaign._id === id);
    const historyCampaign = this.data.historyCampaigns.find((campaign) => campaign._id === id);
    const selected = activeCampaign || historyCampaign;
    if (selected && selected.claimedByMe) {
      const externalUrl = selected.externalUrl || "";
      this.setData({
        claimDialogVisible: true,
        claimDialogTitle: selected.title || "已领取",
        claimDialogInstructions: selected.claimInstructions || "领取成功，运营会根据福利说明联系你。",
        claimDialogExternalUrl: externalUrl,
        claimDialogIsMiniProgramLink: String(externalUrl).includes("小程序"),
        claimDialogActivationCode: selected.activationCode || ""
      });
      return;
    }
    if (historyCampaign) return;
    this.setData({ claimingId: id, message: "" });
    request({ url: `/api/welfare/campaigns/${id}/claims`, method: "POST" })
      .then((response) => {
        const campaign = response && response.campaign || {};
        const claim = response && response.claim || {};
        const externalUrl = campaign.externalUrl || (selected && selected.externalUrl) || "";
        this.setData({
          activeCampaigns: markCampaignClaimed(this.data.activeCampaigns, id, { ...campaign, activationCode: claim.activationCode }),
          claimDialogVisible: true,
          claimDialogTitle: campaign.title || (selected && selected.title) || "领取成功",
          claimDialogInstructions: campaign.claimInstructions || (selected && selected.claimInstructions) || "领取成功，运营会根据福利说明联系你。",
          claimDialogExternalUrl: externalUrl,
          claimDialogIsMiniProgramLink: String(externalUrl).includes("小程序"),
          claimDialogActivationCode: String(claim.activationCode || campaign.activationCode || "")
        });
      })
      .catch((error) => {
        if (Number(error && error.statusCode || 0) === 401) {
          this.showLoginGate();
          return;
        }
        this.setData({
          message: isNotFoundError(error) ? "这个福利暂时不可领取，稍后再看看" : friendlyError(error, "领取失败，请稍后重试")
        });
      })
      .finally(() => {
        this.setData({ claimingId: "" });
      });
  },

  closeClaimDialog() {
    this.setData({
      claimDialogVisible: false,
      claimDialogTitle: "",
      claimDialogInstructions: "",
      claimDialogExternalUrl: "",
      claimDialogIsMiniProgramLink: false,
      claimDialogActivationCode: ""
    });
  },

  copyClaimLink() {
    copyTextSilently(this.data.claimDialogExternalUrl);
  },

  openClaimLink() {
    const link = String(this.data.claimDialogExternalUrl || "").trim();
    if (!link) return;
    if (!/^#小程序:\/\//u.test(link) || typeof wx.navigateToMiniProgram !== "function") {
      this.copyClaimLink();
      return;
    }
    wx.navigateToMiniProgram({
      shortLink: link,
      fail(error) {
        if (/cancel/i.test(String(error && error.errMsg || ""))) return;
        wx.showToast({ title: "暂时无法打开，请复制链接", icon: "none" });
      }
    });
  },

  copyActivationCode() {
    const code = String(this.data.claimDialogActivationCode || "").trim();
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success() {
        wx.showToast({ title: "激活码已复制", icon: "none" });
      }
    });
  },

  noop() {},

  goBack() {
    smartBackHome();
  },

  goProgramsHome: navigateProgramsHome,

  ...createPageShare(SHARE_OPTIONS)
});
