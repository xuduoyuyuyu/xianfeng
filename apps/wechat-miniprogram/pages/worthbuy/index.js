const { request } = require("../../utils/request");
const { getToken, getUser } = require("../../utils/session");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { createNativeSettingsMethods } = require("../../utils/nativeSettings");
const { normalizeWorthBuyItem, classifyWorthBuyError, worthBuyDetailPath, writeWorthBuyCache, readWorthBuyCache, parseWorthBuyInput } = require("../../utils/worthbuyNative");

const PAGE_SIZE = 20;

Page({
  data: { topbarHeight: 88, input: "", publicItems: [], myItems: [], loading: true, loadingMore: false, submitting: false, submitStage: "", error: "", actionError: "", actionErrorType: "", current: 1, pages: 1, showHistory: false, isLoggedIn: false },
  onLoad() {
    enableShareMenu();
    const metrics = getNativeTopbarMetrics();
    this.setData({ topbarHeight: metrics.topbarHeight, isLoggedIn: !!getToken() });
    const cached = readWorthBuyCache("public", "public");
    if (Array.isArray(cached)) this.setData({ publicItems: cached, loading: false });
    this.loadPublic(1);
    if (getToken()) this.loadMyHistory();
  },
  onShow() { this.setData({ isLoggedIn: !!getToken() }); },
  onPullDownRefresh() { Promise.all([this.loadPublic(1), getToken() ? this.loadMyHistory() : Promise.resolve()]).finally(() => wx.stopPullDownRefresh()); },
  onReachBottom() { if (!this.data.loadingMore && this.data.current < this.data.pages) this.loadPublic(this.data.current + 1); },
  onInput(event) { this.setData({ input: event.detail.value, actionError: "", actionErrorType: "" }); },
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
    if (!getToken()) return this.setData({ actionErrorType: "auth", actionError: "登录后查看我的分析记录" });
    this.setData({ showHistory: !this.data.showHistory });
    if (!this.data.myItems.length) this.loadMyHistory();
  },
  submitAnalysis() {
    if (this._submitPromise) return this._submitPromise;
    if (!getToken()) return this.setData({ actionErrorType: "auth", actionError: "请先使用微信手机号登录" });
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
      .catch((error) => this.setData({ actionErrorType: classifyWorthBuyError(error), actionError: error.message || "分析失败，请稍后重试" }))
      .finally(() => { this._submitPromise = null; this.setData({ submitting: false, submitStage: "" }); });
    return this._submitPromise;
  },
  openDetail(event) { const item = (event.currentTarget.dataset.scope === "my" ? this.data.myItems : this.data.publicItems)[Number(event.currentTarget.dataset.index)]; if (item) wx.navigateTo({ url: worthBuyDetailPath(item.query || item.title) }); },
  deleteHistoryItem(event) {
    const item = this.data.myItems[Number(event.currentTarget.dataset.index)]; if (!item) return;
    wx.showModal({ title: "删除分析", content: `确认删除“${item.title}”吗？`, success: (modal) => { if (!modal.confirm) return; const user = getUser() || {}; const ownerId = String(user._id || user.id || ""); request({ method: "DELETE", url: `/api/worthbuy/my/${encodeURIComponent(item.brand || item.query)}?userId=${encodeURIComponent(ownerId)}` }).then(() => { const items = this.data.myItems.filter((entry) => entry.id !== item.id); this.setData({ myItems: items }); writeWorthBuyCache("history", ownerId, items); }); } });
  },
  openPro() { wx.navigateTo({ url: "/pages/pro/index" }); },
  goBack() { if (getCurrentPages().length > 1) wx.navigateBack(); else wx.switchTab({ url: "/pages/programs/index" }); },
  ...createNativeSettingsMethods(),
  ...createPageShare({ title: "知物｜真实产品与服务分析", path: "/pages/worthbuy/index" })
});
