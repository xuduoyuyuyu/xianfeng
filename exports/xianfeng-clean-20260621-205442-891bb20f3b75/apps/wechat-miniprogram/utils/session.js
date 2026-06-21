const TOKEN_KEY = "xf_token";
const USER_KEY = "xf_user";

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function getUser() {
  return wx.getStorageSync(USER_KEY) || null;
}

function setSession(payload) {
  if (payload && payload.token) wx.setStorageSync(TOKEN_KEY, payload.token);
  if (payload && payload.user) wx.setStorageSync(USER_KEY, payload.user);
}

function clearSession() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
}

module.exports = {
  getToken,
  getUser,
  setSession,
  clearSession
};
