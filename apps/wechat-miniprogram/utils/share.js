const { DEFAULT_WEB_ORIGIN } = require("./config");

const DEFAULT_SHARE_TITLE = "家长先疯";
const DEFAULT_SHARE_PATH = "/pages/programs/index";
const DEFAULT_SHARE_IMAGE_URL = "/assets/share/timeline-logo.png";
const SHARE_PAGE_PATH = "/pages/share/index";
const SENSITIVE_WEB_PARAMS = ["xf_token"];

function ensurePagePath(path) {
  if (!path) return DEFAULT_SHARE_PATH;
  return path.startsWith("/") ? path : `/${path}`;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function parseQuery(search) {
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
  return query;
}

function stringifyQuery(query) {
  const parts = [];
  query.forEach((value, key) => {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });
  return parts.join("&");
}

function buildPagePath(path, params) {
  const safePath = ensurePagePath(path);
  const queryStart = safePath.indexOf("?");
  const basePath = queryStart >= 0 ? safePath.slice(0, queryStart) : safePath;
  const query = parseQuery(queryStart >= 0 ? safePath.slice(queryStart + 1) : "");

  Object.keys(params || {})
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .forEach((key) => query.set(key, String(params[key])));

  const queryString = stringifyQuery(query);
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function stripSensitiveWebParams(value) {
  const source = String(value || "/");
  const absoluteMatch = source.match(/^(https?:\/\/[^/]+)(.*)$/);
  const origin = absoluteMatch ? absoluteMatch[1] : DEFAULT_WEB_ORIGIN;
  const rawPath = absoluteMatch
    ? (absoluteMatch[2] || "/")
    : (source.startsWith("/") ? source : `/${source}`);
  const hashIndex = rawPath.indexOf("#");
  const pathAndSearch = hashIndex >= 0 ? rawPath.slice(0, hashIndex) : rawPath;
  const hash = hashIndex >= 0 ? rawPath.slice(hashIndex) : "";
  const queryStart = pathAndSearch.indexOf("?");
  const pathname = queryStart >= 0 ? pathAndSearch.slice(0, queryStart) : pathAndSearch;
  const query = parseQuery(queryStart >= 0 ? pathAndSearch.slice(queryStart + 1) : "");

  SENSITIVE_WEB_PARAMS.forEach((param) => query.delete(param));

  const queryString = stringifyQuery(query);
  return `${origin}${pathname}${queryString ? `?${queryString}` : ""}${hash}`;
}

function createPageShare(options) {
  const title = (options && options.title) || DEFAULT_SHARE_TITLE;
  const targetPath = buildPagePath(options && options.path, options && options.query);
  const imageUrl = options && options.imageUrl;
  const imagePayload = imageUrl ? { imageUrl } : {};

  return {
    onShareAppMessage() {
      return { title, path: targetPath, ...imagePayload };
    },
    onShareTimeline() {
      const queryStart = targetPath.indexOf("?");
      const query = queryStart >= 0 ? targetPath.slice(queryStart + 1) : "";
      return query ? { title, query, ...imagePayload } : { title, ...imagePayload };
    }
  };
}

function createWebviewShare(options) {
  const title = (options && options.title) || DEFAULT_SHARE_TITLE;
  const src = stripSensitiveWebParams(options && options.src);
  const targetPath = buildPagePath("/pages/webview/index", { url: src, title });
  const imageUrl = options && options.imageUrl;
  const imagePayload = imageUrl ? { imageUrl } : {};

  return {
    onShareAppMessage() {
      return { title, path: targetPath, ...imagePayload };
    },
    onShareTimeline() {
      const queryStart = targetPath.indexOf("?");
      const query = queryStart >= 0 ? targetPath.slice(queryStart + 1) : "";
      return {
        title,
        query,
        ...imagePayload
      };
    }
  };
}

function enableShareMenu() {
  if (typeof wx === "undefined" || typeof wx.showShareMenu !== "function") return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ["shareAppMessage", "shareTimeline"]
  });
}

module.exports = {
  createPageShare,
  createWebviewShare,
  SHARE_PAGE_PATH,
  DEFAULT_SHARE_IMAGE_URL,
  enableShareMenu,
  stripSensitiveWebParams
};
