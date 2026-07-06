const { enableShareMenu, createPageShare } = require("../../utils/share");
const { readFontSizeSetting } = require("../../utils/nativeSettings");
const { inferWebPageTitle } = require("../../utils/webview");
const { request } = require("../../utils/request");

const DEFAULT_TITLE = "家长先疯";
const DEFAULT_TARGET = "/pages/programs/index";

function decodeOption(value, fallback) {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return fallback;
  }
}

function isTabTarget(target) {
  return [
    "/pages/programs/index",
    "/pages/reading/index",
    "/pages/xiaowanzi/index",
    "/pages/materials/index",
    "/pages/topics/index"
  ].includes(target);
}

function getQueryParam(path, key) {
  const source = String(path || "");
  const queryStart = source.indexOf("?");
  if (queryStart < 0) return "";
  const hashStart = source.indexOf("#", queryStart);
  const query = source.slice(queryStart + 1, hashStart >= 0 ? hashStart : undefined);
  const pairs = query.split("&").filter(Boolean);
  for (const pair of pairs) {
    const equalIndex = pair.indexOf("=");
    const rawKey = equalIndex >= 0 ? pair.slice(0, equalIndex) : pair;
    if (decodeOption(rawKey, rawKey) !== key) continue;
    return decodeOption(equalIndex >= 0 ? pair.slice(equalIndex + 1) : "", "");
  }
  return "";
}

function parseSceneParam(scene, key) {
  const pairs = String(scene || "").split("&").filter(Boolean);
  for (const pair of pairs) {
    const equalIndex = pair.indexOf("=");
    const rawKey = equalIndex >= 0 ? pair.slice(0, equalIndex) : pair;
    if (decodeOption(rawKey, rawKey) !== key) continue;
    return decodeOption(equalIndex >= 0 ? pair.slice(equalIndex + 1) : "", "");
  }
  return "";
}

function buildTopicTargetFromScene(scene) {
  const topicId = parseSceneParam(scene, "t");
  if (!topicId) return "";
  return `/pages/webview/index?url=${encodeURIComponent(`/topics/${encodeURIComponent(topicId)}`)}&title=${encodeURIComponent("请教详情")}&topicId=${encodeURIComponent(topicId)}`;
}

function extractConversationShareIdFromScene(scene) {
  return parseSceneParam(scene, "s");
}

function normalizeConversationShare(payload) {
  const messages = Array.isArray(payload && payload.messages)
    ? payload.messages
        .map((message) => ({
          role: message && message.role === "user" ? "user" : "assistant",
          content: String(message && message.content || "").trim()
        }))
        .filter((message) => message.content)
    : [];
  return {
    id: String(payload && (payload.id || payload._id) || ""),
    title: String(payload && payload.title || "小玩子对话"),
    messages
  };
}

function inferNativePageTitle(target) {
  const pathname = String(target || "").split("?")[0];
  if (pathname === "/pages/programs/index") return "节目";
  if (pathname === "/pages/reading/index") return "及阅";
  if (pathname === "/pages/xiaowanzi/index") return "小玩子";
  if (pathname === "/pages/materials/index") return "学习资料";
  if (pathname === "/pages/topics/index") return "请教一下";
  if (pathname === "/pages/pro/index") return "订阅计划";
  if (pathname === "/pages/mine/archive/index") return "档案管理";
  return "";
}

function inferTargetTitle(target, fallback) {
  const explicit = String(fallback || "").trim();
  if (explicit && explicit !== DEFAULT_TITLE) return explicit;
  const source = String(target || "");
  const nativeTitle = inferNativePageTitle(source);
  if (nativeTitle) return nativeTitle;
  const nestedUrl = getQueryParam(source, "url");
  if (nestedUrl) return inferWebPageTitle(nestedUrl, explicit || DEFAULT_TITLE);
  return inferWebPageTitle(source, explicit || DEFAULT_TITLE);
}

function openTargetPath(target) {
  if (typeof wx === "undefined") return;
  if (isTabTarget(target)) {
    wx.switchTab({ url: target });
    return;
  }
  wx.reLaunch({ url: target });
}

Page({
  data: {
    title: DEFAULT_TITLE,
    target: DEFAULT_TARGET,
    conversationShare: null,
    shareLoading: false,
    shareError: "",
    fontSize: "standard",
    fontSizeClass: "xf-font-standard"
  },

  onLoad(options = {}) {
    enableShareMenu();
    this.setData(readFontSizeSetting());
    const scene = decodeOption(options.scene, "");
    const shareId = extractConversationShareIdFromScene(scene);
    if (shareId) {
      this.loadConversationShare(shareId);
      return;
    }
    const sceneTarget = buildTopicTargetFromScene(scene);
    const target = sceneTarget || decodeOption(options.target, DEFAULT_TARGET);
    const title = decodeOption(options.title, "");
    this.setData({
      title: inferTargetTitle(target, title),
      target
    });
    if (options.target || sceneTarget) openTargetPath(target);
  },

  onShow() {
    enableShareMenu();
    this.setData(readFontSizeSetting());
  },

  openTarget() {
    openTargetPath(this.data.target || DEFAULT_TARGET);
  },

  goPrograms() {
    wx.switchTab({ url: DEFAULT_TARGET });
  },

  loadConversationShare(shareId) {
    this.setData({ shareLoading: true, shareError: "" });
    request({ url: `/api/wechat-mini/xiaowanzi-shares/${encodeURIComponent(shareId)}` })
      .then((payload) => {
        const conversationShare = normalizeConversationShare(payload);
        if (!conversationShare.messages.length) throw new Error("分享内容为空");
        this.setData({
          title: conversationShare.title,
          conversationShare,
          shareLoading: false,
          target: "/pages/xiaowanzi/index"
        });
      })
      .catch((error) => {
        this.setData({
          shareLoading: false,
          shareError: error && error.message || "分享内容加载失败"
        });
      });
  },

  onShareAppMessage() {
    return createPageShare({
      title: this.data.title || DEFAULT_TITLE,
      path: this.data.target || DEFAULT_TARGET
    }).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare({
      title: this.data.title || DEFAULT_TITLE,
      path: this.data.target || DEFAULT_TARGET
    }).onShareTimeline();
  }
});
