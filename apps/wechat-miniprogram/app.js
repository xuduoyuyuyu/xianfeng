const { getToken, getUser, setSession, clearSession } = require("./utils/session");
const { request } = require("./utils/request");
const { preloadReadingLandingData } = require("./utils/readingPreload");

App({
  globalData: {
    token: "",
    user: null
  },

  onLaunch() {
    this.globalData.token = getToken();
    this.globalData.user = getUser();
    preloadReadingLandingData();
  },

  setLoginSession(payload) {
    setSession(payload);
    this.globalData.token = getToken();
    this.globalData.user = getUser();
  },

  clearLoginSession() {
    clearSession();
    this.globalData.token = "";
    this.globalData.user = null;
  },

  refreshMe() {
    if (!getToken()) return Promise.resolve(null);
    return request({ url: "/api/users/me" })
      .then((user) => {
        setSession({ token: getToken(), user });
        this.globalData.user = user;
        return user;
      })
      .catch((error) => {
        if (error && error.statusCode === 401) this.clearLoginSession();
        throw error;
      });
  }
});
