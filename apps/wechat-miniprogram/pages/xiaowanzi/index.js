const { WEB_ROUTES } = require("../../utils/config");
const { getToken } = require("../../utils/session");
const { webUrl } = require("../../utils/webview");

Page({
  data: {
    src: "",
    loggedIn: false
  },

  onShow() {
    const loggedIn = !!getToken();
    this.setData({
      loggedIn,
      src: loggedIn ? webUrl(WEB_ROUTES.xiaowanzi, { xw_layer: "1" }) : ""
    });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/index" });
  }
});
