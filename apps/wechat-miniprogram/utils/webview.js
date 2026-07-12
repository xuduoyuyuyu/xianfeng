const { WEB_ORIGIN } = require("./config");
const { getToken } = require("./session");
const { getNativeWebviewParams } = require("./nativeChrome");
const { rememberCurrentExternalPage } = require("./xiaowanziReturn");

const XIAOWANZI_ENTRY_MODE_KEY = "xf_xiaowanzi_entry_mode";
const XIAOWANZI_WEB_PATH = "/index-xiaowanzi.html";
const XIAOWANZI_RESET_QUERY_KEY = "xf_xw_reset";
const XIAOWANZI_LAYER_QUERY_KEYS = ["xw_layer", "xw_return"];
const XIAOWANZI_ENTRY_QUERY_KEYS = ["xf_xw", "xf_xw_ts"];
const TOPIC_DETAIL_WEBVIEW_VERSION = "20260630-topic-detail";
const WELFARE_WEBVIEW_VERSION = "20260706-welfare-compact";
const PRO_WEBVIEW_VERSION = "20260712-virtual-payment";

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function parsePath(path) {
  const source = String(path || "");
  const absoluteMatch = source.match(/^(https?:\/\/[^/]+)(.*)$/);
  const rawPath = absoluteMatch
    ? (absoluteMatch[2] || "/")
    : (source.startsWith("/") ? source : `/${source}`);
  const hashIndex = rawPath.indexOf("#");
  const pathAndSearch = hashIndex >= 0 ? rawPath.slice(0, hashIndex) : rawPath;
  const queryIndex = pathAndSearch.indexOf("?");

  return {
    origin: absoluteMatch ? absoluteMatch[1] : WEB_ORIGIN,
    pathname: queryIndex >= 0 ? pathAndSearch.slice(0, queryIndex) : pathAndSearch,
    search: queryIndex >= 0 ? pathAndSearch.slice(queryIndex + 1) : "",
    hash: hashIndex >= 0 ? rawPath.slice(hashIndex) : ""
  };
}

function isXiaowanziWebPath(pathname) {
  return pathname === XIAOWANZI_WEB_PATH;
}

function isTopicDetailWebPath(pathname) {
  return pathname.indexOf("/topics/") === 0;
}

