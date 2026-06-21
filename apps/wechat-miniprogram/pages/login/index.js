const { request } = require("../../utils/request");
const { WEB_ORIGIN } = require("../../utils/config");

function buildRedirectUrl(rawUrl, token) {
  if (!rawUrl || !token) return "";
  try {
    const url = new URL(rawUrl);
    if (url.origin !== WEB_ORIGIN) return "";
    url.searchParams.set("xf_mp", "1");
    url.searchParams.set("xf_token", token);
    return url.toString();
  } catch (error) {
    return "";
  }
}

Page({
  data: {
    loading: false,
    error: ""
  },

  onLoad(options) {
    this.redirectUrl = decodeURIComponent(options.redirect || "");
  },

  login() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    wx.login({
      success: ({ code }) => {
        if (!code) {
          this.setData({ loading: false, error: "微信登录失败，请重试" });
          return;
        }
        request({
          method: "POST",
          url: "/api/wechat-mini/login",
          data: { code }
        })
          .then((payload) => {
            getApp().setLoginSession(payload);
            wx.showToast({ title: "登录成功", icon: "success" });
            setTimeout(() => {
              const redirectUrl = buildRedirectUrl(this.redirectUrl, payload && payload.token);
              if (redirectUrl) {
                wx.redirectTo({
                  url: `/pages/webview/index?url=${encodeURIComponent(redirectUrl)}&title=${encodeURIComponent("家长先疯")}`
                });
                return;
              }
              wx.navigateBack({ delta: 1 });
            }, 300);
          })
          .catch((error) => {
            this.setData({ error: error.message || "登录失败" });
          })
          .finally(() => {
            this.setData({ loading: false });
          });
      },
      fail: () => {
        this.setData({ loading: false, error: "无法调用微信登录" });
      }
    });
  }
});
