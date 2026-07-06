const { openWeb } = require("./webview");

function scrollPageToTop() {
  if (typeof wx.pageScrollTo === "function") {
    wx.pageScrollTo({ scrollTop: 0, duration: 250 });
  }
}

function goProgramsHome() {
  scrollPageToTop();
}

function switchProgramsHome() {
  wx.switchTab({ url: "/pages/programs/index" });
}

function openNativeSearch(query) {
  const keyword = String(query || "").trim();
  wx.navigateTo({
    url: `/pages/search/index${keyword ? `?q=${encodeURIComponent(keyword)}` : ""}`
  });
}

function openNativeRoute(_page, detail) {
  if (!detail) return;
  if (detail.page) {
    if (detail.page === "/pages/programs/index") {
      switchProgramsHome();
      return;
    }
    wx.switchTab({ url: detail.page });
    return;
  }
  if (!detail.path) return;
  openWeb(detail.path, detail.text || "家长先疯");
}

module.exports = {
  goProgramsHome,
  scrollPageToTop,
  openNativeSearch,
  openNativeRoute
};
