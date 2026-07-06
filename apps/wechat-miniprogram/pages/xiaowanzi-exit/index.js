function closeXiaowanziSuperWebview() {
  wx.navigateBack({
    delta: 2,
    fail() {
      wx.switchTab({ url: "/pages/programs/index" });
    }
  });
}

Page({
  onLoad() {
    try {
      if (wx.removeStorageSync) {
        wx.removeStorageSync("xf_xiaowanzi_entry_mode");
      } else {
        wx.setStorageSync("xf_xiaowanzi_entry_mode", "");
      }
    } catch (_error) {}
    closeXiaowanziSuperWebview();
  }
});
