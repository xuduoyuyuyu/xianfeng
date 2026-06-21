const { WEB_ROUTES } = require("../../utils/config");
const { webUrl } = require("../../utils/webview");

Page({
  data: {
    src: ""
  },

  onShow() {
    this.setData({ src: webUrl(WEB_ROUTES.materials) });
  }
});
