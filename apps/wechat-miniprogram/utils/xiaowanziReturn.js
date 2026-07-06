const XIAOWANZI_RETURN_TARGET_KEY = "xf_xiaowanzi_return_target_v1";
const XIAOWANZI_RETURN_PAGE_KEY = "xf_xiaowanzi_return_page";
const DEFAULT_RETURN_TAB = "/pages/programs/index";
const TAB_PAGE_PATHS = [
  "/pages/programs/index",
  "/pages/reading/index",
  "/pages/materials/index",
  "/pages/topics/index"
];

function normalizePagePath(path) {
  const source = String(path || "").trim();
  if (!source) return "";
  const withoutQuery = source.split("?")[0].split("#")[0];
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

function isXiaowanziPage(path) {
  const normalized = normalizePagePath(path);
  return normalized === "/pages/xiaowanzi/index" || normalized === "/pages/xiaowanzi-exit/index";
}

function isTabPage(path) {
  return TAB_PAGE_PATHS.indexOf(normalizePagePath(path)) >= 0;
}

function normalizeTabTarget(path) {
  const normalized = normalizePagePath(path);
  if (!normalized || isXiaowanziPage(normalized) || !isTabPage(normalized)) return "";
  return normalized;
}

function encodeOptions(options) {
  const query = Object.keys(options || {})
    .filter((key) => options[key] !== undefined && options[key] !== null && options[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key]))}`)
    .join("&");
  return query ? `?${query}` : "";
}

function normalizeReturnTarget(target) {
  const source = target || {};
  if (source.type === "navigateTo") {
    const url = String(source.url || "").trim();
    if (url && !isXiaowanziPage(url)) return { type: "navigateTo", url };
  }
  const tabUrl = normalizeTabTarget(source.url || source.pagePath || source);
  return tabUrl ? { type: "tab", url: tabUrl } : null;
}

function buildTargetFromPage(page) {
  if (!page || !page.route) return null;
  const route = normalizePagePath(page.route);
  if (!route || isXiaowanziPage(route)) return null;
  if (isTabPage(route)) return { type: "tab", url: route };
  if (route === "/pages/webview/index") {
    const src = page.data && page.data.src ? String(page.data.src) : "";
    const title = page.data && page.data.title ? String(page.data.title) : "";
    if (src) {
      return {
        type: "navigateTo",
        url: `/pages/webview/index?url=${encodeURIComponent(src)}&title=${encodeURIComponent(title || "家长先疯")}`
      };
    }
  }
  if (route.indexOf("/pages/") === 0) {
    return { type: "navigateTo", url: `${route}${encodeOptions(page.options || {})}` };
  }
  return null;
}

function saveReturnTarget(target) {
  const normalized = normalizeReturnTarget(target);
  if (!normalized) return;
  try {
    wx.setStorageSync(XIAOWANZI_RETURN_TARGET_KEY, normalized);
    if (normalized.type === "tab") wx.setStorageSync(XIAOWANZI_RETURN_PAGE_KEY, normalized.url);
  } catch (_error) {}
}

function rememberXiaowanziReturnPage(pagePath) {
  saveReturnTarget({ type: "tab", url: pagePath });
}

function rememberCurrentExternalPage() {
  try {
    if (typeof getCurrentPages !== "function") return;
    const pages = getCurrentPages();
    const current = Array.isArray(pages) && pages.length ? pages[pages.length - 1] : null;
    saveReturnTarget(buildTargetFromPage(current));
  } catch (_error) {}
}

function readReturnTarget() {
  try {
    const stored = wx.getStorageSync(XIAOWANZI_RETURN_TARGET_KEY);
    const normalized = normalizeReturnTarget(stored);
    if (normalized) return normalized;
    const legacyPage = wx.getStorageSync(XIAOWANZI_RETURN_PAGE_KEY);
    return normalizeReturnTarget(legacyPage) || { type: "tab", url: DEFAULT_RETURN_TAB };
  } catch (_error) {
    return { type: "tab", url: DEFAULT_RETURN_TAB };
  }
}

function switchToDefault() {
  wx.switchTab({ url: DEFAULT_RETURN_TAB });
}

function returnFromXiaowanzi() {
  const target = readReturnTarget();
  if (target.type === "navigateTo" && typeof wx.navigateTo === "function") {
    wx.navigateTo({
      url: target.url,
      fail() {
        switchToDefault();
      }
    });
    return;
  }
  wx.switchTab({
    url: normalizeTabTarget(target.url) || DEFAULT_RETURN_TAB,
    fail() {
      switchToDefault();
    }
  });
}

module.exports = {
  XIAOWANZI_RETURN_TARGET_KEY,
  XIAOWANZI_RETURN_PAGE_KEY,
  DEFAULT_RETURN_TAB,
  rememberXiaowanziReturnPage,
  rememberCurrentExternalPage,
  returnFromXiaowanzi
};
