const { request } = require("../../utils/request");
const { getToken, getUser } = require("../../utils/session");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { SETTINGS_SECTIONS, createNativeSettingsMethods } = require("../../utils/nativeSettings");
const { goProgramsHome: navigateProgramsHome } = require("../../utils/nativePageNav");
const { normalizeWorthBuyItem, classifyWorthBuyError, worthBuyDetailPath, writeWorthBuyCache, readWorthBuyCache, parseWorthBuyInput } = require("../../utils/worthbuyNative");

const PAGE_SIZE = 20;
const LOGO_HEIGHT_RPX = 56;

Page({
  data: { topbarHeight: 88, chromeHeight: 88, logoTop: 10, logoHeight: 28, welfareRight: 101, profilePanelTop: 30, profileHeaderHeight: 32, selected: 4, hideTabbar: false, settingsSections: SETTINGS_SECTIONS, settingsPanelOpen: false, settingsPanelView: "menu", settingsProfilePanelSupported: true, input: "", publicItems: [], myItems: [], loading: true, loadingMore: false, submitting: false, submitStage: "", error: "", actionError: "", actionErrorType: "", current: 1, pages: 1, showHistory: false, isLoggedIn: false, loginRequired: false },
  onLoad() {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.setData({ isLoggedIn: !!getToken() });
    const cached = readWorthBuyCache("public", "public");
    if (Array.isArray(cached)) this.setData({ publicItems: cached, loading: false });
    this.loadPublic(1);
    if (getToken()) this.loadMyHistory();
  },
  onShow() { this.setData({ isLoggedIn: !!getToken() }); },
  onPullDownRefresh() { Promise.all([this.loadPublic(1), getToken() ? this.loadMyHistory() : Promise.resolve()]).finally(() => wx.stopPullDownRefresh()); },
  onReachBottom() { if (!this.data.loadingMore && this.data.current < this.data.pages) this.loadPublic(this.data.current + 1); },
  onInput(event) { this.setData({ input: event.detail.value, actionError: "", actionErrorType: "" }); },
  syncTopbarMetrics() {
    const metrics = getNativeTopbarMetrics();
    const topbarHeight = Math.max(72, Math.round(metrics.topbarHeight || 88));
    const windowWidth = Math.max(320, Number(metrics.windowWidth || 375));
    const logoHeight = Math.round((LOGO_HEIGHT_RPX * windowWidth) / 750);
    const capsuleHeight = Math.max(28, Math.round(metrics.capsuleHeight || 32));
    const searchButtonTop = Math.max(8, Math.round(metrics.searchButtonTop || 8));
    this.setData({ topbarHeight, chromeHeight: topbarHeight, logoHeight, logoTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - logoHeight / 2)), welfareRight: Math.max(72, Math.round(metrics.capsuleRight || 96) + 5), profilePanelTop: searchButtonTop, profileHeaderHeight: capsuleHeight });
  },
  loadPublic(current) {
    this.setData(current === 1 ? { loading: !this.data.publicItems.length, error: "" } : { loadingMore: true });
    return request({ url: `/api/worthbuy/list?current=${current}&size=${PAGE_SIZE}` }).then((response) => {
      const incoming = (response.items || []).map(normalizeWorthBuyItem);
      const seen = new Set((current === 1 ? [] : this.data.publicItems).map((item) => item.id));
      const items = (current === 1 ? [] : this.data.publicItems).concat(incoming.filter((item) => !seen.has(item.id)));
      this.setData({ publicItems: items, current: Number(response.current || current), pages: Number(response.pages || 1), loading: false, loadingMore: false });
      writeWorthBuyCache("public", "public", items);
    }).catch((error) => this.setData({ loading: false, loadingMore: false, error: error.message || "知物列表加载失败" }));
  },
  loadMyHistory() {
    const user = getUser() || {};
    const ownerId = String(user._id || user.id || "");
    const cached = readWorthBuyCache("history", ownerId);
    if (Array.isArray(cached)) this.setData({ myItems: cached });
    return request({ url: `/api/worthbuy/my?current=1&size=${PAGE_SIZE}&userId=${encodeURIComponent(ownerId)}` }).then((response) => {
      const items = (response.items || []).map(normalizeWorthBuyItem);
      this.setData({ myItems: items });
      writeWorthBuyCache("history", ownerId, items);
    }).catch(() => {});
  },
  toggleHistory() {
    if (!getToken()) return;
    this.setData({ showHistory: !this.data.showHistory });
    if (!this.data.myItems.length) this.loadMyHistory();
  },
  submitAnalysis() {
    if (this._submitPromise) return this._submitPromise;
    if (!getToken()) return;
    const parsed = parseWorthBuyInput(this.data.input);
    if (!parsed.raw || (!parsed.title && !parsed.url)) return this.setData({ actionErrorType: "validation", actionError: "请输入完整商品名称、链接或分享文案" });
    const user = getUser() || {};
    this.setData({ submitting: true, submitStage: "正在读取商品信息…", actionError: "", actionErrorType: "" });
    this._submitPromise = request({ method: "POST", url: "/api/worthbuy/submit", data: { brand: parsed.title || parsed.brand, url: parsed.url || undefined, extractedTitle: parsed.title || undefined, submittedBy: String(user._id || user.id || "") } })
      .then((result) => {
        this.setData({ submitStage: "分析完成，正在打开报告…" });
        const item = normalizeWorthBuyItem({ query: parsed.raw, result });
        writeWorthBuyCache(`detail:${parsed.raw}`, String(user._id || user.id || "public"), item);
        wx.navigateTo({ url: worthBuyDetailPath(parsed.raw) });
        return this.loadMyHistory();
      })
      .catch((error) => {
        const type = classifyWorthBuyError(error);
        if (type === "auth") return this.setData({ isLoggedIn: false, actionError: "登录已过期，请再次点击分析", actionErrorType: "auth" });
        this.setData({ actionErrorType: type, actionError: error.message || "分析失败，请稍后重试" });
      })
      .finally(() => { this._submitPromise = null; this.setData({ submitting: false, submitStage: "" }); });
    return this._submitPromise;
  },
  openDetail(event) { const item = (event.currentTarget.dataset.scope === "my" ? this.data.myItems : this.data.publicItems)[Number(event.currentTarget.dataset.index)]; if (item) wx.navigateTo({ url: worthBuyDetailPath(item.query || item.title) }); },
  deleteHistoryItem(event) {
    const item = this.data.myItems[Number(event.currentTarget.dataset.index)]; if (!item) return;
    wx.showModal({ title: "删除分析", content: `确认删除“${item.title}”吗？`, success: (modal) => { if (!modal.confirm) return; const user = getUser() || {}; const ownerId = String(user._id || user.id || ""); request({ method: "DELETE", url: `/api/worthbuy/my/${encodeURIComponent(item.brand || item.query)}?userId=${encodeURIComponent(ownerId)}` }).then(() => { const items = this.data.myItems.filter((entry) => entry.id !== item.id); this.setData({ myItems: items }); writeWorthBuyCache("history", ownerId, items); }); } });
  },
  openPro() { wx.navigateTo({ url: "/pages/pro/index" }); },
  authorizeAnalysis(event) { this.authorizeWorthBuyAction("analysis", event); },
  authorizeHistory(event) { this.authorizeWorthBuyAction("history", event); },
  authorizeWorthBuyAction(type, event) {
    if (getToken()) return;
    this._pendingWorthBuyAction = type;
    const gate = this.selectComponent("#worthbuyPhoneLoginGate");
    if (gate && typeof gate.loginWithPhone === "function") gate.loginWithPhone(event);
  },
  handleLoginSuccess() {
    const action = this._pendingWorthBuyAction;
    this._pendingWorthBuyAction = "";
    this.setData({ isLoggedIn: true, actionError: "", actionErrorType: "" });
    this.loadMyHistory();
    if (action === "analysis") this.submitAnalysis();
    if (action === "history") this.toggleHistory();
  },
  handleLoginFailure(event) {
    this._pendingWorthBuyAction = "";
    wx.showToast({ title: String(event && event.detail && event.detail.message || "登录失败，请重试"), icon: "none" });
  },
  goProgramsHome() { navigateProgramsHome(); },
  goBack() { if (getCurrentPages().length > 1) wx.navigateBack(); else wx.switchTab({ url: "/pages/programs/index" }); },
  ...createNativeSettingsMethods(),
  ...createPageShare({ title: "知物｜真实产品与服务分析", path: "/pages/worthbuy/index" })
});
