const { WEB_ORIGIN } = require("./config");
const { getToken } = require("./session");

function webUrl(path, params) {
  const safePath = path && path.startsWith("/") ? path : `/${path || ""}`;
  const query = Object.assign({}, params || {});
  const token = getToken();
  if (token) query.xf_token = token;
  query.xf_mp = "1";
  const qs = Object.keys(query)
    .filter((key) => query[key] !== undefined && query[key] !== null && query[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
    .join("&");
  return `${WEB_ORIGIN}${safePath}${qs ? `?${qs}` : ""}`;
}

function openWeb(path, title, params) {
  wx.navigateTo({
    url: `/pages/webview/index?url=${encodeURIComponent(webUrl(path, params))}&title=${encodeURIComponent(title || "家长先疯")}`
  });
}

module.exports = {
  webUrl,
  openWeb
};
