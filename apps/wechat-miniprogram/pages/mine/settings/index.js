const { createPageShare, enableShareMenu } = require("../../../utils/share");
const { request } = require("../../../utils/request");
const { getToken, getUser, clearSession } = require("../../../utils/session");
const { maskMobile, parseStoredValue } = require("../../../utils/profileState");
const { applyFontSizeSetting, buildFontOptions, clearAppCache, readFontSizeSetting } = require("../../../utils/nativeSettings");
const { ensureBackStackForBackButtonPage } = require("../../../utils/nativePageNav");

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

  loginWithPhone(event) {
    if (this.data.bindingPhone) return;
    const phoneCode = String(event && event.detail && event.detail.code || "");
    if (!phoneCode) {
      this.setData({ message: "需要授权手机号后登录" });
      return;
    }
    this.setData({ bindingPhone: true, message: "" });
    wx.login({
      success: ({ code }) => {
        if (!code) {
          this.setData({ bindingPhone: false, message: "微信登录失败，请重试" });
          return;
        }
        request({
          method: "POST",
          url: "/api/wechat-mini/login",
          data: { code, phoneCode }
        })
          .then((payload) => {
            const app = typeof getApp === "function" ? getApp() : null;
            if (app && typeof app.setLoginSession === "function") app.setLoginSession(payload);
            this.refresh();
            this.setData({ message: "登录成功" });
          })
          .catch((error) => {
            this.setData({ message: error.message || "登录失败" });
          })
          .finally(() => {
            this.setData({ bindingPhone: false });
          });
      },
      fail: () => {
        this.setData({ bindingPhone: false, message: "无法调用微信登录" });
      }
    });
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
    this.setData({ message: "注销账户需在登录后通过账号服务完成" });
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
