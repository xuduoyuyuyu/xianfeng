const { getToken, getUser, setSession, clearSession } = require("./utils/session");
const { request } = require("./utils/request");
const { preloadReadingLandingData } = require("./utils/readingPreload");
const { resetProfileOnboardingSession, restoreProfileOnboardingRemote } = require("./utils/profileOnboarding");
const { API_ORIGIN } = require("./utils/config");
const { requestSearchIdentityConsent, rotateSearchAnalyticsSessionId } = require("./utils/searchAnalyticsIdentity");

function isLocalDevtoolsApi() {
  return /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(String(API_ORIGIN || ""));
}

App({
  globalData: {
    token: "",
    user: null
  },

  onLaunch() {
    this.globalData.token = getToken();
    this.globalData.user = getUser();
    preloadReadingLandingData();
    if (isLocalDevtoolsApi()) {
      request({ method: "POST", url: "/api/wechat-mini/dev-session" })
        .then((payload) => this.setLoginSession(payload))
        .catch(() => {});
    } else if (this.globalData.token) {
      restoreProfileOnboardingRemote({ migrateLegacyLocal: true });
      requestSearchIdentityConsent({ prompt: false });
    }
  },

  onShow() {
    resetProfileOnboardingSession();
  },

  setLoginSession(payload) {
    setSession(payload);
    this.globalData.token = getToken();
    this.globalData.user = getUser();
    const restore = restoreProfileOnboardingRemote();
    Promise.resolve(restore).then(() => requestSearchIdentityConsent({ prompt: true }));
    return restore;
  },

  clearLoginSession() {
    clearSession();
    this.globalData.token = "";
    this.globalData.user = null;
    rotateSearchAnalyticsSessionId();
  },

  refreshMe() {
    if (!getToken()) return Promise.resolve(null);
    return request({ url: "/api/users/me" })
      .then((user) => {
        setSession({ token: getToken(), user });
        this.globalData.user = user;
        return restoreProfileOnboardingRemote().then(() => user);
      })
      .catch((error) => {
        if (error && error.statusCode === 401) this.clearLoginSession();
        throw error;
      });
  }
});
