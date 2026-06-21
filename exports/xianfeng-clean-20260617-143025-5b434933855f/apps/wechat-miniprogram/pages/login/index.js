const { request } = require("../../utils/request");

Page({
  data: {
    loading: false,
    error: ""
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
            setTimeout(() => wx.navigateBack({ delta: 1 }), 300);
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
