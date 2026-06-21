const { API_ORIGIN } = require("./config");
const { getToken, clearSession } = require("./session");

function buildUrl(path) {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

function request(options) {
  const token = getToken();
  const url = buildUrl(options.url);
  const headers = Object.assign(
    {
      "content-type": "application/json"
    },
    options.header || {}
  );
  if (token) headers.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    wx.request({
      method: options.method || "GET",
      url,
      data: options.data || {},
      header: headers,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        if (res.statusCode === 401) clearSession();
        reject({
          statusCode: res.statusCode,
          data: res.data,
          message: (res.data && (res.data.error || res.data.message || res.data.detail)) || "请求失败"
        });
      },
      fail(error) {
        reject({ statusCode: 0, message: error.errMsg || "网络连接失败", url, error });
      }
    });
  });
}

module.exports = { request, buildUrl };
