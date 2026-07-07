const { openWeb } = require("./webview");

const BACK_STACK_MARKER_KEY = "xf_back_stack";
const BACK_STACK_HOME_PAGE = "/pages/programs/index";

function scrollPageToTop() {
  if (typeof wx.pageScrollTo === "function") {
    wx.pageScrollTo({ scrollTop: 0, duration: 250 });
  }
}

function goProgramsHome() {
  scrollPageToTop();
}

function switchProgramsHome() {
  wx.switchTab({ url: BACK_STACK_HOME_PAGE });
}

function smartBackHome() {
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }
  switchProgramsHome();
}

function openNativeSearch(query) {
  const keyword = String(query || "").trim();
  wx.navigateTo({
    url: `/pages/search/index${keyword ? `?q=${encodeURIComponent(keyword)}` : ""}`
  });
}

function encodeOptions(options) {
  const query = [];
  Object.keys(options || {}).forEach((key) => {
    const value = options[key];
    if (value === undefined || value === null || value === "") return;
    query.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  });
  return query.length ? `?${query.join("&")}` : "";
}

function ensureBackStackForBackButtonPage(options) {
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  if (pages.length !== 1) return false;
  const current = pages[0] || {};
  const route = String(current.route || "").trim();
  if (!route) return false;
  const pageOptions = {
    ...(current.options || {}),
    ...(options || {})
  };
  if (String(pageOptions[BACK_STACK_MARKER_KEY] || "") === "1") return false;
  const targetUrl = `/${route}${encodeOptions({ ...pageOptions, [BACK_STACK_MARKER_KEY]: "1" })}`;
  wx.switchTab({
    url: BACK_STACK_HOME_PAGE,
    success() {
      wx.navigateTo({ url: targetUrl });
    }
  });
  return true;
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
  ensureBackStackForBackButtonPage,
  goProgramsHome,
  smartBackHome,
  scrollPageToTop,
  openNativeSearch,
  openNativeRoute
};
