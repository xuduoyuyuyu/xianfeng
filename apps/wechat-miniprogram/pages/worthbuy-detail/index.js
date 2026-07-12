const { request } = require("../../utils/request");
const { getUser } = require("../../utils/session");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { normalizeWorthBuyItem, writeWorthBuyCache, readWorthBuyCache } = require("../../utils/worthbuyNative");

Page({
  data: { topbarHeight: 88, query: "", report: null, loading: true, error: "" },
  onLoad(options) {
    enableShareMenu();
    const query = decodeURIComponent(String(options.query || ""));
    const user = getUser() || {}; const ownerId = String(user._id || user.id || "public");
    const report = readWorthBuyCache(`detail:${query}`, ownerId) || readWorthBuyCache(`detail:${query}`, "public");
    this.setData({ query, topbarHeight: getNativeTopbarMetrics().topbarHeight, report: report || null, loading: !report });
    this.loadDetail();
  },
  loadDetail() {
    const user = getUser() || {}; const ownerId = String(user._id || user.id || "");
    return request({ url: `/api/worthbuy/${encodeURIComponent(this.data.query)}${ownerId ? `?userId=${encodeURIComponent(ownerId)}` : ""}` }).then((response) => {
      const report = normalizeWorthBuyItem(response.item || response);
      this.setData({ report, loading: false, error: "" });
      writeWorthBuyCache(`detail:${this.data.query}`, ownerId || "public", report);
    }).catch((error) => this.setData({ loading: false, error: this.data.report ? "" : (error.statusCode === 403 ? "该分析尚未公开" : error.statusCode === 404 ? "未找到该分析" : "详情加载失败，请重试") }));
  },
  copyReference(event) { const url = String(event.currentTarget.dataset.url || ""); if (!url) return; wx.setClipboardData({ data: url }); },
  goBack() { if (getCurrentPages().length > 1) wx.navigateBack(); else wx.redirectTo({ url: "/pages/worthbuy/index" }); },
  goWorthBuyList() { wx.redirectTo({ url: "/pages/worthbuy/index" }); },
  onShareAppMessage() { return { title: `${this.data.report ? this.data.report.title : this.data.query}｜知物`, path: `/pages/worthbuy-detail/index?query=${encodeURIComponent(this.data.query)}` }; },
  onShareTimeline() { return { title: `${this.data.report ? this.data.report.title : this.data.query}｜知物`, query: `query=${encodeURIComponent(this.data.query)}` }; }
});
