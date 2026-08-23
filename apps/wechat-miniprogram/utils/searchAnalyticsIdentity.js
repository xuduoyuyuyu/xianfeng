const { request } = require("./request");
const { getToken, getUser } = require("./session");

const SEARCH_ANALYTICS_SESSION_KEY = "xf_search_analytics_session_v1";
const SEARCH_IDENTITY_DECISION_KEY = "xf_search_identity_decision_v1";
const SEARCH_IDENTITY_NOTICE_VERSION = "2026-08-23-v1";

let pendingConsent = null;

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function currentUserId() {
  const user = getUser() || {};
  return String(user._id || user.id || "").trim();
}

function getSearchAnalyticsSessionId() {
  try {
    const existing = String(wx.getStorageSync(SEARCH_ANALYTICS_SESSION_KEY) || "").trim();
    if (existing) return existing;
    const next = createId("session");
    wx.setStorageSync(SEARCH_ANALYTICS_SESSION_KEY, next);
    return next;
  } catch (_error) {
    return createId("session");
  }
}

function rotateSearchAnalyticsSessionId() {
  const next = createId("session");
  try {
    wx.setStorageSync(SEARCH_ANALYTICS_SESSION_KEY, next);
  } catch (_error) {}
  return next;
}

function readDecision() {
  try {
    return String(wx.getStorageSync(SEARCH_IDENTITY_DECISION_KEY) || "");
  } catch (_error) {
    return "";
  }
}

function writeDecision(decision) {
  try {
    wx.setStorageSync(SEARCH_IDENTITY_DECISION_KEY, decision);
  } catch (_error) {}
}

function decisionForCurrentUser() {
  const userId = currentUserId();
  const value = readDecision();
  if (!userId || !value.endsWith(`:${userId}`)) return "";
  return value.startsWith("accepted:") ? "accepted" : value.startsWith("declined:") ? "declined" : "";
}

function persistConsent() {
  const userId = currentUserId();
  if (!getToken() || !userId) return Promise.resolve(false);
  return request({
    url: "/api/search/identity-consent",
    method: "POST",
    data: {
      sessionId: getSearchAnalyticsSessionId(),
      accepted: true,
      noticeVersion: SEARCH_IDENTITY_NOTICE_VERSION
    }
  }).then(() => {
    writeDecision(`accepted:${userId}`);
    return true;
  }).catch(() => false);
}

function requestSearchIdentityConsent(options = {}) {
  if (!getToken() || !currentUserId()) return Promise.resolve(false);
  const decision = decisionForCurrentUser();
  if (decision === "accepted") return persistConsent();
  if (!options.prompt || (decision === "declined" && !options.force)) return Promise.resolve(false);
  if (pendingConsent) return pendingConsent;

  pendingConsent = new Promise((resolve) => {
    wx.showModal({
      title: "关联搜索记录",
      content: "同意后，本设备近 180 天及后续搜索关键词、结果点击会与当前账号关联，用于搜索洞察和行为分析；手机号、邮箱和长数字仍会隐藏。可在设置中撤回，拒绝不影响搜索。",
      confirmText: "同意关联",
      cancelText: "暂不关联",
      success(result) {
        if (!result || !result.confirm) {
          writeDecision(`declined:${currentUserId()}`);
          resolve(false);
          return;
        }
        persistConsent().then(resolve);
      },
      fail() {
        resolve(false);
      }
    });
  }).finally(() => {
    pendingConsent = null;
  });
  return pendingConsent;
}

function revokeSearchIdentityConsent() {
  if (!getToken()) return Promise.resolve(false);
  const sessionId = getSearchAnalyticsSessionId();
  return request({
    url: "/api/search/identity-consent",
    method: "DELETE",
    data: { sessionId }
  }).then(() => {
    writeDecision("");
    rotateSearchAnalyticsSessionId();
    return true;
  });
}

module.exports = {
  SEARCH_IDENTITY_NOTICE_VERSION,
  decisionForCurrentUser,
  getSearchAnalyticsSessionId,
  requestSearchIdentityConsent,
  revokeSearchIdentityConsent,
  rotateSearchAnalyticsSessionId
};
