const DEFAULT_WEB_ORIGIN = "https://xianfeng.xinzhi.info";
const DEFAULT_DEVTOOLS_API_ORIGIN = "http://127.0.0.1:3101";

function normalizeOrigin(value, fallback) {
  const origin = String(value || fallback || "").trim().replace(/\/+$/, "");
  return origin || DEFAULT_WEB_ORIGIN;
}

function isDevtoolsRuntime() {
  try {
    if (typeof wx === "undefined") return false;
    const deviceInfo = typeof wx.getDeviceInfo === "function"
      ? wx.getDeviceInfo()
      : (typeof wx.getSystemInfoSync === "function" ? wx.getSystemInfoSync() : {});
    const platform = String(deviceInfo.platform || "").toLowerCase();
    const accountInfo = typeof wx.getAccountInfoSync === "function" ? wx.getAccountInfoSync() : null;
    const envVersion = String(accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion || "");
    return (platform === "devtools" || platform === "mac") && (!envVersion || envVersion === "develop");
  } catch (_error) {
    return false;
  }
}

function isLoopbackOrigin(origin) {
  try {
    const hostname = String(origin || "").split("://").pop().split("/")[0].split(":")[0].toLowerCase();
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0";
  } catch (_error) {
    return false;
  }
}

function resolveRuntimeOrigin(value, fallback) {
  const origin = normalizeOrigin(value, fallback);
  if (isLoopbackOrigin(origin) && !isDevtoolsRuntime()) return DEFAULT_WEB_ORIGIN;
  return origin;
}

function loadLocalConfig() {
  try {
    return require("./config.local");
  } catch (_error) {
    return {};
  }
}

const localConfig = loadLocalConfig();
const WEB_ORIGIN = resolveRuntimeOrigin(localConfig.WEB_ORIGIN, DEFAULT_WEB_ORIGIN);
const API_ORIGIN = isDevtoolsRuntime()
  ? normalizeOrigin(localConfig.API_ORIGIN, DEFAULT_DEVTOOLS_API_ORIGIN)
  : resolveRuntimeOrigin(localConfig.API_ORIGIN, WEB_ORIGIN);

module.exports = {
  DEFAULT_WEB_ORIGIN,
  WEB_ORIGIN,
  API_ORIGIN,
  resolveRuntimeOrigin,
  WEB_ROUTES: {
    home: "/",
    programs: "/programs/list",
    xiaowanzi: "/index-xiaowanzi.html",
    pro: "/pro",
    mine: "/profile",
    search: "/search",
    materials: "/materials",
    books: "/reading",
    reading: "/reading",
    topics: "/topics",
    experts: "/experts",
    planning: "/planning",
    worthbuy: "/worthbuy",
    profile: "/profile"
  }
};
