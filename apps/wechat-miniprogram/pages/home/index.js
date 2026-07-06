Page({
  goPrograms() {
    wx.switchTab({ url: "/pages/programs/index" });
  },

  onLoad() {
    this.goPrograms();
  },

  onShow() {
    this.goPrograms();
  }
});
