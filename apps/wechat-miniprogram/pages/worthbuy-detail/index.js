const { request } = require("../../utils/request");
const { getUser } = require("../../utils/session");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { normalizeWorthBuyItem, writeWorthBuyCache, readWorthBuyCache } = require("../../utils/worthbuyNative");

Page({
  data: { topbarHeight: 88, backTop: 8, backSize: 32, query: "", report: null, loading: true, error: "" },
  onLoad(options) {
    enableShareMenu();
    const query = decodeURIComponent(String(options.query || ""));
    const user = getUser() || {}; const ownerId = String(user._id || user.id || "public");
    const cachedReport = readWorthBuyCache(`detail:${query}`, ownerId) || readWorthBuyCache(`detail:${query}`, "public");
    const report = cachedReport ? normalizeWorthBuyItem(cachedReport) : null;
    const metrics = getNativeTopbarMetrics();
    const backSize = Math.max(32, Math.round(metrics.capsuleHeight));
    this.setData({ query, topbarHeight: metrics.topbarHeight, backTop: Math.max(0, Math.round(metrics.searchButtonTop + metrics.capsuleHeight / 2 - backSize / 2)), backSize, report, loading: !report }, () => this.drawGauge());
    this.loadDetail();
  },
  loadDetail() {
    const user = getUser() || {}; const ownerId = String(user._id || user.id || "");
    return request({ url: `/api/worthbuy/${encodeURIComponent(this.data.query)}${ownerId ? `?userId=${encodeURIComponent(ownerId)}` : ""}` }).then((response) => {
      const report = normalizeWorthBuyItem(response.item || response);
      this.setData({ report, loading: false, error: "" }, () => this.drawGauge());
      writeWorthBuyCache(`detail:${this.data.query}`, ownerId || "public", report);
    }).catch((error) => this.setData({ loading: false, error: this.data.report ? "" : (error.statusCode === 403 ? "该分析尚未公开" : error.statusCode === 404 ? "未找到该分析" : "详情加载失败，请重试") }));
  },
  drawGauge() {
    const report = this.data.report;
    if (!report || !wx.createCanvasContext) return;
    const context = wx.createCanvasContext("worthbuyGauge", this);
    const center = 90;
    const radius = 74;
    context.setLineWidth(16);
    context.setLineCap("round");
    context.setStrokeStyle("#F3F0FF");
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.stroke();
    const score = Math.max(0, Math.min(100, Number(report.score) || 0));
    if (score > 0) {
      context.setStrokeStyle(report.scoreColor || "#8B5CF6");
      context.beginPath();
      context.arc(center, center, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * score / 100);
      context.stroke();
    }
    context.draw();
  },
  copyReference(event) { const url = String(event.currentTarget.dataset.url || ""); if (!url) return; wx.setClipboardData({ data: url }); },
  goBack() { if (getCurrentPages().length > 1) wx.navigateBack(); else wx.redirectTo({ url: "/pages/worthbuy/index" }); },
  goWorthBuyList() { wx.redirectTo({ url: "/pages/worthbuy/index" }); },
  onShareAppMessage() { return { title: `${this.data.report ? this.data.report.title : this.data.query}｜知物`, path: `/pages/worthbuy-detail/index?query=${encodeURIComponent(this.data.query)}` }; },
  onShareTimeline() { return { title: `${this.data.report ? this.data.report.title : this.data.query}｜知物`, query: `query=${encodeURIComponent(this.data.query)}` }; }
});