function isProgramDetailWebPath(pathname) {
  return /^\/programs\/[^/?#]+$/.test(pathname);
}

function isWelfareWebPath(pathname) {
  return pathname === "/welfare";
}

function isProWebPath(pathname) {
  return pathname === "/pro" || pathname === "/pro/success";
}

function buildNativeProUrl(search) {
  const query = new Map();
  String(search || "")
    .split("&")
    .filter(Boolean)
    .forEach((pair) => {
      const equalIndex = pair.indexOf("=");
      const rawKey = equalIndex >= 0 ? pair.slice(0, equalIndex) : pair;
      const rawValue = equalIndex >= 0 ? pair.slice(equalIndex + 1) : "";
      query.set(safeDecode(rawKey), safeDecode(rawValue));
    });
  const plan = query.get("plan") === "plus" || query.get("plan") === "pro" ? query.get("plan") : "";
  return `/pages/pro/index${plan ? `?plan=${encodeURIComponent(plan)}&from=webview` : "?from=webview"}`;
}

function inferWebPageTitle(path, fallback = "家长先疯") {
  const pathname = parsePath(path).pathname;
  if (pathname === XIAOWANZI_WEB_PATH) return "小玩子";
  if (pathname === "/search") return "搜索";
  if (pathname === "/welfare") return "百宝箱";
  if (pathname === "/planning") return "教育规划";
  if (pathname === "/pro") return "订阅计划";
  if (pathname.startsWith("/programs")) return pathname === "/programs" || pathname === "/programs/list" ? "节目" : "节目详情";
  if (pathname.startsWith("/reading") || pathname.startsWith("/books") || pathname.startsWith("/library")) {
    return pathname === "/reading" || pathname === "/books" || pathname === "/library" ? "及阅" : "图书详情";
  }
  if (pathname.startsWith("/materials")) return pathname === "/materials" ? "学习资料" : "资料详情";
  if (pathname.startsWith("/topics")) return pathname === "/topics" ? "请教一下" : "话题详情";
  if (pathname.startsWith("/experts")) return pathname === "/experts" ? "先疯智库" : "智库详情";
  if (pathname.startsWith("/worthbuy")) return pathname === "/worthbuy" ? "知物" : "知物详情";
  return fallback;
}

function clearXiaowanziEntryModeForContent(path) {
  const parsed = parsePath(path);
  if (isXiaowanziWebPath(parsed.pathname)) return;

  try {
    if (wx.removeStorageSync) {
      wx.removeStorageSync(XIAOWANZI_ENTRY_MODE_KEY);
      return;
    }
    wx.setStorageSync(XIAOWANZI_ENTRY_MODE_KEY, "");
  } catch (_error) {}
}

function webUrl(path, params) {
  const { origin, pathname, search, hash } = parsePath(path);
  const isXiaowanziPath = isXiaowanziWebPath(pathname);
  const callerParams = params || {};
  const preserveXiaowanziLayer = callerParams.preserveXiaowanziLayer === true
    || String(callerParams.preserveXiaowanziLayer || "") === "1";
  const query = new Map();

  search
    .split("&")
    .filter(Boolean)
    .forEach((pair) => {
      const equalIndex = pair.indexOf("=");
      const rawKey = equalIndex >= 0 ? pair.slice(0, equalIndex) : pair;
      const rawValue = equalIndex >= 0 ? pair.slice(equalIndex + 1) : "";
      query.set(safeDecode(rawKey), safeDecode(rawValue));
    });

  if (!preserveXiaowanziLayer) {
    XIAOWANZI_LAYER_QUERY_KEYS.forEach((key) => query.delete(key));
  }
  if (!isXiaowanziPath) {
    XIAOWANZI_ENTRY_QUERY_KEYS.forEach((key) => query.delete(key));
    query.set(XIAOWANZI_RESET_QUERY_KEY, "1");
  } else {
    query.delete(XIAOWANZI_RESET_QUERY_KEY);
  }

  Object.keys(callerParams).forEach((key) => {
    const value = callerParams[key];
    if (key === "preserveXiaowanziLayer") return;
    if (value === undefined || value === null || value === "") return;
    if (!preserveXiaowanziLayer && XIAOWANZI_LAYER_QUERY_KEYS.indexOf(key) >= 0) return;
    if (!isXiaowanziPath && key === "xf_xw" && String(value) !== "chat") return;
    if (!isXiaowanziPath && key === "xf_xw_ts") return;
    query.set(key, String(value));
  });

  const token = getToken();
  if (token) query.set("xf_token", token);
  query.set("xf_mp", "1");
  if (isProgramDetailWebPath(pathname)) query.set("xf_tab", "0");
  if (isTopicDetailWebPath(pathname)) query.set("xf_mpv", TOPIC_DETAIL_WEBVIEW_VERSION);
  if (isWelfareWebPath(pathname)) query.set("xf_wpv", WELFARE_WEBVIEW_VERSION);
  if (isProWebPath(pathname)) query.set("xf_pv", PRO_WEBVIEW_VERSION);

  const queryParts = [];
  query.forEach((value, key) => {
    queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });
  const queryString = queryParts.join("&");

  return `${origin}${pathname}${queryString ? `?${queryString}` : ""}${hash}`;
}

function openWeb(path, title, params) {
  clearXiaowanziEntryModeForContent(path);
  const parsed = parsePath(path);
  if (isXiaowanziWebPath(parsed.pathname)) {
    rememberCurrentExternalPage();
    try {
      wx.setStorageSync(XIAOWANZI_ENTRY_MODE_KEY, "home");
    } catch (_error) {}
    wx.switchTab({ url: "/pages/xiaowanzi/index" });
    return;
  }
  if (parsed.pathname === "/pro" || parsed.pathname === "/pro/success") {
    wx.navigateTo({ url: buildNativeProUrl(parsed.search) });
    return;
  }
  const webParams = {
    ...getNativeWebviewParams(),
    ...(params || {})
  };
  const resolvedTitle = String(title || inferWebPageTitle(path)).trim() || "家长先疯";
  wx.navigateTo({
    url: `/pages/webview/index?url=${encodeURIComponent(webUrl(path, webParams))}&title=${encodeURIComponent(resolvedTitle)}`
  });
}

module.exports = {
  TOPIC_DETAIL_WEBVIEW_VERSION,
  WELFARE_WEBVIEW_VERSION,
  PRO_WEBVIEW_VERSION,
  buildNativeProUrl,
  webUrl,
  openWeb,
  inferWebPageTitle
};
