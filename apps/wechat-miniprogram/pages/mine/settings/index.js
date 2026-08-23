const { createPageShare, enableShareMenu } = require("../../../utils/share");
const { request } = require("../../../utils/request");
const { getToken, getUser, clearSession } = require("../../../utils/session");
const { maskMobile, parseStoredValue } = require("../../../utils/profileState");
const { applyFontSizeSetting, buildFontOptions, clearAppCache, deleteAccountFromSettings, readFontSizeSetting } = require("../../../utils/nativeSettings");
const { ensureBackStackForBackButtonPage } = require("../../../utils/nativePageNav");
const { decisionForCurrentUser, requestSearchIdentityConsent, revokeSearchIdentityConsent } = require("../../../utils/searchAnalyticsIdentity");

function loadUser() {
  return parseStoredValue(getUser(), {}) || {};
}

Page({
  data: {
    title: "设置",
    isLoggedIn: false,
    hasMobile: false,
    bindingPhone: false,
    maskedMobile: "未绑定",
    fontSize: "standard",
    fontSizeClass: "xf-font-standard",
    fontOptions: buildFontOptions("standard"),
    searchIdentityConsent: "",
    message: ""
  },

  onLoad(options = {}) {
    if (ensureBackStackForBackButtonPage(options)) return;
    enableShareMenu();
    this.refresh();
  },

  onShow() {
    enableShareMenu();
    this.refresh();
  },

  refresh() {
    const token = getToken();
    const user = loadUser();
    const fontState = readFontSizeSetting();
    this.setData({
      isLoggedIn: Boolean(token),
      hasMobile: Boolean(token && user.mobile),
      maskedMobile: token ? maskMobile(user.mobile) : "未绑定",
      ...fontState,
      searchIdentityConsent: token ? decisionForCurrentUser() : "",
      message: "",
      bindingPhone: false
    });
  },

  chooseFont(event) {
    const value = String(event.currentTarget.dataset.value || "standard");
    applyFontSizeSetting(this, value);
    this.setData({ message: "字体设置已保存" });
  },

  clearCache() {
    clearAppCache();
    this.setData({ message: "缓存已清理" });
  },

  manageSearchIdentityConsent() {
    if (!getToken()) {
      this.goLogin();
      return;
    }
    if (this.data.searchIdentityConsent === "accepted") {
      wx.showModal({
        title: "撤回搜索记录关联",
        content: "撤回后，本设备已关联的搜索记录会解除账号关系，后续搜索保持匿名。",
        confirmText: "确认撤回",
        confirmColor: "#dc2626",
        success: (result) => {
          if (!result || !result.confirm) return;
          revokeSearchIdentityConsent()
            .then(() => {
              this.refresh();
              this.setData({ message: "已撤回搜索记录关联" });
            })
            .catch((error) => this.setData({ message: error.message || "撤回失败，请重试" }));
        }
      });
      return;
    }
    requestSearchIdentityConsent({ prompt: true, force: true }).then((accepted) => {
      this.refresh();
      this.setData({ message: accepted ? "已允许关联搜索记录" : "搜索记录仍保持匿名" });
    });
  },

  loginWithPhone(event) {
    const gate = this.selectComponent("#settingsPhoneLoginGate");
    if (gate && typeof gate.loginWithPhone === "function") gate.loginWithPhone(event);
  },

  handleLoginSuccess() {
    this.refresh();
    this.setData({ message: "登录成功" });
  },

  handleLoginFailure(event) {
    this.setData({ message: String(event && event.detail && event.detail.message || "登录失败") });
  },

  goLogin() {
    this.setData({ message: "请点击登录并授权手机号" });
  },

  bindPhone(event) {
    if (!getToken()) {
      this.goLogin();
      return;
    }
    const phoneCode = String(event && event.detail && event.detail.code || "");
    if (!phoneCode) {
      this.setData({ message: "需要授权手机号后绑定" });
      return;
    }
    this.setData({ bindingPhone: true, message: "" });
    request({
      method: "POST",
      url: "/api/wechat-mini/bind-phone",
      data: { phoneCode }
    })
      .then((payload) => {
        const app = typeof getApp === "function" ? getApp() : null;
        if (app && typeof app.setLoginSession === "function") app.setLoginSession(payload);
        this.refresh();
        this.setData({ message: "手机号已绑定" });
      })
      .catch((error) => {
        this.setData({ message: error.message || "绑定手机号失败" });
      })
      .finally(() => {
        this.setData({ bindingPhone: false });
      });
  },

  logout() {
    clearSession();
    const app = typeof getApp === "function" ? getApp() : null;
    if (app && typeof app.clearLoginSession === "function") app.clearLoginSession();
    this.setData({
      isLoggedIn: false,
      hasMobile: false,
      maskedMobile: "未绑定",
      message: "已退出登录"
    });
  },

  deleteAccount() {
    deleteAccountFromSettings(this, { messageKey: "message" });
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
      title: "家长先疯设置",
      path: "/pages/mine/settings/index"
    }).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare({
      title: "家长先疯设置",
      path: "/pages/mine/settings/index"
    }).onShareTimeline();
  }
});
