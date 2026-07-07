const { createPageShare, enableShareMenu } = require("../../../utils/share");
const { readFontSizeSetting } = require("../../../utils/nativeSettings");
const { ensureBackStackForBackButtonPage } = require("../../../utils/nativePageNav");

const MEMORY_ENABLED_KEY = "xf_child_memory_enabled";

Page({
  data: {
    title: "个性化回答",
    enabled: true,
    message: "",
    fontSize: "standard",
    fontSizeClass: "xf-font-standard"
  },

  onLoad(options = {}) {
    if (ensureBackStackForBackButtonPage(options)) return;
    enableShareMenu();
    this.loadMemorySetting();
  },

  onShow() {
    enableShareMenu();
    this.loadMemorySetting();
  },

  loadMemorySetting() {
    const stored = wx.getStorageSync(MEMORY_ENABLED_KEY);
    this.setData({ ...readFontSizeSetting(), enabled: stored === "" ? true : stored !== false, message: "" });
  },

  toggleMemory() {
    const enabled = !this.data.enabled;
    wx.setStorageSync(MEMORY_ENABLED_KEY, enabled);
    this.setData({ enabled, message: "设置已保存" });
  },

  manageMemory() {
    this.setData({ message: "记忆管理会在后续版本接入" });
  },

  goBack() {
    if (typeof wx.navigateBack === "function") {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.switchTab({ url: "/pages/mine/index" });
  },

  onShareAppMessage() {
    return createPageShare({
      title: "家长先疯个性化回答",
      path: "/pages/mine/memory/index"
    }).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare({
      title: "家长先疯个性化回答",
      path: "/pages/mine/memory/index"
    }).onShareTimeline();
  }
});
