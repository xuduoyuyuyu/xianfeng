Page({
  data: {
    src: ""
  },

  onLoad(options) {
    const title = decodeURIComponent(options.title || "家长先疯");
    const src = decodeURIComponent(options.url || "");
    wx.setNavigationBarTitle({ title });
    this.setData({ src });
  }
});
