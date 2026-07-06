const { WEB_ROUTES } = require("./config");
const { webUrl } = require("./webview");
const { setSelectedTab } = require("./tabbar");
const { createPageShare, enableShareMenu } = require("./share");
const { getNativeWebviewParams } = require("./nativeChrome");

function resolvePath(route) {
  if (typeof route === "function") return route(WEB_ROUTES);
  return route;
}

function createTabWebviewPage(options) {
  const shareOptions = {
    title: options.shareTitle || options.title || "家长先疯",
    path: options.sharePath
  };

  Page({
    data: {
      selected: options.selected,
      src: ""
    },

    refreshSrc() {
      this.setData({
        src: webUrl(resolvePath(options.route), {
          ...getNativeWebviewParams(),
          ...(options.params || {})
        })
      });
    },

    onLoad() {
      enableShareMenu();
      this.refreshSrc();
    },

    onShow() {
      enableShareMenu();
      setSelectedTab(this, options.selected);
      if (options.refreshOnShow) this.refreshSrc();
    },

    onShareAppMessage() {
      return createPageShare(shareOptions).onShareAppMessage();
    },

    onShareTimeline() {
      return createPageShare(shareOptions).onShareTimeline();
    }
  });
}

module.exports = {
  createTabWebviewPage
};
