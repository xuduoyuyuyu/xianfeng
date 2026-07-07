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

function conversationSharePath(shareId) {
  return `/pages/share/index?sid=${encodeURIComponent(shareId)}`;
}

function stripMarkdownInline(value) {
  return String(value || "")
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function parseMarkdownHeadingLine(line) {
  const source = String(line || "").trim();
  const hashMatch = source.match(/^(#{1,3})\s+(.+)$/);
  if (hashMatch) return { text: stripMarkdownInline(hashMatch[2]) };
  const boldMatch = source.match(/^\*\*\s*(.+?)\s*\*\*$/);
  if (boldMatch) return { text: stripMarkdownInline(boldMatch[1]) };
  return null;
}

function parseMarkdownListItem(line) {
  const match = String(line || "").trim().match(/^[-*]\s+(.+)$/);
  return match ? stripMarkdownInline(match[1]) : "";
}

function looksLikeMarkdownDocument(content) {
  const lines = String(content || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const headingCount = lines.filter((line) => parseMarkdownHeadingLine(line)).length;
  const listCount = lines.filter((line) => parseMarkdownListItem(line)).length;
  return headingCount > 0 || listCount >= 2;
}

function buildMarkdownDocumentContentParts(content) {
  const parts = [];
  const paragraphLines = [];
  const pushParagraph = () => {
    const text = paragraphLines.map(stripMarkdownInline).filter(Boolean).join("\n");
    if (text) parts.push({ type: "md_paragraph", text });
    paragraphLines.length = 0;
  };

  String(content || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      pushParagraph();
      return;
    }
    const heading = parseMarkdownHeadingLine(trimmed);
    if (heading && heading.text) {
      pushParagraph();
      parts.push({ type: "md_heading", text: heading.text });
      return;
    }
    const listText = parseMarkdownListItem(trimmed);
    if (listText) {
      pushParagraph();
      parts.push({ type: "md_list_item", text: listText });
      return;
    }
    paragraphLines.push(trimmed);
  });

  pushParagraph();
  return parts;
}

function buildInlineMessageContentParts(content) {
  const source = String(content || "");
  const parts = [];
  const markdownLinkPattern = /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)/g;
  let lastIndex = 0;
  let match;
  while ((match = markdownLinkPattern.exec(source))) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: source.slice(lastIndex, match.index).replace(/\s+$/g, "") });
    }
    parts.push({
      type: "link",
      text: String(match[1] || "").trim(),
      url: String(match[2] || "").trim()
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    parts.push({ type: "text", text: source.slice(lastIndex).replace(/^\s+/g, "") });
  }
  return parts;
}

function buildMessageContentParts(content) {
  const source = String(content || "");
  const parts = looksLikeMarkdownDocument(source)
    ? buildMarkdownDocumentContentParts(source)
    : buildInlineMessageContentParts(source);
  return parts
    .map((part, index) => ({
      key: `${part.type || "text"}-${index}`,
      type: part.type === "link" && part.text && part.url ? "link" : part.type || "text",
      text: String(part.text || ""),
      url: part.type === "link" ? String(part.url || "") : ""
    }))
    .filter((part) => part.text);
}

function extractShareReferences(content) {
  const references = [];
  const seen = new Set();
  String(content || "").replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)/g, (_match, label, url) => {
    const title = String(label || "").trim();
    const target = String(url || "").trim();
    if (title && target && !seen.has(title)) {
      seen.add(title);
      references.push({ title, url: target });
    }
    return "";
  });
  return references.slice(0, 4).map((item, index) => ({ ...item, key: `ref-${index}` }));
}

function normalizeConversationShareMessage(message, index) {
  const role = message && message.role === "user" ? "user" : "assistant";
  const content = String(message && message.content || "").trim();
  return content
    ? {
        key: `message-${index}`,
        role,
        content,
        contentParts: buildMessageContentParts(content),
        references: role === "assistant" ? extractShareReferences(content) : []
      }
    : null;
}

function normalizeConversationShare(payload) {
  const messages = Array.isArray(payload && payload.messages)
    ? payload.messages
        .map(normalizeConversationShareMessage)
        .filter(Boolean)
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
    const directShareId = decodeOption(options.sid || options.shareId, "");
    const shareId = directShareId || extractConversationShareIdFromScene(scene);
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
    if (this.data.conversationShare && this.data.conversationShare.id) {
      return createPageShare({
        title: this.data.title || DEFAULT_TITLE,
        path: conversationSharePath(this.data.conversationShare.id)
      }).onShareAppMessage();
    }
    return createPageShare({
      title: this.data.title || DEFAULT_TITLE,
      path: this.data.target || DEFAULT_TARGET
    }).onShareAppMessage();
  },

  onShareTimeline() {
    if (this.data.conversationShare && this.data.conversationShare.id) {
      return createPageShare({
        title: this.data.title || DEFAULT_TITLE,
        path: conversationSharePath(this.data.conversationShare.id)
      }).onShareTimeline();
    }
    return createPageShare({
      title: this.data.title || DEFAULT_TITLE,
      path: this.data.target || DEFAULT_TARGET
    }).onShareTimeline();
  }
});
