const NATIVE_TABBAR_HEIGHT = 56;

function getSafeBottom() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : {});
  const screenHeight = Number(info.screenHeight || 0);
  const safeBottom = Number(info.safeArea && info.safeArea.bottom || 0);
  if (!screenHeight || !safeBottom) return 0;
  return Math.max(0, Math.min(40, Math.round(screenHeight - safeBottom)));
}

function getNativeTopbarMetrics() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
  const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
  const statusBarHeight = windowInfo.statusBarHeight || 0;
  const menuButtonHeight = menuButton && menuButton.height ? Number(menuButton.height) : 32;
  const contentHeight = menuButton && menuButton.height
    ? menuButtonHeight + (menuButton.top - statusBarHeight) * 2
    : 48;
  const topbarHeight = statusBarHeight + contentHeight;
  const capsuleRight = windowInfo.windowWidth && menuButton && menuButton.left
    ? Math.max(windowInfo.windowWidth - menuButton.left + 8, 96)
    : 96;
  const searchButtonTop = menuButton && Number.isFinite(Number(menuButton.top))
    ? Math.round(Number(menuButton.top))
    : Math.max(8, Math.round(statusBarHeight + Math.max(0, contentHeight - 32) / 2));

  return {
    topbarHeight,
    statusBarHeight,
    contentHeight,
    capsuleRight,
    capsuleHeight: menuButtonHeight,
    searchButtonTop,
    searchButtonRight: capsuleRight,
    windowWidth: Number(windowInfo.windowWidth || 375)
  };
}

function getNativeTabbarMetrics() {
  const safeBottom = getSafeBottom();
  return {
    tabbarHeight: NATIVE_TABBAR_HEIGHT,
    safeBottom,
    totalHeight: NATIVE_TABBAR_HEIGHT + safeBottom
  };
}

function getNativeWebviewParams() {
  const tabbarMetrics = getNativeTabbarMetrics();
  const { readWebviewFontSizeParam } = require("./nativeSettings");
  return {
    xf_mp: "1",
    xf_tab: String(Math.round(tabbarMetrics.totalHeight)),
    xf_font: readWebviewFontSizeParam()
  };
}

module.exports = {
  NATIVE_TABBAR_HEIGHT,
  getSafeBottom,
  getNativeTabbarMetrics,
  getNativeTopbarMetrics,
  getNativeWebviewParams
};
