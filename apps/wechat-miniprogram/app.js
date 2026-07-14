const { getToken, getUser, setSession, clearSession } = require("./utils/session");
const { request } = require("./utils/request");
const { preloadReadingLandingData } = require("./utils/readingPreload");
const { resetProfileOnboardingSession, syncProfileOnboardingRemote } = require("./utils/profileOnboarding");

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

  onShow() {
    resetProfileOnboardingSession();
  },

  setLoginSession(payload) {
    setSession(payload);
    this.globalData.token = getToken();
    this.globalData.user = getUser();
    syncProfileOnboardingRemote();
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
        syncProfileOnboardingRemote();
        return user;
      })
      .catch((error) => {
        if (error && error.statusCode === 401) this.clearLoginSession();
        throw error;
      });
  }
});
