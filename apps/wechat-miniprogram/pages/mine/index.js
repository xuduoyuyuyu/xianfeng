const { getToken, getUser, clearSession } = require("../../utils/session");

Page({
  data: {
    loggedIn: false,
    user: null
  },

  onShow() {
    this.setData({
      loggedIn: !!getToken(),
      user: getUser()
    });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/index" });
  },

  logout() {
    clearSession();
    this.setData({ loggedIn: false, user: null });
    wx.showToast({ title: "已退出", icon: "none" });
  }
});
