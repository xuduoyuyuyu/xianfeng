const { request, buildUrl } = require("../../utils/request");
const { getToken, getUser, clearSession } = require("../../utils/session");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { setSelectedTab } = require("../../utils/tabbar");
const { CHILD_PROFILES_KEY, WEB_CHILD_PROFILES_KEY, mergeChildProfileRecords, parseStoredValue } = require("../../utils/profileState");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createNativeSettingsMethods, setSettingsTabbarHidden } = require("../../utils/nativeSettings");
const { openWeb } = require("../../utils/webview");
const { returnFromXiaowanzi } = require("../../utils/xiaowanziReturn");
const { openNativeSearch } = require("../../utils/nativePageNav");

const BOT_ID = "xiaowanzi_debug_bot";
const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const CHAT_CONTEXT_KEY = "xiaowanzi_chat_context_v1";
const MEMORY_ENABLED_KEY = "xf_child_memory_enabled";
const NATIVE_HISTORY_CACHE_PREFIX = "xiaowanzi_native_history_v1:";
const NATIVE_SESSION_INDEX_KEY = "xiaowanzi_native_session_index_v1";
const NATIVE_ACTIVE_SESSION_KEY = "xiaowanzi_native_active_session_id_v1";
const NATIVE_SESSION_MESSAGES_PREFIX = "xiaowanzi_native_session_messages_v1:";
const NATIVE_SHELL_BODY_HEIGHT = 0;
const XIAOWANZI_ENTRY_MODE_KEY = "xf_xiaowanzi_entry_mode";
const LEGACY_AVATAR_INDEX_KEY = "wel_avatar_index";
const LEGACY_AVATAR_CLICK_COUNT_KEY = "wel_avatar_click_count";
const XIAOWANZI_AVATAR_IMAGE = "/assets/wel-avatar/no-hat.png";
const XIAOWANZI_SHARE_COVER_IMAGE = "/assets/share/xiaowanzi-nohat-cover.png";
const XIAOWANZI_TOPBAR_AVATARS = [
  XIAOWANZI_AVATAR_IMAGE,
  "/assets/wel-avatar/img-0640.png",
  "/assets/wel-avatar/wizard.png",
  "/assets/wel-avatar/avatar-1.png",
  "/assets/wel-avatar/avatar-2.png"
];
const AVATAR_SWITCH_CLICKS = 5;
const nativeSettingsMethods = createNativeSettingsMethods();

const DEFAULT_ASSISTANT_MESSAGE = {
  id: "assistant-default",
  role: "assistant",
  content: "你好，我是小玩子。你可以直接把正在纠结的问题告诉我，关联孩子档案后回答会更个性化。",
  contentParts: buildMessageContentParts("你好，我是小玩子。你可以直接把正在纠结的问题告诉我，关联孩子档案后回答会更个性化。"),
  shareable: false,
  ts: new Date(0).toISOString()
};

const HOME_PROMPT_CACHE_KEY = "xiaowanzi_topic_prompt_cache_v2";
const HOME_PROMPT_BLOCKED_TERMS = ["节目", "这期", "本期", "先听", "哪一段", "收听"];
const HOME_PROMPT_COMPACT_LENGTH = 14;
const HOME_PROMPT_PREVIEW = "";
const QUICK_PROMPTS = [
  { label: "孩子玩电脑游戏的引导与游戏选择？", prompt: "孩子玩电脑游戏的引导与游戏选择？" },
  { label: "窝沟封闭黄金年龄？", prompt: "窝沟封闭黄金年龄？" },
  { label: "双语民办幼儿园回家还要加餐么？", prompt: "双语民办幼儿园回家还要加餐么？" }
];

const SHARE_OPTIONS = {
  title: "小玩子",
  path: "/pages/xiaowanzi/index"
};
const WECHAT_SHARE_TITLE_LIMIT = 28;
const SHARE_CANVAS_ID = "xiaowanziShareCanvas";
const SHARE_CANVAS_WIDTH = 750;
const SHARE_CANVAS_MIN_HEIGHT = 1200;
const SHARE_CANVAS_CONTENT_LEFT = 28;
const SHARE_CARD_LOGO_IMAGE = "/assets/xiaowanzi-icons/share-logo.png";
const SHARE_CARD_QR_FILE_PREFIX = "xiaowanzi-conversation-qrcode-transparent-v2";
const SHARE_CARD_QR_CACHE_VERSION = "transparent-v2";
const shareQrImageCache = {};
const SHARE_REVEAL_HIDE_DELAY_MS = 5000;
const KNOWLEDGE_PILL_COLLAPSE_SCROLL_TOP = 24;
const NATIVE_REPLY_REVEAL_INITIAL_CHARS = 5;
const NATIVE_REPLY_REVEAL_STEP_CHARS = 2;
const NATIVE_REPLY_REVEAL_DELAY_MS = 45;
const NATIVE_REPLY_REVEAL_PAUSE_MS = 180;
const XIAOWANZI_THINKING_STEP_INTERVAL_MS = 1500;
const SHARE_CANVAS_CHAT_STYLE = {
  pageTopColor: "#f2f1ff",
  pageBottomColor: "#e9edff",
  pageTextColor: "#101433",
  contentLeft: SHARE_CANVAS_CONTENT_LEFT,
  messageTop: 292,
  messageGap: 26,
  topbar: {
    logoX: 265,
    logoY: 138,
    logoWidth: 220,
    logoHeight: 71
  },
  user: {
    maxWidth: 584,
    padX: 30,
    padTop: 22,
    padBottom: 26,
    radius: 34,
    fontSize: 28,
    lineHeight: 49,
    textColor: "#ffffff",
    gradientStart: "#5368ff",
    gradientMiddle: "#6847ff",
    gradientEnd: "#601bec"
  },
  assistant: {
    padX: 30,
    padTop: 30,
    padBottom: 32,
    radius: 32,
    fontSize: 28,
    lineHeight: 51,
    background: "#ffffff",
    textColor: "#11143b"
  },
  linkColor: "#6d28f2",
  reference: {
    fontSize: 24,
    lineHeight: 34,
    gap: 16
  },
  siteCard: {
    minHeight: 88,
    paddingX: 22,
    paddingY: 20,
    radius: 30,
    borderColor: "rgba(126, 95, 255, 0.22)",
    backgroundStart: "rgba(255, 255, 255, 0.82)",
    backgroundEnd: "rgba(247, 243, 255, 0.98)",
    textColor: "#2a2350",
    arrowColor: "#6a42e8",
    arrowFontSize: 34,
    arrowGap: 18,
    lineHeight: 38,
    maxLines: 2,
    marginY: 3
  },
  qrTextColor: "#475569"
};

const AI_RESPONSE_RULES = [
  "你是小玩子，一个可爱活泼的助手，风格软萌、热情、会撒娇。",
  "优先使用站内相关内容、孩子档案、孩子记忆和当前上下文回答；当前页面只是线索，不是唯一资料来源。",
  "当站内相关内容不足时，可以使用通用育儿、学习和沟通知识给出可执行建议，但要说明这是通用建议。",
  "孩子姓名只表示被咨询的孩子，不代表提问者；如果个人资料提供家长姓名，可以用该姓名称呼家长。",
  "回复开头按孩子档案里的“称呼用户”字段称呼用户，禁止用孩子姓名称呼家长。",
  "孩子档案里的关系只表示孩子称谓，不代表提问者是爸爸或妈妈。除非个人资料明确提供家长身份，否则统一称呼用户为家长。",
  "孩子档案如提供准确年龄，必须以该年龄为准，不要根据出生年份自行猜测。",
  "优先给出确定内容、已确认事实、可执行下一步。"
].join("\n");

function normalizeChildProfileForWeb(item, index) {
  const source = item || {};
  const displayName = String(source.displayName || source.name || source.title || "").trim();
  const id = String(source.id || (displayName ? `child-${index}` : "")).trim();
  if (!id || !displayName || source.draft) return null;
  return {
    id,
    relation: String(source.relation || "").trim(),
    displayName,
    gender: source.gender === "男" ? "男" : source.relation === "儿子" ? "男" : "女",
    birthDate: String(source.birthDate || "").trim(),
    city: String(source.city || "").trim(),
    region: String(source.region || "").trim(),
    grade: String(source.grade || "").trim(),
    concernTags: Array.isArray(source.concernTags) ? source.concernTags.map((value) => String(value || "").trim()).filter(Boolean) : [],
    avatar: String(source.avatar || "").trim(),
    createdAt: String(source.createdAt || new Date().toISOString()),
    draft: false
  };
}

function loadChildProfilesForNativeChat() {
  const source = mergeChildProfileRecords(
    wx.getStorageSync(CHILD_PROFILES_KEY),
    wx.getStorageSync(WEB_CHILD_PROFILES_KEY)
  );
  return source.map(normalizeChildProfileForWeb).filter(Boolean);
}

function activeChildProfile() {
  const childProfiles = loadChildProfilesForNativeChat();
  const savedChildId = String(wx.getStorageSync(LAST_CHILD_ID_KEY) || "").trim();
  return childProfiles.find((item) => item.id === savedChildId) || childProfiles[0] || null;
}

function buildChildPickerCards(activeId) {
  const selectedId = String(activeId || wx.getStorageSync(LAST_CHILD_ID_KEY) || "").trim();
  return loadChildProfilesForNativeChat()
    .slice()
    .sort((left, right) => {
      if (left.id === selectedId) return -1;
      if (right.id === selectedId) return 1;
      return 0;
    })
    .map((item) => {
      const displayName = String(item.displayName || "孩子").trim() || "孩子";
      const relation = String(item.relation || "孩子").trim() || "孩子";
      const grade = String(item.grade || "").trim();
      return {
        id: item.id,
        displayName,
        relation,
        grade,
        tag: [relation, grade].filter(Boolean).join(" · "),
        initial: displayName.slice(0, 1) || "孩",
        selected: item.id === selectedId
      };
    });
}

function normalizeHomePromptItem(rawPrompt) {
  const raw = String(rawPrompt || "")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;
  if (HOME_PROMPT_BLOCKED_TERMS.some((term) => raw.indexOf(term) >= 0)) return null;
  const clean = raw.replace(/^围绕「(.+?)」[,，]?/g, "$1").trim();
  const prompt = /[?？]$/.test(clean) ? clean : `${clean}？`;
  if (HOME_PROMPT_BLOCKED_TERMS.some((term) => prompt.indexOf(term) >= 0)) return null;
  return {
    label: prompt.length > 34 ? `${prompt.slice(0, 34)}...` : prompt,
    prompt,
    compact: prompt.length > HOME_PROMPT_COMPACT_LENGTH
  };
}

function topicPromptFromItem(item) {
  const source = item || {};
  const title = String(source.title || source.question || source.name || "").trim();
  const subtitle = String(source.subtitle || source.shortSummary || source.summary || "").trim();
  return normalizeHomePromptItem(title || subtitle);
}

function loadCachedHomePrompts() {
  try {
    const parsed = JSON.parse(wx.getStorageSync(HOME_PROMPT_CACHE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeHomePromptItem(String((item && (item.prompt || item.label)) || "")))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function saveCachedHomePrompts(items) {
  try {
    const sanitized = (items || [])
      .map((item) => normalizeHomePromptItem(item && (item.prompt || item.label)))
      .filter(Boolean);
    if (sanitized.length) wx.setStorageSync(HOME_PROMPT_CACHE_KEY, sanitized.slice(0, 40));
  } catch (_error) {}
}

function buildHomePromptState(items) {
  const deduped = [];
  const seen = {};
  (items || []).concat(QUICK_PROMPTS).forEach((item) => {
    const normalized = normalizeHomePromptItem(item && (item.prompt || item.label));
    if (!normalized || seen[normalized.prompt]) return;
    seen[normalized.prompt] = true;
    deduped.push(normalized);
  });
  return {
    quickPrompts: deduped.slice(0, 3)
  };
}

function buildHomeConversationMessages(messages) {
  const source = Array.isArray(messages) ? messages : [];
  const firstUserIndex = source.findIndex((message) => message && message.role === "user");
  return firstUserIndex >= 0 ? source.slice(firstUserIndex).map(withMessageShareability) : [];
}

function isReadReceiptMessage(content) {
  const text = String(content || "").trim();
  return (
    text.includes("我已读取") ||
    text.includes("已读取当前") ||
    /^已读取《[^》]+》/.test(text)
  );
}

function isFailedAssistantMessage(content) {
  const text = String(content || "").trim();
  if (!text) return false;
  if (/^请求失败(?:[:：]|$)/.test(text)) return true;
  return (
    ["校验 Pro 权限失败", "Pro 权限校验失败", "校验权限失败", "权限校验失败", "登录态已过期", "无效的登录凭证"].includes(text) ||
    /^(校验|验证|检查).{0,16}(失败|出错)$/.test(text) ||
    /^.*(权限|登录凭证|登录态).{0,12}(失败|无效|过期)$/.test(text)
  );
}

function isShareableAssistantMessageValue(role, content, pending, error) {
  if (role !== "assistant" || pending || error) return false;
  const text = String(content || "").trim();
  if (!text || text === "__THINKING__") return false;
  if (isReadReceiptMessage(text)) return false;
  if (isFailedAssistantMessage(text)) return false;
  return true;
}

function withMessageShareability(message) {
  if (!message) return message;
  return {
    ...message,
    shareable: message.revealPending ? false : isShareableAssistantMessageValue(message.role, message.content, message.pending, message.error)
  };
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
  if (hashMatch) {
    return {
      level: Math.min(hashMatch[1].length, 3),
      text: stripMarkdownInline(hashMatch[2])
    };
  }
  const boldMatch = source.match(/^\*\*\s*(.+?)\s*\*\*$/);
  if (boldMatch) {
    return {
      level: 2,
      text: stripMarkdownInline(boldMatch[1])
    };
  }
  const emojiBoldMatch = source.match(/^(.{1,6})\*\*\s*(.+?)\s*\*\*$/);
  if (emojiBoldMatch) {
    const prefix = emojiBoldMatch[1].trim();
    const hasEmojiPrefix = Array.from(prefix).some((char) => char.codePointAt(0) > 0xffff);
    if (hasEmojiPrefix) {
      return {
        level: 2,
        text: `${prefix}${stripMarkdownInline(emojiBoldMatch[2])}`
      };
    }
  }
  return null;
}

function parseMarkdownListItem(line) {
  const match = parseMarkdownListItemSource(line);
  return match ? stripMarkdownInline(match[1]) : "";
}

function parseMarkdownListItemSource(line) {
  return String(line || "").trim().match(/^[-*]\s+(.+)$/);
}

function looksLikeMarkdownDocument(content) {
  const source = String(content || "");
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const headingCount = lines.filter((line) => parseMarkdownHeadingLine(line)).length;
  const listCount = lines.filter((line) => parseMarkdownListItem(line)).length;
  return headingCount > 0 || listCount >= 2;
}

function buildMarkdownDocumentContentParts(content) {
  const parts = [];
  const paragraphLines = [];

  const pushParagraph = () => {
    const rawText = paragraphLines.join("\n").trim();
    if (rawText) {
      const inlineParts = buildInlineMessageContentParts(rawText);
      const hasLink = inlineParts.some((part) => part.type === "link");
      if (hasLink) {
        inlineParts.forEach((part) => {
          if (part.type === "link") {
            parts.push(part);
            return;
          }
          const text = stripMarkdownInline(part.text);
          if (text) parts.push({ type: "md_paragraph", text });
        });
      } else {
        const text = paragraphLines.map(stripMarkdownInline).filter(Boolean).join("\n");
        if (text) parts.push({ type: "md_paragraph", text });
      }
    }
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
      parts.push({
        type: "md_heading",
        level: heading.level,
        text: heading.text
      });
      return;
    }

    const listMatch = parseMarkdownListItemSource(trimmed);
    if (listMatch) {
      pushParagraph();
      const standaloneLink = parseStandaloneMarkdownLink(listMatch[1]);
      if (standaloneLink) {
        parts.push(standaloneLink);
        return;
      }
      const inlineParts = buildInlineMessageContentParts(listMatch[1]);
      const hasLink = inlineParts.some((part) => part.type === "link");
      if (hasLink) {
        inlineParts.forEach((part) => {
          const text = stripMarkdownInline(part.text);
          if (!text) return;
          parts.push(part.type === "link" ? part : { type: "md_list_item", text });
        });
      } else {
        const text = stripMarkdownInline(listMatch[1]);
        if (text) parts.push({ type: "md_list_item", text });
      }
      return;
    }

    paragraphLines.push(trimmed);
  });

  pushParagraph();

  return parts
    .map((part, index) => ({
      key: `${part.type || "text"}-${index}`,
      type: part.type === "link" ? "link" : part.type || "md_paragraph",
      level: part.level || 0,
      text: String(part.text || ""),
      url: part.type === "link" ? String(part.url || "") : ""
    }))
    .filter((part) => part.text);
}

function buildInlineMessageContentParts(content) {
  const source = String(content || "");
  const parts = [];
  const markdownLinkPattern = /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)/g;
  let lastIndex = 0;
  let match;
  while ((match = markdownLinkPattern.exec(source))) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        text: source.slice(lastIndex, match.index).replace(/\s+$/g, "")
      });
    }
    parts.push({
      type: "link",
      text: String(match[1] || "").trim(),
      url: String(match[2] || "").trim()
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    parts.push({
      type: "text",
      text: source.slice(lastIndex).replace(/^\s+/g, "")
    });
  }
  return parts
    .map((part, index) => ({
      key: `${part.type || "text"}-${index}`,
      type: part.type === "link" && part.text && part.url ? "link" : "text",
      text: String(part.text || ""),
      url: part.type === "link" ? String(part.url || "") : ""
    }))
    .filter((part) => part.text);
}

function buildMessageContentParts(content) {
  const source = String(content || "");
  if (looksLikeMarkdownDocument(source)) {
    return buildMarkdownDocumentContentParts(source);
  }
  return buildInlineMessageContentParts(source);
}

function parseXiaowanziContentLink(url) {
  const value = String(url || "").trim();
  if (!value) return null;
  const absoluteMatch = value.match(/^https?:\/\/([^/?#]+)([^#]*)/i);
  if (absoluteMatch) {
    const host = String(absoluteMatch[1] || "").toLowerCase();
    if (!/(\.|^)xianfeng\.xinzhi\.info$/.test(host)) return null;
    return parseXiaowanziContentLink(absoluteMatch[2] || "/");
  }
  const clean = value.split("#")[0] || "";
  const queryIndex = clean.indexOf("?");
  const pathname = (queryIndex >= 0 ? clean.slice(0, queryIndex) : clean).replace(/\/+$/g, "") || "/";
  const query = queryIndex >= 0 ? clean.slice(queryIndex + 1) : "";
  return { pathname, query };
}

function hasXiaowanziContentQueryParam(query, key) {
  return String(query || "")
    .split("&")
    .some((part) => {
      const rawKey = String(part || "").split("=")[0] || "";
      try {
        return decodeURIComponent(rawKey) === key;
      } catch (_error) {
        return rawKey === key;
      }
    });
}

function getXiaowanziContentQueryParam(query, key) {
  const parts = String(query || "").split("&");
  for (const part of parts) {
    const [rawKey, ...rawValueParts] = String(part || "").split("=");
    let decodedKey = rawKey;
    try {
      decodedKey = decodeURIComponent(rawKey);
    } catch (_error) {}
    if (decodedKey !== key) continue;
    const rawValue = rawValueParts.join("=");
    try {
      return decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch (_error) {
      return rawValue.replace(/\+/g, " ");
    }
  }
  return "";
}

function decodeXiaowanziPathSegment(value) {
  const source = String(value || "").trim();
  try {
    return decodeURIComponent(source);
  } catch (_error) {
    return source;
  }
}

function buildXiaowanziNativeWebviewRoute(pathname, title) {
  const safePath = String(pathname || "").trim();
  if (!safePath) return "";
  return `/pages/webview/index?url=${encodeURIComponent(safePath)}&title=${encodeURIComponent(title || "家长先疯")}`;
}

function getXiaowanziNativeDetailRoute(url, title) {
  const parsed = parseXiaowanziContentLink(url);
  if (!parsed) return "";
  const pathname = String(parsed.pathname || "").trim();
  const query = String(parsed.query || "");
  const resolvedTitle = String(title || "").trim() || "家长先疯";
  const topicMatch = pathname.match(/^\/topics\/([^/?#]+)$/);
  if (topicMatch) {
    const slug = decodeXiaowanziPathSegment(topicMatch[1]);
    if (!slug) return "";
    return `/pages/webview/index?nativeTopic=1&topicSlug=${encodeURIComponent(slug)}&title=${encodeURIComponent(resolvedTitle)}`;
  }
  const programMatch = pathname.match(/^\/programs\/([^/?#]+)$/);
  if (programMatch) {
    const id = decodeXiaowanziPathSegment(programMatch[1]);
    return id ? buildXiaowanziNativeWebviewRoute(`/programs/${encodeURIComponent(id)}`, resolvedTitle) : "";
  }
  const readingMatch = pathname.match(/^\/reading\/([^/?#]+)$/);
  if (readingMatch && !hasXiaowanziContentQueryParam(query, "xf_external_book_id")) {
    const id = decodeXiaowanziPathSegment(readingMatch[1]);
    return id ? buildXiaowanziNativeWebviewRoute(`/reading/${encodeURIComponent(id)}`, resolvedTitle) : "";
  }
  const materialMatch = pathname.match(/^\/materials\/([^/?#]+)$/);
  if (materialMatch) {
    const id = decodeXiaowanziPathSegment(materialMatch[1]);
    return id ? buildXiaowanziNativeWebviewRoute(`/materials/${encodeURIComponent(id)}`, resolvedTitle) : "";
  }
  const expertMatch = pathname.match(/^\/experts\/([^/?#]+)$/);
  if (expertMatch) {
    const id = decodeXiaowanziPathSegment(expertMatch[1]);
    return id ? buildXiaowanziNativeWebviewRoute(`/experts/${encodeURIComponent(id)}`, resolvedTitle) : "";
  }
  const worthBuyMatch = pathname.match(/^\/worthbuy\/([^/?#]+)$/);
  if (worthBuyMatch) {
    const queryText = decodeXiaowanziPathSegment(worthBuyMatch[1]);
    return queryText ? `/pages/worthbuy-detail/index?query=${encodeURIComponent(queryText)}` : "";
  }
  if (pathname === "/worthbuy") return "/pages/worthbuy/index";
  if (pathname === "/experts") return "/pages/experts/index?from=xiaowanzi";
  return "";
}

function isGenericXiaowanziReadingLinkTitle(title) {
  const value = String(title || "").replace(/[《》「」"'“”]/g, "").replace(/\s+/g, "").trim();
  return !value || ["及阅", "及阅图书", "图书", "图书列表", "阅读", "书单"].includes(value);
}

function getXiaowanziNativeTabRoute(url) {
  const parsed = parseXiaowanziContentLink(url);
  if (!parsed) return "";
  const { pathname, query } = parsed;
  if ((pathname === "/reading" || pathname === "/books") && !hasXiaowanziContentQueryParam(query, "xf_external_book_id")) return "/pages/reading/index";
  if (pathname === "/library" && !hasXiaowanziContentQueryParam(query, "xf_external_book_id")) return "/pages/reading/index";
  if (pathname === "/programs" || pathname === "/programs/list") return "/pages/programs/index";
  if (pathname === "/materials") return "/pages/materials/index";
  if (pathname === "/topics") return "/pages/topics/index";
  return "";
}

function getXiaowanziReadingSearchQuery(url, fallbackTitle) {
  const parsed = parseXiaowanziContentLink(url);
  if (!parsed) return "";
  const { pathname, query } = parsed;
  if (pathname !== "/reading" && pathname !== "/books" && pathname !== "/library") return "";
  if (hasXiaowanziContentQueryParam(query, "xf_external_book_id")) return "";
  const queryValue = getXiaowanziContentQueryParam(query, "q");
  if (queryValue) return queryValue;
  if (isGenericXiaowanziReadingLinkTitle(fallbackTitle)) return "";
  return String(fallbackTitle || "").trim();
}

function getHomeTopicRequestUrl() {
  const activeChild = activeChildProfile();
  const params = ["page=1", "limit=24"];
  if (activeChild && activeChild.grade) params.push(`grade=${encodeURIComponent(activeChild.grade)}`);
  return `/api/topic-hub?${params.join("&")}`;
}

function buildActiveChildSummary() {
  const activeChild = activeChildProfile();
  if (!activeChild) {
    return {
      activeChildId: "",
      activeChildName: "关联孩子",
      activeChildMeta: "补全档案后，小玩子会更懂你的上下文",
      activeChildAvatar: XIAOWANZI_AVATAR_IMAGE,
      activeChildReady: false,
      childHintText: "可选：关联孩子档案后，回答会更个性化",
      childActionLabel: "关联"
    };
  }
  const meta = [activeChild.relation, activeChild.grade].filter(Boolean).join(" · ");
  return {
    activeChildId: activeChild.id,
    activeChildName: activeChild.displayName,
    activeChildMeta: meta || "已关联档案",
    activeChildAvatar: activeChild.avatar || XIAOWANZI_AVATAR_IMAGE,
    activeChildReady: true,
    childHintText: `已关联 ${activeChild.displayName} 档案，可获得更贴合的建议`,
    childActionLabel: "切换"
  };
}

function buildNativeShellData() {
  const metrics = getNativeTopbarMetrics();
  const capsuleHeight = Math.round(Number(metrics.capsuleHeight || 32));
  const knowledgeHeight = 34;
  const knowledgeWidth = 86;
  const avatarHeight = 40;
  const statusBarHeight = Math.max(0, Math.round(Number(metrics.statusBarHeight || 0)));
  const searchButtonTop = Math.round(Number(metrics.searchButtonTop || 0));
  const shellSafeTop = statusBarHeight > 0 ? statusBarHeight + 8 : 0;
  const shellControlTop = Math.max(0, searchButtonTop, shellSafeTop);
  const shellKnowledgeTop = Math.max(shellSafeTop, Math.round(shellControlTop + (capsuleHeight - knowledgeHeight) / 2));
  const avatarVisualBottomOffset = 3;
  const shellChromeBottomPadding = 2;
  const sharePreviewChromeOffset = 20;
  const shellAvatarTop = Math.max(0, shellKnowledgeTop + knowledgeHeight - avatarHeight + avatarVisualBottomOffset);
  const topbarHeight = Math.max(
    72,
    shellControlTop + capsuleHeight + shellChromeBottomPadding,
    shellAvatarTop + avatarHeight + shellChromeBottomPadding,
    shellKnowledgeTop + knowledgeHeight + shellChromeBottomPadding
  );
  const chatTop = topbarHeight + NATIVE_SHELL_BODY_HEIGHT;
  return {
    topbarHeight,
    chatTop,
    childBoundaryTop: topbarHeight + 12,
    shellLogoTop: shellControlTop,
    shellLogoHeight: capsuleHeight,
    shellAvatarTop,
    shellAvatarHeight: avatarHeight,
    shellKnowledgeTop,
    shellKnowledgeHeight: knowledgeHeight,
    shellKnowledgeWidth: knowledgeWidth,
    shellKnowledgeRight: Math.max(8, Math.round(Number(metrics.capsuleRight || 96) + 2)),
    sharePreviewTop: Math.max(topbarHeight + 12, shellControlTop + avatarHeight + sharePreviewChromeOffset, shellControlTop + capsuleHeight + 16)
  };
}

function normalizeAvatarState(index, clickCount) {
  const avatarCount = XIAOWANZI_TOPBAR_AVATARS.length;
  const parsedIndex = Number(index);
  const parsedClickCount = Number(clickCount);
  const avatarIndex = Number.isFinite(parsedIndex) && parsedIndex >= 0
    ? Math.floor(parsedIndex) % avatarCount
    : 0;
  const avatarClickCount = Number.isFinite(parsedClickCount) && parsedClickCount >= 0
    ? Math.floor(parsedClickCount) % AVATAR_SWITCH_CLICKS
    : 0;
  return { avatarIndex, avatarClickCount };
}

function loadTopbarAvatarState() {
  try {
    return normalizeAvatarState(
      wx.getStorageSync(LEGACY_AVATAR_INDEX_KEY),
      wx.getStorageSync(LEGACY_AVATAR_CLICK_COUNT_KEY)
    );
  } catch (_error) {
    return normalizeAvatarState(0, 0);
  }
}

function advanceTopbarAvatarState(state) {
  const current = normalizeAvatarState(state && state.avatarIndex, state && state.avatarClickCount);
  const nextClickCount = current.avatarClickCount + 1;
  if (nextClickCount < AVATAR_SWITCH_CLICKS) {
    return {
      avatarIndex: current.avatarIndex,
      avatarClickCount: nextClickCount
    };
  }
  return {
    avatarIndex: (current.avatarIndex + 1) % XIAOWANZI_TOPBAR_AVATARS.length,
    avatarClickCount: 0
  };
}

function getTopbarAvatarSrc(index) {
  return XIAOWANZI_TOPBAR_AVATARS[index] || XIAOWANZI_TOPBAR_AVATARS[0];
}

function persistTopbarAvatarState(state) {
  try {
    wx.setStorageSync(LEGACY_AVATAR_INDEX_KEY, state.avatarIndex);
    wx.setStorageSync(LEGACY_AVATAR_CLICK_COUNT_KEY, state.avatarClickCount);
  } catch (_error) {}
}

function consumeXiaowanziEntryTrigger() {
  try {
    if (String(wx.getStorageSync(XIAOWANZI_ENTRY_MODE_KEY) || "") !== "home") return false;
    wx.setStorageSync(XIAOWANZI_ENTRY_MODE_KEY, "");
    return true;
  } catch (_error) {
    return false;
  }
}

function parseLocalDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatChildAgeFromBirthDate(birthDate, now = new Date()) {
  const date = parseLocalDate(birthDate);
  if (!date) return "";
  let years = now.getFullYear() - date.getFullYear();
  let months = now.getMonth() - date.getMonth();
  if (now.getDate() < date.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "";
  if (years === 0) return months > 0 ? `${months}个月` : "未满1个月";
  return months > 0 ? `${years}岁${months}个月` : `${years}岁`;
}

function buildUserAddressingRule(childName, parentName) {
  const normalizedChildName = String(childName || "").trim();
  const normalizedParentName = String(parentName || "").trim();
  const userAddress = normalizedParentName && normalizedParentName !== normalizedChildName ? normalizedParentName : "家长";
  return normalizedChildName
    ? `称呼用户:${userAddress}。不要把孩子姓名${normalizedChildName}当作用户称呼。禁止称呼用户为${normalizedChildName}家长、${normalizedChildName}妈妈、${normalizedChildName}爸爸`
    : `称呼用户:${userAddress}`;
}

function buildChildProfileSummary(profile, parentRole, parentName) {
  const exactAge = formatChildAgeFromBirthDate(profile && profile.birthDate);
  const childName = String((profile && profile.displayName) || "孩子").trim() || "孩子";
  return [
    parentName ? `家长姓名:${parentName}` : "",
    `孩子姓名:${childName}`,
    buildUserAddressingRule(childName, parentName),
    profile && profile.relation ? `孩子关系:${String(profile.relation).trim()}` : "",
    profile && profile.birthDate ? `出生日期:${String(profile.birthDate).trim()}` : "",
    `当前日期:${formatLocalDate(new Date())}`,
    exactAge ? `准确年龄:${exactAge}（按出生日期和当前日期计算，请以该准确年龄为准）` : "",
    profile && profile.grade ? `年级:${String(profile.grade).trim()}` : "",
    `关注标签:${profile && Array.isArray(profile.concernTags) && profile.concernTags.length ? profile.concernTags.join("、") : "无"}`,
    parentRole ? `提问者身份:${parentRole}` : ""
  ].filter(Boolean).join("。");
}

function buildXiaowanziPromptPayload(input) {
  const profileSummary = String(input && input.profileSummary || "").trim();
  const memorySummary = String(input && input.memorySummary || "").trim();
  const userContent = String(input && input.userContent || "").trim();
  const profileBlock = memorySummary
    ? `[孩子档案]\n${profileSummary}\n\n[孩子记忆]\n${memorySummary}`
    : `[孩子档案]\n${profileSummary}`;
  return `[回答规则]\n${AI_RESPONSE_RULES}\n\n${profileBlock}\n\n[用户问题]\n${userContent}`;
}

function toVisibleUserContent(content) {
  const source = String(content || "").trim();
  const userQuestionMark = "[用户问题]";
  const markIndex = source.lastIndexOf(userQuestionMark);
  if (markIndex < 0) return source;
  const visible = source.slice(markIndex + userQuestionMark.length).trim();
  return visible || source;
}

function getCurrentParentRole() {
  const user = parseStoredValue(getUser(), {}) || {};
  return String(user.parentRole || user.relation || "").trim();
}

function getCurrentParentName() {
  const user = parseStoredValue(getUser(), {}) || {};
  const profile = user && typeof user.profile === "object" ? user.profile : {};
  return String(user.name || user.nickName || user.displayName || profile.name || profile.nickName || profile.displayName || user.username || "").trim();
}

function normalizeMessage(item, index) {
  const role = item && item.role === "user" ? "user" : "assistant";
  const rawContent = String(item && item.content || "").trim();
  const content = role === "user" ? toVisibleUserContent(rawContent) : rawContent;
  if (!content || content === "__THINKING__") return null;
  return {
    id: String(item && item.id || `${role}-${index}-${item && item.ts || Date.now()}`),
    role,
    content,
    contentParts: buildMessageContentParts(content),
    attachments: normalizeMessageAttachments(item && item.attachments),
    shareable: isShareableAssistantMessageValue(role, content, item && item.pending, item && item.error),
    ts: String(item && item.ts || new Date().toISOString())
  };
}

function normalizeMessageAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const source = item || {};
    const path = String(source.path || source.tempFilePath || "").trim();
    const mediaType = String(source.mediaType || source.mimeType || source.type || "").trim();
    if (!path || (mediaType && !/^image\//i.test(mediaType))) return null;
    const name = String(source.name || source.fileName || path.split("/").pop() || `图片${index + 1}`).trim();
    return {
      key: String(source.key || `${path}-${index}`),
      type: String(source.type || "image").trim() || "image",
      label: String(source.label || "图片").trim() || "图片",
      name,
      path,
      mediaType: mediaType || "image/jpeg"
    };
  }).filter(Boolean);
}

function currentUserStorageScope() {
  const token = String(getToken() || "").trim();
  if (!token) return "";
  const user = parseStoredValue(getUser(), {}) || {};
  const rawId = String(user._id || user.id || user.mobile || user.openid || user.wechatMiniOpenid || "").trim();
  const source = rawId || token;
  return source.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function scopedStorageKey(key) {
  const scope = currentUserStorageScope();
  return scope ? `${key}:${scope}` : key;
}

function historyCacheKey(childId) {
  return scopedStorageKey(`${NATIVE_HISTORY_CACHE_PREFIX}${childId || "global"}`);
}

function sessionMessagesKey(sessionId) {
  return scopedStorageKey(`${NATIVE_SESSION_MESSAGES_PREFIX}${sessionId}`);
}

function sessionMessagesLegacyKey(sessionId) {
  return `${NATIVE_SESSION_MESSAGES_PREFIX}${sessionId}`;
}

function activeSessionKey() {
  return scopedStorageKey(NATIVE_ACTIVE_SESSION_KEY);
}

function sessionIndexKey() {
  return scopedStorageKey(NATIVE_SESSION_INDEX_KEY);
}

function createNativeSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeHistoryMessages(messages) {
  const sanitized = (messages || [])
    .filter((item) => item && !item.pending && !item.error && item.content !== DEFAULT_ASSISTANT_MESSAGE.content)
    .map(normalizeMessage)
    .filter(Boolean);
  while (sanitized.length && sanitized[sanitized.length - 1].role === "user") sanitized.pop();
  return sanitized.some((item) => item.role === "assistant") ? sanitized : [];
}

function readNativeSessionIndex() {
  try {
    const raw = wx.getStorageSync(sessionIndexKey()) || (currentUserStorageScope() ? "" : wx.getStorageSync(NATIVE_SESSION_INDEX_KEY));
    const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item && item.id || "").trim(),
        title: toVisibleUserContent(item && item.title),
        sub: String(item && item.sub || "").trim(),
        childTag: String(item && item.childTag || "").trim(),
        childId: String(item && item.childId || "").trim(),
        targetId: String(item && item.targetId || "").trim(),
        updatedAt: String(item && item.updatedAt || item && item.ts || "").trim()
      }))
      .filter((item) => item.id && item.title);
  } catch (_error) {
    return [];
  }
}

function writeNativeSessionIndex(items) {
  try {
    wx.setStorageSync(sessionIndexKey(), (items || []).slice(0, 60));
  } catch (_error) {}
}

function removeStorageKey(key) {
  if (!key) return;
  try {
    if (wx.removeStorageSync) wx.removeStorageSync(key);
    else wx.setStorageSync(key, "");
  } catch (_error) {}
}

function readNativeSessionMessages(sessionId) {
  if (!sessionId) return [];
  try {
    const raw = wx.getStorageSync(sessionMessagesKey(sessionId)) || (currentUserStorageScope() ? "" : wx.getStorageSync(sessionMessagesLegacyKey(sessionId)));
    const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    return Array.isArray(parsed) ? sanitizeHistoryMessages(parsed) : [];
  } catch (_error) {
    return [];
  }
}

function writeNativeSessionMessages(sessionId, messages) {
  if (!sessionId) return;
  try {
    wx.setStorageSync(sessionMessagesKey(sessionId), sanitizeHistoryMessages(messages).slice(-80));
  } catch (_error) {}
}

function readCachedHistory(childId) {
  try {
    const raw = wx.getStorageSync(historyCacheKey(childId));
    const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    return Array.isArray(parsed) ? sanitizeHistoryMessages(parsed) : [];
  } catch (_error) {
    return [];
  }
}

function saveCachedHistory(childId, messages) {
  try {
    wx.setStorageSync(historyCacheKey(childId), sanitizeHistoryMessages(messages).slice(-80));
  } catch (_error) {}
}

function removeCachedHistory(childId) {
  removeStorageKey(historyCacheKey(childId));
}

function formatHistoryTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "历史会话";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function firstUserHistoryTitle(messages) {
  for (let index = 0; index < (messages || []).length; index += 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    const title = String(message.content || "").trim();
    if (title) return {
      title,
      targetId: String(message.id || `history-${index}`),
      ts: String(message.ts || "")
    };
  }
  return null;
}

function buildHistoryCards(messages, childName) {
  const summary = firstUserHistoryTitle(messages);
  if (!summary) return [];
  return [{
    id: summary.targetId,
    title: summary.title,
    sub: formatHistoryTime(summary.ts),
    childTag: childName || "",
    targetId: summary.targetId,
    sessionId: ""
  }];
}

function childNameByIdMap() {
  const map = {};
  loadChildProfilesForNativeChat().forEach((child) => {
    const id = String(child && child.id || "").trim();
    const name = String(child && child.displayName || "").trim();
    if (id && name) map[id] = name;
  });
  return map;
}

function resolveHistoryChildTag(item, childName, nameById) {
  const childId = String(item && item.childId || "").trim();
  if (childId && nameById && nameById[childId]) return nameById[childId];
  return String((item && item.childTag) || childName || "").trim();
}

function syncNativeSessionChildTags() {
  const nameById = childNameByIdMap();
  const index = readNativeSessionIndex();
  let changed = false;
  const nextIndex = index.map((item) => {
    const childId = String(item && item.childId || "").trim();
    if (!childId || !nameById[childId] || item.childTag === nameById[childId]) return item;
    changed = true;
    return {
      ...item,
      childTag: nameById[childId]
    };
  });
  if (changed) writeNativeSessionIndex(nextIndex);
  return nextIndex;
}

function buildSessionHistoryCards(childName) {
  const nameById = childNameByIdMap();
  return readNativeSessionIndex()
    .map((item) => ({
      id: item.id,
      title: item.title,
      sub: item.sub || formatHistoryTime(item.updatedAt),
      childTag: resolveHistoryChildTag(item, childName, nameById),
      targetId: item.targetId,
      sessionId: item.id
    }));
}

function saveNativeSession(childId, childName, messages) {
  const sanitized = sanitizeHistoryMessages(messages);
  if (!sanitized.length) {
    saveCachedHistory(childId, messages);
    return "";
  }
  const sessionId = String(wx.getStorageSync(activeSessionKey()) || "").trim() || createNativeSessionId();
  const summary = firstUserHistoryTitle(sanitized);
  if (!summary) return "";
  const updatedAt = sanitized[sanitized.length - 1].ts || new Date().toISOString();
  const card = {
    id: sessionId,
    title: summary.title,
    sub: formatHistoryTime(updatedAt),
    childTag: childId ? (childName || "") : "",
    childId: childId || "",
    targetId: summary.targetId,
    updatedAt
  };
  const remaining = readNativeSessionIndex().filter((item) => item.id !== sessionId);
  writeNativeSessionIndex([card].concat(remaining));
  writeNativeSessionMessages(sessionId, sanitized);
  wx.setStorageSync(activeSessionKey(), sessionId);
  saveCachedHistory(childId, sanitized);
  return sessionId;
}

function removeNativeSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return false;
  const remaining = readNativeSessionIndex().filter((item) => item.id !== id);
  writeNativeSessionIndex(remaining);
  removeStorageKey(sessionMessagesKey(id));
  if (sessionMessagesLegacyKey(id) !== sessionMessagesKey(id)) removeStorageKey(sessionMessagesLegacyKey(id));
  const activeSessionId = String(wx.getStorageSync(activeSessionKey()) || "").trim();
  const wasActive = activeSessionId === id;
  if (wasActive) removeStorageKey(activeSessionKey());
  if (String(wx.getStorageSync(NATIVE_ACTIVE_SESSION_KEY) || "").trim() === id) removeStorageKey(NATIVE_ACTIVE_SESSION_KEY);
  return wasActive;
}

function selectedMessageMapFromIds(ids) {
  const map = {};
  (ids || []).forEach((id) => {
    if (id) map[id] = true;
  });
  return map;
}

function shareRoundCountFromIds(ids) {
  return Math.ceil(((ids || []).length || 0) / 2);
}

function selectPairedMessageIds(messages, messageId, currentIds) {
  const selected = new Set(currentIds || []);
  const id = String(messageId || "");
  if (!id) return Array.from(selected);
  const index = (messages || []).findIndex((message) => String(message && message.id) === id);
  if (index < 0) return Array.from(selected);
  const target = messages[index];
  const pair = target && target.role === "user" ? messages[index + 1] : messages[index - 1];
  const pairId = pair && String(pair.id || "");
  if (selected.has(id)) {
    selected.delete(id);
    if (pairId) selected.delete(pairId);
  } else {
    selected.add(id);
    if (pairId) selected.add(pairId);
  }
  return Array.from(selected);
}

function expandShareSelectionIds(messages, ids) {
  const selected = new Set((ids || []).map((id) => String(id || "")).filter(Boolean));
  (messages || []).forEach((message, index) => {
    const id = String(message && message.id || "");
    if (!id || !selected.has(id)) return;
    const role = String(message && message.role || "");
    if (role === "assistant") {
      for (let i = index - 1; i >= 0; i -= 1) {
        const candidate = messages[i];
        if (candidate && candidate.role === "assistant") break;
        if (candidate && candidate.role === "user") {
          selected.add(String(candidate.id || ""));
          break;
        }
      }
    }
    if (role === "user") {
      for (let i = index + 1; i < messages.length; i += 1) {
        const candidate = messages[i];
        if (candidate && candidate.role === "user") break;
        if (candidate && candidate.role === "assistant") {
          selected.add(String(candidate.id || ""));
          break;
        }
      }
    }
  });
  return Array.from(selected);
}

function selectedMessagesText(messages, ids) {
  const selected = selectedMessageMapFromIds(expandShareSelectionIds(messages, ids));
  return (messages || [])
    .filter((message) => selected[message.id])
    .map((message) => ({
      role: message.role === "user" ? "家长" : "小玩子",
      content: normalizeShareMessageContent(message.content)
    }))
    .filter((message) => message.content)
    .map((message) => `${message.role}：${message.content}`)
    .join("\n\n");
}

function normalizeShareMessageContent(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/#{1,6}\s?/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeStoredShareMessageContent(text) {
  return String(text || "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeShareCanvasText(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/#{1,6}\s?/g, "")
    .replace(/[ \t]{2,}/g, " ");
}

function parseStandaloneMarkdownLink(line) {
  const source = String(line || "")
    .trim()
    .replace(/^\*\*\s*([\s\S]+?)\s*\*\*$/g, "$1")
    .trim();
  const match = source.match(/^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)$/);
  if (!match) return null;
  const text = stripMarkdownInline(match[1]).trim();
  const url = String(match[2] || "").trim();
  return text && url ? { type: "link", text, url } : null;
}

function buildShareMarkdownDocumentContentParts(content) {
  const parts = [];
  const paragraphLines = [];
  const pushParagraph = () => {
    const text = paragraphLines.map(normalizeShareCanvasText).filter(Boolean).join("\n");
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

    const standaloneLink = parseStandaloneMarkdownLink(trimmed);
    if (standaloneLink) {
      pushParagraph();
      parts.push(standaloneLink);
      return;
    }

    paragraphLines.push(trimmed);
  });

  pushParagraph();
  return parts.filter((part) => part.text);
}

function buildShareCanvasContentParts(text, contentParts) {
  const markdownParts = looksLikeMarkdownDocument(text)
    ? buildShareMarkdownDocumentContentParts(text)
    : [];
  const hasMarkdownLink = markdownParts.some((part) => part.type === "link");
  const hasContentPartLink = Array.isArray(contentParts) && contentParts.some((part) => part && part.type === "link");
  const sourceParts = hasMarkdownLink && !hasContentPartLink
    ? markdownParts
    : Array.isArray(contentParts) && contentParts.length
    ? contentParts
    : buildMessageContentParts(text);
  const parts = sourceParts
    .map((part) => ({
      type: ["link", "md_heading", "md_paragraph", "md_list_item"].includes(part.type) ? part.type : "text",
      text: normalizeShareCanvasText(part.text),
      url: part.type === "link" ? String(part.url || "").trim() : ""
    }))
    .filter((part) => part.text);
  return parts.length ? parts : [{ type: "text", text: normalizeShareCanvasText(text) }];
}

function shareQrFilePath(shareId) {
  const safeShareId = String(shareId || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const userDataPath = String(wx && wx.env && wx.env.USER_DATA_PATH || "");
  return userDataPath && safeShareId ? `${userDataPath}/${SHARE_CARD_QR_FILE_PREFIX}-${safeShareId}.png` : "";
}

function currentMiniProgramEnvVersion() {
  if (typeof wx === "undefined" || typeof wx.getAccountInfoSync !== "function") return "";
  try {
    const info = wx.getAccountInfoSync();
    const envVersion = String(info && info.miniProgram && info.miniProgram.envVersion || "").trim();
    return ["develop", "trial", "release"].includes(envVersion) ? envVersion : "";
  } catch (_error) {
    return "";
  }
}

function xiaowanziShareQrUrl(shareId) {
  const params = [`shareId=${encodeURIComponent(shareId)}`, "transparent=1", "v=2"];
  const envVersion = currentMiniProgramEnvVersion();
  if (envVersion && envVersion !== "release") params.push(`envVersion=${encodeURIComponent(envVersion)}`);
  return buildUrl(`/api/wechat-mini/xiaowanzi-share-qrcode?${params.join("&")}`);
}

function decodeArrayBufferUtf8(value) {
  const bytes = new Uint8Array(value);
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch (_error) {}
  }
  try {
    let encoded = "";
    bytes.forEach((byte) => {
      encoded += `%${byte.toString(16).padStart(2, "0")}`;
    });
    return decodeURIComponent(encoded);
  } catch (_error) {
    return String.fromCharCode.apply(null, Array.from(bytes));
  }
}

function maybeDecodeLatin1Utf8String(value) {
  const text = String(value || "");
  if (!text || /[\u4e00-\u9fff]/.test(text)) return text;
  if (!/(?:Ã.|Â.|[äåèéç][\u0080-\u00ff])/.test(text)) return text;
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code > 255) return text;
    bytes.push(code);
  }
  try {
    return decodeArrayBufferUtf8(new Uint8Array(bytes).buffer);
  } catch (_error) {
    return text;
  }
}

function arrayBufferJsonMessage(value) {
  if (!value || typeof ArrayBuffer === "undefined" || !(value instanceof ArrayBuffer)) return "";
  try {
    const text = decodeArrayBufferUtf8(value);
    const data = JSON.parse(text);
    return String(data && (data.error || data.message) || "").trim();
  } catch (_error) {
    return "";
  }
}

function decodeXiaowanziResponseData(value) {
  if (!value) return "";
  if (typeof value === "string") return maybeDecodeLatin1Utf8String(value);
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return decodeArrayBufferUtf8(value);
  if (typeof value === "object" && typeof value.data !== "undefined") return decodeXiaowanziResponseData(value.data);
  return "";
}

function parseXiaowanziSseBlock(block) {
  const lines = String(block || "").replace(/\r\n/g, "\n").split("\n");
  let eventName = "";
  const dataLines = [];
  lines.forEach((line) => {
    if (line.indexOf("event:") === 0) {
      eventName = line.replace(/^event:\s*/, "").trim();
      return;
    }
    if (line.indexOf("data:") === 0) {
      dataLines.push(line.replace(/^data:\s*/, ""));
    }
  });
  if (!dataLines.length) return null;
  const rawData = dataLines.join("\n").trim();
  if (!rawData || rawData === "[DONE]") return null;
  try {
    return { eventName, payload: JSON.parse(rawData) };
  } catch (_error) {
    return { eventName, payload: { content: rawData } };
  }
}

function drainXiaowanziSseBuffer(buffer, flush, onEvent) {
  const normalized = String(buffer || "").replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = flush ? "" : parts.pop() || "";
  const events = flush ? parts : parts;
  events.forEach((part) => {
    const event = parseXiaowanziSseBlock(part);
    if (event) onEvent(event);
  });
  if (flush && rest) {
    const event = parseXiaowanziSseBlock(rest);
    if (event) onEvent(event);
  }
  return rest;
}

function normalizeXiaowanziThinkingSteps(trace) {
  if (!Array.isArray(trace)) return [];
  return trace
    .map((item, index) => {
      const label = String(item && item.label || "").trim();
      const detail = String(item && item.detail || "").trim();
      if (!label && !detail) return null;
      const status = ["hit", "miss", "fallback"].includes(String(item && item.status)) ? String(item.status) : "miss";
      const text = [label, detail].filter(Boolean).join("：");
      return {
        key: `${status}-${index}-${text}`,
        status,
        text
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function buildInitialXiaowanziThinkingSteps() {
  return [
    { key: "initial-understand", status: "pending", text: "正在理解问题" },
    { key: "initial-search", status: "pending", text: "准备查找站内内容和知识库" }
  ];
}

function applyXiaowanziThinkingActiveStep(message, index, tick) {
  const steps = Array.isArray(message && message.thinkingSteps) ? message.thinkingSteps : [];
  const activeIndex = steps.length ? Math.max(0, Math.min(steps.length - 1, Number(index) || 0)) : 0;
  const activeStep = steps[activeIndex] || null;
  return {
    ...message,
    thinkingActiveStepIndex: activeIndex,
    thinkingActiveStepText: activeStep ? activeStep.text : "",
    thinkingActiveStepStatus: activeStep ? activeStep.status : "",
    thinkingTick: Number(tick) || 0
  };
}

function parseXiaowanziResponsePayload(data) {
  if (!data) return null;
  if (typeof data === "object" && (typeof ArrayBuffer === "undefined" || !(data instanceof ArrayBuffer))) return data;
  const text = decodeXiaowanziResponseData(data).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { content: text };
  }
}

function xiaowanziRequestError(res, url, fallback) {
  const statusCode = Number(res && res.statusCode || 0);
  const payload = parseXiaowanziResponsePayload(res && res.data) || {};
  if (statusCode === 401) clearSession();
  return {
    statusCode,
    data: payload,
    url,
    message: String(payload && (payload.error || payload.message || payload.detail || payload.content) || fallback || "请求失败")
  };
}

function requestXiaowanziStream(options) {
  const content = String(options && options.content || "");
  const onDelta = options && typeof options.onDelta === "function" ? options.onDelta : function noop() {};
  const onContext = options && typeof options.onContext === "function" ? options.onContext : function noop() {};
  const token = getToken();
  const url = buildUrl(`/api/v1/tutorbot/${BOT_ID}/messages`);
  const header = { "content-type": "application/json" };
  if (token) header.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    let buffer = "";
    let streamedContent = "";
    let finalPayload = null;
    let receivedChunk = false;
    let settled = false;

    const settleResolve = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const handleEvent = (event) => {
      const eventName = String(event && event.eventName || "").trim();
      const payload = event && event.payload || {};
      if (eventName === "delta") {
        const delta = String(payload && payload.content || "");
        if (!delta) return;
        streamedContent += delta;
        onDelta(delta);
        return;
      }
      if (eventName === "context") {
        onContext(payload);
        return;
      }
      if (eventName === "done") {
        finalPayload = payload || {};
        return;
      }
      if (eventName === "error") {
        settleReject({ statusCode: 0, data: payload, url, message: String(payload && payload.content || "请求失败") });
      }
    };

    const task = wx.request({
      method: "POST",
      url,
      data: { content, stream: true },
      header,
      responseType: "arraybuffer",
      enableChunked: true,
      success(res) {
        const statusCode = Number(res && res.statusCode || 0);
        if (statusCode < 200 || statusCode >= 300) {
          settleReject(xiaowanziRequestError(res, url, "请求失败"));
          return;
        }
        if (!receivedChunk) {
          const payload = parseXiaowanziResponsePayload(res && res.data);
          const text = decodeXiaowanziResponseData(res && res.data);
          if (text.indexOf("event:") >= 0 || text.indexOf("data:") >= 0) {
            buffer = drainXiaowanziSseBuffer(text, true, handleEvent);
          } else if (payload) {
            finalPayload = payload;
          }
        } else {
          buffer = drainXiaowanziSseBuffer(buffer, true, handleEvent);
        }
        settleResolve(finalPayload || { content: streamedContent });
      },
      fail(error) {
        settleReject({ statusCode: 0, message: error && error.errMsg || "网络连接失败", url, error });
      }
    });

    if (task && typeof task.onChunkReceived === "function") {
      task.onChunkReceived((chunk) => {
        receivedChunk = true;
        buffer += decodeXiaowanziResponseData(chunk && chunk.data || chunk);
        buffer = drainXiaowanziSseBuffer(buffer, false, handleEvent);
      });
    }
  });
}

function createXiaowanziConversationShare(messages) {
  const items = (Array.isArray(messages) ? messages : [])
    .map((message) => ({
      role: message && message.role === "user" ? "user" : "assistant",
      content: normalizeStoredShareMessageContent(message && message.content)
    }))
    .filter((message) => message.content);
  if (!items.length) return Promise.reject(new Error("当前内容没有可分享的对话"));
  const userQuestion = items.find((message) => message.role === "user") || items[0];
  const title = `小玩子：${truncateWechatShareTitle(normalizeShareMessageContent(userQuestion.content))}`;
  return request({
    method: "POST",
    url: "/api/wechat-mini/xiaowanzi-shares",
    data: { title, messages: items }
  }).then((payload) => {
    const shareId = String(payload && (payload.id || payload.shareId) || "").trim();
    if (!shareId) throw new Error("分享内容保存失败，请重试");
    return shareId;
  }).catch((error) => {
    const message = String(error && error.message || "").trim();
    throw new Error(message && message !== "请求失败" ? message : "小程序码生成失败，请重试");
  });
}

function loadShareQrImagePath(messages) {
  if (typeof wx === "undefined" || typeof wx.request !== "function" || typeof wx.getFileSystemManager !== "function") {
    return Promise.reject(new Error("当前环境暂不支持生成小程序码"));
  }
  return createXiaowanziConversationShare(messages).then((shareId) => {
    const cacheKey = `${shareId}:${SHARE_CARD_QR_CACHE_VERSION}`;
    if (shareQrImageCache[cacheKey]) return shareQrImageCache[cacheKey];
    const filePath = shareQrFilePath(shareId);
    if (!filePath) throw new Error("小程序码保存失败，请重试");
    const fs = wx.getFileSystemManager();
    if (!fs || typeof fs.writeFile !== "function") {
      throw new Error("当前环境暂不支持生成小程序码");
    }

    return new Promise((resolve, reject) => {
      const token = getToken();
      const header = token ? { Authorization: `Bearer ${token}` } : {};
      wx.request({
        url: xiaowanziShareQrUrl(shareId),
        header,
        responseType: "arraybuffer",
        success(res) {
          if (Number(res && res.statusCode) !== 200 || !res || !res.data) {
            reject(new Error(arrayBufferJsonMessage(res && res.data) || "小程序码生成失败，请重试"));
            return;
          }
          fs.writeFile({
            filePath,
            data: res.data,
            success() {
              shareQrImageCache[cacheKey] = filePath;
              resolve(filePath);
            },
            fail() {
              reject(new Error("小程序码保存失败，请重试"));
            }
          });
        },
        fail() {
          reject(new Error("小程序码生成失败，请重试"));
        }
      });
    });
  });
}

function extractShareReferences(text) {
  const references = [];
  const seen = new Set();
  String(text || "").replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)/g, (_match, label) => {
    const value = String(label || "").trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      references.push(value);
    }
    return "";
  });
  return references.slice(0, 5);
}

function buildShareReferenceLines(ctx, references, maxWidth, fontSize) {
  const items = Array.isArray(references) ? references.filter(Boolean) : [];
  if (!items.length) return [];
  return [
    ...wrapCanvasTextLines(ctx, "站内引用：搜索以下标题", maxWidth, fontSize),
    ...items.flatMap((reference, index) => {
      const line = `${index + 1}. 「${String(reference || "").trim()}」`;
      return wrapCanvasTextLines(ctx, line, maxWidth, fontSize);
    })
  ];
}

function selectedMessagesForIds(messages, ids) {
  const selected = selectedMessageMapFromIds(expandShareSelectionIds(messages, ids));
  return (messages || [])
    .filter((message) => selected[message.id])
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: normalizeStoredShareMessageContent(message.content),
      contentParts: buildShareCanvasContentParts(message.content, message.contentParts),
      references: extractShareReferences(message.content)
    }))
    .filter((message) => message.content);
}

function currentShareMessages(data) {
  if (data && data.homeMode && Array.isArray(data.homeConversationMessages) && data.homeConversationMessages.length) {
    return data.homeConversationMessages;
  }
  return data && Array.isArray(data.messages) ? data.messages : [];
}

function truncateWechatShareTitle(text) {
  const value = String(text || "").trim().replace(/\s+/g, " ");
  if (value.length <= WECHAT_SHARE_TITLE_LIMIT) return value;
  return `${value.slice(0, WECHAT_SHARE_TITLE_LIMIT - 1)}…`;
}

function selectedShareKeyFromIds(ids) {
  return (ids || []).join("|");
}

function buildSelectedWechatShare(messages, ids, shareId) {
  const safeShareId = String(shareId || "").trim();
  if (!safeShareId) return null;
  const selected = selectedMessagesForIds(messages, ids);
  if (!selected.length) return null;
  const userQuestion = selected.find((message) => message.role === "user") || selected[0];
  const title = `小玩子：${truncateWechatShareTitle(normalizeShareMessageContent(userQuestion.content))}`;
  return createPageShare({
    title,
    imageUrl: XIAOWANZI_SHARE_COVER_IMAGE,
    path: "/pages/share/index",
    query: { sid: safeShareId }
  }).onShareAppMessage();
}

function canvasTextWidth(ctx, text, fontSize) {
  if (ctx && typeof ctx.measureText === "function") {
    try {
      const result = ctx.measureText(text);
      if (result && Number(result.width) > 0) return Number(result.width);
    } catch (_error) {}
  }
  return String(text || "").replace(/[^\x00-\xff]/g, "xx").length * fontSize * 0.5;
}

function setShareCanvasFontSize(ctx, fontSize) {
  if (ctx && typeof ctx.setFontSize === "function") ctx.setFontSize(fontSize);
}

function setShareCanvasTextAlign(ctx, align) {
  if (ctx && typeof ctx.setTextAlign === "function") ctx.setTextAlign(align);
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  if (!ctx) return;
  if (typeof ctx.beginPath === "function" && typeof ctx.arcTo === "function") {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    if (typeof ctx.closePath === "function") ctx.closePath();
    if (typeof ctx.fill === "function") ctx.fill();
    return;
  }
  if (typeof ctx.fillRect === "function") ctx.fillRect(x, y, width, height);
}

function createShareCanvasLinearGradient(ctx, x0, y0, x1, y1, stops, fallback) {
  if (ctx && typeof ctx.createLinearGradient === "function") {
    try {
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      if (gradient && typeof gradient.addColorStop === "function") {
        (stops || []).forEach((stop) => gradient.addColorStop(stop.offset, stop.color));
        return gradient;
      }
    } catch (_error) {}
  }
  return fallback;
}

function drawShareCanvasPageBackground(ctx, canvasHeight) {
  const style = SHARE_CANVAS_CHAT_STYLE;
  ctx.setFillStyle(createShareCanvasLinearGradient(ctx, 0, 0, 0, canvasHeight, [
    { offset: 0, color: style.pageTopColor },
    { offset: 1, color: style.pageBottomColor }
  ], style.pageBottomColor));
  ctx.fillRect(0, 0, SHARE_CANVAS_WIDTH, canvasHeight);
}

function drawShareCanvasTopbar(ctx) {
  const topbar = SHARE_CANVAS_CHAT_STYLE.topbar;
  ctx.drawImage(SHARE_CARD_LOGO_IMAGE, topbar.logoX, topbar.logoY, topbar.logoWidth, topbar.logoHeight);
}

function wrapCanvasTextLines(ctx, text, maxWidth, fontSize, maxLines) {
  const paragraphs = String(text || "").split(/\n+/);
  const lines = [];
  paragraphs.forEach((paragraph) => {
    const source = paragraph.replace(/\s+/g, " ").trim();
    if (!source) return;
    let line = "";
    source.split("").forEach((char) => {
      const next = `${line}${char}`;
      if (line && canvasTextWidth(ctx, next, fontSize) > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
  });
  if (!Number.isFinite(maxLines) || maxLines <= 0) return lines;
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) {
    const lastIndex = visible.length - 1;
    visible[lastIndex] = `${visible[lastIndex].slice(0, Math.max(0, visible[lastIndex].length - 1))}...`;
  }
  return visible;
}

function drawCanvasTextLines(ctx, lines, x, y, lineHeight) {
  setShareCanvasTextAlign(ctx, "left");
  lines.forEach((lineText, index) => {
    ctx.fillText(lineText, x, y + index * lineHeight);
  });
}

function appendRichTextRun(line, type, text) {
  const value = String(text || "");
  if (!value) return;
  const last = line[line.length - 1];
  if (last && last.type === type) {
    last.text += value;
    return;
  }
  line.push({ type, text: value });
}

function richLineRuns(line) {
  return Array.isArray(line) ? line : Array.isArray(line && line.runs) ? line.runs : [];
}

function richLineType(line) {
  return Array.isArray(line) ? "" : String((line && line.type) || "");
}

function richLineText(line) {
  return richLineRuns(line).map((run) => run.text).join("");
}

function richLineLinkMetrics(line) {
  return line && typeof line === "object" ? line.linkMetrics : null;
}

function shareCanvasLinkMetrics(ctx, text, fontSize, maxWidth) {
  const siteCard = SHARE_CANVAS_CHAT_STYLE.siteCard;
  const cardWidth = Math.max(0, Number(maxWidth) || 0);
  const textMaxWidth = Math.max(0, cardWidth - siteCard.paddingX * 2 - siteCard.arrowFontSize - siteCard.arrowGap);
  const textLines = wrapCanvasTextLines(ctx, text, textMaxWidth, fontSize, siteCard.maxLines);
  const textHeight = Math.max(siteCard.lineHeight, textLines.length * siteCard.lineHeight);
  return {
    width: cardWidth,
    height: Math.ceil(Math.max(siteCard.minHeight, siteCard.paddingY * 2 + textHeight)),
    textLines
  };
}

function richRunWidth(ctx, run, fontSize) {
  const text = String((run && run.text) || "");
  if (String((run && run.type) || "") === "link") return canvasTextWidth(ctx, text, fontSize);
  return canvasTextWidth(ctx, text, fontSize);
}

function richLineWidth(ctx, line, fontSize) {
  return richLineRuns(line).reduce((total, run) => total + richRunWidth(ctx, run, fontSize), 0);
}

function wrapCanvasRichTextLines(ctx, parts, maxWidth, fontSize) {
  const lines = [];
  let line = [];
  let lineWidth = 0;
  let lineType = "";
  const pushLine = () => {
    if (line.length) lines.push({ runs: line, type: lineType });
    line = [];
    lineWidth = 0;
    lineType = "";
  };
  const appendWrappedText = (type, text) => {
    String(text || "").split("").forEach((char) => {
      if (char === "\n") {
        pushLine();
        lineType = type;
        return;
      }
      const charWidth = canvasTextWidth(ctx, char, fontSize);
      if (line.length && lineWidth + charWidth > maxWidth) {
        pushLine();
        lineType = type;
      }
      lineType = lineType || type;
      appendRichTextRun(line, type, char);
      lineWidth += charWidth;
    });
  };
  const appendLink = (text) => {
    const value = String(text || "").trim();
    if (!value) return;
    pushLine();
    const linkMetrics = shareCanvasLinkMetrics(ctx, value, fontSize, maxWidth);
    lines.push({ runs: [{ type: "link", text: value }], type: "link", linkMetrics });
  };
  (parts || []).forEach((part) => {
    const rawType = String((part && part.type) || "");
    const type = ["link", "md_heading", "md_paragraph", "md_list_item"].includes(rawType) ? rawType : "text";
    if (type === "md_heading" || type === "md_paragraph" || type === "md_list_item") {
      pushLine();
      lineType = type;
      if (type === "md_list_item") {
        appendRichTextRun(line, "md_bullet", "• ");
        lineWidth += canvasTextWidth(ctx, "• ", fontSize);
      }
      appendWrappedText(type, (part && part.text) || "");
      pushLine();
      return;
    }
    if (type === "link") {
      appendLink((part && part.text) || "");
      return;
    }
    appendWrappedText(type, (part && part.text) || "");
  });
  pushLine();
  return lines;
}

function shareCanvasLineTopGap(lines, index) {
  if (index <= 0) return 0;
  const type = richLineType(lines[index]);
  const previousType = richLineType(lines[index - 1]);
  if (type === "md_heading") return previousType ? 24 : 0;
  if (type === "link" && previousType === "md_heading") return 12;
  if (type === "link") return 14;
  if (type === "md_paragraph" && previousType === "md_heading") return 12;
  if (type === "md_paragraph") return 20;
  if (type === "md_list_item") return 12;
  return 0;
}

function shareCanvasSiteCardBottomGap(lines, index) {
  const siteCardMarginY = SHARE_CANVAS_CHAT_STYLE.siteCard.marginY;
  if (richLineType(lines[index]) !== "link") return 0;
  return Math.max(siteCardMarginY, shareCanvasLineTopGap(lines, index));
}

function shareCanvasRichTextHeight(lines, lineHeight, fontSize) {
  const currentFontSize = Number(fontSize) || SHARE_CANVAS_CHAT_STYLE.assistant.fontSize;
  return (lines || []).reduce((total, line, index) => {
    const metrics = richLineType(line) === "link" ? richLineLinkMetrics(line) : null;
    const itemHeight = metrics ? metrics.height + shareCanvasSiteCardBottomGap(lines, index) + lineHeight - currentFontSize : lineHeight;
    return total + shareCanvasLineTopGap(lines, index) + itemHeight;
  }, 0);
}

function drawShareCanvasSiteCard(ctx, line, x, y, width, fontSize) {
  const siteCard = SHARE_CANVAS_CHAT_STYLE.siteCard;
  const metrics = richLineLinkMetrics(line) || shareCanvasLinkMetrics(ctx, richLineText(line), fontSize, width);
  const cardWidth = Math.max(0, Math.min(width, metrics.width || width));
  const cardHeight = metrics.height;
  ctx.setFillStyle(siteCard.borderColor);
  drawRoundRect(ctx, x, y, cardWidth, cardHeight, siteCard.radius);
  ctx.setFillStyle(createShareCanvasLinearGradient(ctx, x, y, x + cardWidth, y + cardHeight, [
    { offset: 0, color: siteCard.backgroundStart },
    { offset: 1, color: siteCard.backgroundEnd }
  ], siteCard.backgroundEnd));
  drawRoundRect(ctx, x + 1, y + 1, Math.max(0, cardWidth - 2), Math.max(0, cardHeight - 2), siteCard.radius - 1);
  const textX = x + siteCard.paddingX;
  const textY = y + siteCard.paddingY + fontSize;
  const arrowX = x + cardWidth - siteCard.paddingX - siteCard.arrowFontSize;
  const textMaxWidth = Math.max(0, arrowX - siteCard.arrowGap - textX);
  const textLines = metrics.textLines && metrics.textLines.length
    ? metrics.textLines
    : wrapCanvasTextLines(ctx, richLineText(line), textMaxWidth, fontSize, siteCard.maxLines);
  setShareCanvasFontSize(ctx, fontSize);
  ctx.setFillStyle(siteCard.textColor);
  drawCanvasTextLines(ctx, textLines, textX, textY, siteCard.lineHeight);
  drawShareCanvasSiteCardArrow(ctx, arrowX, y + Math.round((cardHeight - siteCard.arrowFontSize) / 2), siteCard.arrowFontSize);
  setShareCanvasFontSize(ctx, fontSize);
}

function drawShareCanvasSiteCardArrow(ctx, x, y, size) {
  const arrow = Math.max(18, Number(size) || SHARE_CANVAS_CHAT_STYLE.siteCard.arrowFontSize);
  if (!ctx || typeof ctx.fillText !== "function") return;
  setShareCanvasTextAlign(ctx, "left");
  setShareCanvasFontSize(ctx, arrow);
  ctx.setFillStyle(SHARE_CANVAS_CHAT_STYLE.siteCard.arrowColor);
  ctx.fillText("↗", x, y + Math.round(arrow * 0.82));
}

function drawCanvasRichTextLines(ctx, lines, x, y, lineHeight, options) {
  const defaultFillStyle = options && options.defaultFillStyle || "#121735";
  const linkFillStyle = options && options.linkFillStyle || "#6d28f2";
  const fontSize = Number(options && options.fontSize) || 28;
  const maxWidth = Math.max(0, Number(options && options.maxWidth) || 0);
  let baselineY = y;
  setShareCanvasTextAlign(ctx, "left");
  (lines || []).forEach((line, lineIndex) => {
    baselineY += shareCanvasLineTopGap(lines, lineIndex);
    if (richLineType(line) === "link") {
      const metrics = richLineLinkMetrics(line) || shareCanvasLinkMetrics(ctx, richLineText(line), fontSize, maxWidth);
      const cardY = baselineY - fontSize + SHARE_CANVAS_CHAT_STYLE.siteCard.marginY;
      drawShareCanvasSiteCard(ctx, line, x, cardY, maxWidth, fontSize);
      baselineY = cardY + metrics.height + shareCanvasSiteCardBottomGap(lines, lineIndex) + lineHeight - fontSize;
      return;
    }
    let cursorX = x;
    richLineRuns(line).forEach((run) => {
      const runType = String((run && run.type) || "");
      const fillStyle = runType === "link" || runType === "md_bullet"
        ? linkFillStyle
        : defaultFillStyle;
      ctx.setFillStyle(fillStyle);
      ctx.fillText(run.text, cursorX, baselineY);
      cursorX += richRunWidth(ctx, run, fontSize);
    });
    baselineY += lineHeight;
  });
}

function getCenteredUserBubbleTextOffset(message) {
  if (!message || !message.isUser) return Number(message && message.bubblePadTop) || 0;
  const textHeight = Math.max(message.fontSize, shareCanvasRichTextHeight(message.lines, message.lineHeight, message.fontSize) - (message.lineHeight - message.fontSize));
  return Math.max(0, (message.bubbleHeight - textHeight) / 2);
}

function buildShareImageCanvasSections(ctx, messages) {
  const contentLeft = SHARE_CANVAS_CHAT_STYLE.contentLeft;
  const contentWidth = SHARE_CANVAS_WIDTH - contentLeft * 2;
  const style = SHARE_CANVAS_CHAT_STYLE;
  const userFontSize = style.user.fontSize;
  const assistantFontSize = style.assistant.fontSize;
  const referenceFontSize = style.reference.fontSize;
  const userLineHeight = style.user.lineHeight;
  const assistantLineHeight = style.assistant.lineHeight;
  const referenceLineHeight = style.reference.lineHeight;
  const userPadX = style.user.padX;
  const userPadTop = style.user.padTop;
  const userPadBottom = style.user.padBottom;
  const assistantPadX = style.assistant.padX;
  const assistantPadTop = style.assistant.padTop;
  const assistantPadBottom = style.assistant.padBottom;
  const referenceGap = style.reference.gap;
  const referenceBottomPadding = assistantPadTop;
  const userMaxWidth = style.user.maxWidth;
  const assistantMaxWidth = contentWidth;

  return (messages || []).map((message) => {
    const isUser = message.role === "user";
    const fontSize = isUser ? userFontSize : assistantFontSize;
    const lineHeight = isUser ? userLineHeight : assistantLineHeight;
    const bubblePadX = isUser ? userPadX : assistantPadX;
    const bubblePadTop = isUser ? userPadTop : assistantPadTop;
    const bubblePadBottom = isUser ? userPadBottom : assistantPadBottom;
    const maxBubbleWidth = isUser ? userMaxWidth : assistantMaxWidth;
    const maxTextWidth = maxBubbleWidth - bubblePadX * 2;
    setShareCanvasFontSize(ctx, fontSize);
    const contentParts = Array.isArray(message.contentParts) && message.contentParts.length
      ? message.contentParts
      : buildShareCanvasContentParts(message.content);
    const lines = wrapCanvasRichTextLines(ctx, contentParts, maxTextWidth, fontSize);
    const references = !isUser && Array.isArray(message.references) ? message.references : [];
    setShareCanvasFontSize(ctx, referenceFontSize);
    const referenceLines = buildShareReferenceLines(ctx, references, maxTextWidth, referenceFontSize);
    setShareCanvasFontSize(ctx, fontSize);
    const measuredWidth = Math.max(0, ...lines.map((line) => richLineType(line) === "link" ? maxTextWidth : richLineWidth(ctx, line, fontSize)));
    setShareCanvasFontSize(ctx, referenceFontSize);
    const measuredReferenceWidth = Math.max(0, ...referenceLines.map((line) => canvasTextWidth(ctx, line, referenceFontSize)));
    const bubbleWidth = isUser
      ? Math.max(120, Math.min(Math.max(measuredWidth, measuredReferenceWidth) + bubblePadX * 2, maxBubbleWidth))
      : maxBubbleWidth;
    const referenceHeight = referenceLines.length
      ? referenceGap + referenceLines.length * referenceLineHeight + referenceBottomPadding
      : 0;
    const textHeight = shareCanvasRichTextHeight(lines, lineHeight, fontSize);
    const bubbleHeight = Math.max(88, bubblePadTop + textHeight + referenceHeight + bubblePadBottom);
    return {
      isUser,
      lines,
      referenceLines,
      bubbleWidth,
      bubbleHeight,
      bubblePadX,
      bubblePadTop,
      fontSize,
      lineHeight,
      textHeight,
      referenceFontSize,
      referenceLineHeight,
      referenceGap
    };
  }).filter((message) => message.lines.length);
}

function measureShareImageCanvasHeight(ctx, messages) {
  const visibleMessages = buildShareImageCanvasSections(ctx, messages);
  const messageBlockHeight = visibleMessages.reduce((total, message) => total + message.bubbleHeight + SHARE_CANVAS_CHAT_STYLE.messageGap, 0);
  return Math.ceil(Math.max(SHARE_CANVAS_MIN_HEIGHT, SHARE_CANVAS_CHAT_STYLE.messageTop + messageBlockHeight + 420));
}

function drawShareImageCanvas(ctx, messages, canvasHeight, qrImagePath) {
  if (!ctx) return;
  const style = SHARE_CANVAS_CHAT_STYLE;
  const contentLeft = style.contentLeft;
  const contentWidth = SHARE_CANVAS_WIDTH - contentLeft * 2;
  const qrPanelY = canvasHeight - 392;
  const qrY = qrPanelY + 28;
  const visibleMessages = buildShareImageCanvasSections(ctx, messages);

  drawShareCanvasPageBackground(ctx, canvasHeight);
  drawShareCanvasTopbar(ctx);

  let y = style.messageTop;
  visibleMessages.forEach((message) => {
    const x = message.isUser ? contentLeft + contentWidth - message.bubbleWidth : contentLeft;
    ctx.setFillStyle(message.isUser
      ? createShareCanvasLinearGradient(ctx, x, y, x + message.bubbleWidth, y + message.bubbleHeight, [
          { offset: 0, color: style.user.gradientStart },
          { offset: 0.56, color: style.user.gradientMiddle },
          { offset: 1, color: style.user.gradientEnd }
        ], style.user.gradientMiddle)
      : style.assistant.background);
    drawRoundRect(ctx, x, y, message.bubbleWidth, message.bubbleHeight, message.isUser ? style.user.radius : style.assistant.radius);
    setShareCanvasFontSize(ctx, message.fontSize);
    const textX = x + message.bubblePadX;
    const textY = y + getCenteredUserBubbleTextOffset(message) + message.fontSize;
    drawCanvasRichTextLines(ctx, message.lines, textX, textY, message.lineHeight, {
      defaultFillStyle: message.isUser ? style.user.textColor : style.assistant.textColor,
      linkFillStyle: message.isUser ? style.user.textColor : style.linkColor,
      fontSize: message.fontSize,
      maxWidth: Math.max(0, message.bubbleWidth - message.bubblePadX * 2)
    });
    if (message.referenceLines.length) {
      ctx.setFillStyle(style.linkColor);
      setShareCanvasFontSize(ctx, message.referenceFontSize);
      const referenceY = textY + message.textHeight + message.referenceGap + message.referenceFontSize;
      drawCanvasTextLines(ctx, message.referenceLines, textX, referenceY, message.referenceLineHeight);
    }
    y += message.bubbleHeight + style.messageGap;
  });

  ctx.drawImage(qrImagePath, SHARE_CANVAS_WIDTH / 2 - 70, qrY, 140, 140);
  if (typeof ctx.setTextAlign === "function") ctx.setTextAlign("center");
  ctx.setFillStyle(style.qrTextColor);
  setShareCanvasFontSize(ctx, 22);
  ctx.fillText("扫描二维码，和小玩子继续聊", SHARE_CANVAS_WIDTH / 2, qrPanelY + 196);
  if (typeof ctx.setTextAlign === "function") ctx.setTextAlign("left");
}

function messageId(role) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRequestMessage(error, fallback) {
  const message = String(error && (error.message || error.detail || error.content) || "").trim();
  if (/^request:fail/i.test(message)) return fallback || "网络连接失败，请稍后重试。";
  if (/^request\.fail$/i.test(message)) return fallback || "网络连接失败，请稍后重试。";
  if (/^Request failed with status code \d+$/i.test(message)) return fallback || "请求失败";
  return message || fallback || "请求失败";
}

function getAttachmentRequestMessage(error, fallback) {
  const message = getRequestMessage(error, fallback);
  const statusCode = Number(error && error.statusCode || 0);
  const url = String(error && error.url || "").trim();
  const path = url.replace(/^https?:\/\/[^/]+/i, "");
  if (statusCode && path) return `${message}（${statusCode} ${path}）`;
  if (statusCode) return `${message}（${statusCode}）`;
  return message;
}

function isProRequiredError(error) {
  return Number(error && error.statusCode) === 402 || (error && error.data && error.data.code === "PRO_REQUIRED");
}

function formatFileSize(size) {
  const value = Number(size || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 102.4) / 10}MB`;
  if (value >= 1024) return `${Math.round(value / 1024)}KB`;
  return `${value}B`;
}

function attachmentName(file, fallback) {
  const source = file || {};
  const rawName = String(source.name || source.fileName || source.tempFilePath || source.path || fallback || "附件").trim();
  const parts = rawName.split("/");
  return parts[parts.length - 1] || fallback || "附件";
}

function attachmentKindLabel(type) {
  if (type === "camera") return "照片";
  if (type === "image") return "图片";
  if (type === "file") return "文件";
  return "附件";
}

function inferAttachmentMediaType(file, type) {
  const source = file || {};
  const rawType = String(source.mimeType || source.type || "").trim().toLowerCase();
  if (rawType.indexOf("/") > 0) return rawType;
  const path = String(source.name || source.fileName || source.tempFilePath || source.path || "").toLowerCase();
  if (/\.png(?:$|\?)/.test(path)) return "image/png";
  if (/\.webp(?:$|\?)/.test(path)) return "image/webp";
  if (/\.gif(?:$|\?)/.test(path)) return "image/gif";
  if (/\.jpe?g(?:$|\?)/.test(path)) return "image/jpeg";
  if (type === "camera" || type === "image" || rawType === "image") return "image/jpeg";
  return "application/octet-stream";
}

function selectedAttachmentPath(file) {
  return String((file && (file.tempFilePath || file.path)) || "").trim();
}

function readAttachmentDataUrl(file, type) {
  const path = selectedAttachmentPath(file);
  const mediaType = inferAttachmentMediaType(file, type);
  if (!path) return Promise.reject(new Error("没有读取到附件路径，请重新选择"));
  if (!/^image\//i.test(mediaType)) return Promise.reject(new Error("当前仅支持图片或图片文件解析"));
  if (!wx.getFileSystemManager) return Promise.reject(new Error("当前微信版本不支持读取附件"));
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: "base64",
      success(result) {
        const base64 = String(result && result.data || "").replace(/\s+/g, "");
        if (!base64) {
          reject(new Error("附件读取为空，请重新选择"));
          return;
        }
        resolve(`data:${mediaType};base64,${base64}`);
      },
      fail(error) {
        reject(new Error(getRequestMessage(error, "附件读取失败，请重试")));
      }
    });
  });
}

function chooseNativeAttachment(type) {
  return new Promise((resolve, reject) => {
    if (type === "camera" || type === "image") {
      const sourceType = type === "camera" ? ["camera"] : ["album"];
      if (wx.chooseMedia) {
        wx.chooseMedia({
          count: 1,
          mediaType: ["image"],
          sourceType,
          success(result) {
            const file = result && Array.isArray(result.tempFiles) && result.tempFiles[0];
            file ? resolve(file) : reject(new Error("没有选择图片"));
          },
          fail: reject
        });
        return;
      }
      if (wx.chooseImage) {
        wx.chooseImage({
          count: 1,
          sourceType,
          success(result) {
            const file = result && Array.isArray(result.tempFiles) && result.tempFiles[0]
              ? result.tempFiles[0]
              : { tempFilePath: result && Array.isArray(result.tempFilePaths) && result.tempFilePaths[0] };
            file && selectedAttachmentPath(file) ? resolve(file) : reject(new Error("没有选择图片"));
          },
          fail: reject
        });
        return;
      }
      reject(new Error("当前微信版本不支持选择图片"));
      return;
    }
    if (type === "file" && wx.chooseMessageFile) {
      wx.chooseMessageFile({
        count: 1,
        type: "file",
        success(result) {
          const file = result && Array.isArray(result.tempFiles) && result.tempFiles[0];
          file ? resolve(file) : reject(new Error("没有选择文件"));
        },
        fail: reject
      });
      return;
    }
    reject(new Error("当前微信版本不支持选择文件"));
  });
}

function recognizeNativeAttachment(type, file) {
  const dataUrl = String(file && file.dataUrl || "").trim();
  const dataUrlPromise = dataUrl ? Promise.resolve(dataUrl) : readAttachmentDataUrl(file, type);
  return dataUrlPromise.then((resolvedDataUrl) => request({
    method: "POST",
    url: "/api/wechat-mini/xiaowanzi/attachments/recognize",
    data: {
      dataUrl: resolvedDataUrl,
      fileName: attachmentName(file, attachmentKindLabel(type)),
      prompt: "请识别这张图片里的文字、场景和关键信息，方便小玩子继续回答。"
    }
  }).then((payload) => ({
    dataUrl: resolvedDataUrl,
    content: String(payload && (payload.content || payload.message || payload.detail) || "").trim()
  })));
}

function buildAttachmentState(type, file, recognition) {
  const label = attachmentKindLabel(type);
  const name = attachmentName(file, label);
  const size = formatFileSize(file && file.size);
  const path = String((file && (file.tempFilePath || file.path)) || "").trim();
  const suffix = size ? ` · ${size}` : "";
  const recognizedContent = String(recognition || "").trim();
  return {
    attachmentPreviewText: `已解析${label}：${name}${suffix}`,
    attachmentContextText: [
      `用户在小程序端选择并解析了${label}附件。`,
      `附件名称：${name}。`,
      size ? `附件大小：${size}。` : "",
      path ? `本地临时路径：${path}。` : "",
      recognizedContent ? `图片识别结果：${recognizedContent}` : ""
    ].filter(Boolean).join("")
  };
}

function buildPendingAttachment(type, file, dataUrl) {
  const label = attachmentKindLabel(type);
  const name = attachmentName(file, label);
  const size = formatFileSize(file && file.size);
  const path = selectedAttachmentPath(file);
  return {
    type,
    label,
    name,
    size,
    path,
    dataUrl,
    mediaType: inferAttachmentMediaType(file, type),
    previewText: `已上传${label}：${name}${size ? ` · ${size}` : ""}`
  };
}

function normalizePendingAttachments(value) {
  if (!Array.isArray(value)) return value ? [value] : [];
  return value.filter((item) => item && typeof item === "object");
}

function buildPendingAttachmentPreviewText(attachments) {
  const items = normalizePendingAttachments(attachments);
  if (!items.length) return "";
  if (items.length === 1) return items[0].previewText || `已上传${items[0].label || "附件"}：${items[0].name || "附件"}`;
  return `已上传 ${items.length} 个附件`;
}

function recognizePendingAttachments(attachments) {
  const items = normalizePendingAttachments(attachments);
  return Promise.all(items.map((attachment) => recognizeNativeAttachment(attachment.type, attachment)
    .then((result) => buildAttachmentState(attachment.type, attachment, result && result.content).attachmentContextText)))
    .then((parts) => parts.filter(Boolean).join("\n\n"));
}

function hasComposerContent(data) {
  return Boolean(
    String(data && (data.inputValue || data.selectedHomePrompt) || "").trim()
    || String(data && data.attachmentContextText || "").trim()
    || normalizePendingAttachments(data && data.pendingAttachments).length
    || data && data.pendingAttachment
  );
}

function buildComposerContent(text, attachmentContextText) {
  return [
    String(text || "").trim(),
    String(attachmentContextText || "").trim()
  ].filter(Boolean).join("\n\n");
}

function normalizeSpeechText(result) {
  return String(result && (result.result || result.text || result.content) || "").replace(/\s+/g, " ").trim();
}

function mergeSpeechInput(currentValue, recognizedText) {
  const current = String(currentValue || "").trim();
  const next = String(recognizedText || "").trim();
  if (!next) return current;
  if (!current) return next;
  return `${current}${/[，。！？!?、,.\s]$/.test(current) ? "" : " "}${next}`;
}

function memoryEnabledFromStorage() {
  const enabled = wx.getStorageSync(MEMORY_ENABLED_KEY);
  return enabled === "" || (enabled !== "0" && enabled !== false);
}

Page({
  data: {
    childContextStatus: "",
    topbarHeight: 88,
    chatTop: 168,
    childBoundaryTop: 158,
    shellLogoTop: 10,
    shellLogoHeight: 32,
    shellAvatarTop: 4,
    shellAvatarHeight: 40,
    shellKnowledgeTop: 7,
    shellKnowledgeHeight: 29,
    shellKnowledgeWidth: 86,
    shellKnowledgeRight: 98,
    sharePreviewTop: 104,
    knowledgePillCollapsed: false,
    topbarAvatarIndex: 0,
    topbarAvatarClickCount: 0,
    topbarAvatarSrc: XIAOWANZI_TOPBAR_AVATARS[0],
    activeChildId: "",
    activeChildName: "关联孩子",
    activeChildMeta: "补全档案后，小玩子会更懂你的上下文",
    activeChildAvatar: XIAOWANZI_AVATAR_IMAGE,
    activeChildReady: false,
    childHintText: "可选：关联孩子档案后，回答会更个性化",
    childActionLabel: "关联",
    homeMode: true,
    messages: [DEFAULT_ASSISTANT_MESSAGE],
    inputValue: "",
    inputReady: false,
    inputFocused: false,
    selectedHomePrompt: "",
    homePromptPreview: HOME_PROMPT_PREVIEW,
    homeConversationMessages: [],
    quickPrompts: QUICK_PROMPTS,
    homePromptGrade: "__initial__",
    sending: false,
    pendingMessageId: "",
    sendPressing: false,
    historyDrawerOpen: false,
    historyCards: [],
    historyDeleteCardId: "",
    childPickerOpen: false,
    childPickerCards: [],
    attachmentMenuOpen: false,
    shareRevealMessageId: "",
    shareSelectionMode: false,
    selectedMessageIds: [],
    selectedMessageMap: {},
    shareRoundCount: 0,
    selectedConversationShareId: "",
    selectedSharePreparing: false,
    selectedShareError: "",
    selectedShareKey: "",
    shareImageGenerating: false,
    shareCanvasMounted: false,
    shareCanvasHeight: SHARE_CANVAS_MIN_HEIGHT,
    shareImagePreviewOpen: false,
    shareImagePath: "",
    toastText: "",
    voiceListening: false,
    voiceHolding: false,
    pendingAttachments: [],
    attachmentPreviewText: "",
    attachmentContextText: "",
    canUseBot: true,
    isLoggedIn: false,
    xiaowanziLoginRequired: false,
    bindingPhone: false,
    statusText: "准备就绪",
    errorText: "",
    actionLabel: "",
    actionType: "",
    scrollIntoView: "",
    settingsPanelOpen: false,
    settingsPanelView: "archive",
    settingsProfilePanelSupported: true,
    profilePanelTop: 30,
    profileHeaderHeight: 32,
    archiveChildren: [],
    archiveHasChildren: false,
    archiveDraft: {},
    archiveInsightGrade: "",
    archiveProfileStatus: "待补全",
    archiveRelationOptions: [],
    archiveRegionOptions: [],
    archiveRegionIndex: 0,
    archiveStageOptions: [],
    archiveStageIndex: 0,
    archiveStage: "学前",
    archiveGradeOptions: [],
    archiveStageGradeColumns: [],
    archiveStageGradeValue: [0, 0],
    archiveGradeDisplayText: "请选择年级",
    archiveGradeSelectOptions: [],
    archiveGradeName: "小班",
    archiveGradeDropdownOpen: false,
    archiveTagOptions: [],
    profilePanelMessage: ""
  },

  shareRevealTimer: null,
  nativeThinkingStepTimer: null,
  nativeReplyRevealTimer: null,
  nativeReplyRevealQueue: "",
  nativeReplyDisplayedReply: "",
  nativeReplyRevealMessageId: "",
  nativeReplyFinalReply: "",
  nativeReplyFinalShareable: false,

  onLoad(options = {}) {
    this._initialOptions = options;
    enableShareMenu();
    if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: "" });
    setSelectedTab(this, 2, { hidden: true });
    this.requireXiaowanziLogin();
    this.initializeXiaowanzi(options);
  },

  onUnload() {
    this.clearShareRevealTimer();
    this.clearNativeThinkingStepTimer();
    this.clearNativeReplyRevealTimer();
  },

  initializeXiaowanzi(options = {}) {
    const entryTriggered = consumeXiaowanziEntryTrigger();
    this.restoreTopbarAvatar({ advance: entryTriggered });
    this.syncNativeShellState();
    this.loadHomeTopicPrompts();
    this.loadNativeHistory();
    this.ensureBotReady({ quiet: true });
    this.applyInitialPanel(options);
  },

  onShow() {
    enableShareMenu();
    setSelectedTab(this, 2, { hidden: true });
    this.requireXiaowanziLogin();
    const entryTriggered = consumeXiaowanziEntryTrigger();
    if (entryTriggered) this.restoreTopbarAvatar({ advance: true });
    this.syncNativeShellState();
    this.loadHomeTopicPrompts();
  },

  requireXiaowanziLogin() {
    if (getToken()) {
      this.setData({ isLoggedIn: true, xiaowanziLoginRequired: false, profilePanelMessage: "" });
      return true;
    }
    this.setData({
      ...buildNativeShellData(),
      isLoggedIn: false,
      xiaowanziLoginRequired: false,
      canUseBot: false,
      sending: false,
      pendingMessageId: "",
      sendPressing: false,
      errorText: "",
      actionLabel: "",
      actionType: ""
    });
    return false;
  },

  restoreTopbarAvatar(options = {}) {
    const currentState = loadTopbarAvatarState();
    const state = options && options.advance ? advanceTopbarAvatarState(currentState) : currentState;
    persistTopbarAvatarState(state);
    this.setData({
      topbarAvatarIndex: state.avatarIndex,
      topbarAvatarClickCount: state.avatarClickCount,
      topbarAvatarSrc: getTopbarAvatarSrc(state.avatarIndex)
    });
  },

  syncNativeShellState() {
    this.setData({
      ...buildNativeShellData(),
      ...buildActiveChildSummary()
    });
    this.refreshHistoryCards();
  },

  refreshHistoryCards(messages = this.data.messages) {
    syncNativeSessionChildTags();
    const childName = this.data.activeChildReady ? this.data.activeChildName : "";
    const sessionCards = buildSessionHistoryCards(childName);
    const historyCards = sessionCards.length ? sessionCards : buildHistoryCards(messages, childName);
    const payload = { historyCards };
    if (this.data.historyDeleteCardId && !historyCards.some((item) => item.id === this.data.historyDeleteCardId)) {
      payload.historyDeleteCardId = "";
    }
    this.setData({
      ...payload
    });
  },

  loadHomeTopicPrompts() {
    const activeChild = activeChildProfile();
    const grade = String(activeChild && activeChild.grade || "");
    if (this.data.homePromptGrade === grade && this.data.quickPrompts.length) return Promise.resolve(this.data.quickPrompts);
    this.setData({
      ...buildHomePromptState(loadCachedHomePrompts()),
      homePromptGrade: grade
    });
    if (!wx.request) return Promise.resolve(this.data.quickPrompts);
    return request({ url: getHomeTopicRequestUrl() })
      .then((data) => {
        const topics = Array.isArray(data && data.topics)
          ? data.topics
          : Array.isArray(data && data.data)
            ? data.data
            : [];
        const prompts = topics.map(topicPromptFromItem).filter(Boolean);
        if (!prompts.length) return this.data.quickPrompts;
        saveCachedHomePrompts(prompts);
        this.setData(buildHomePromptState(prompts));
        return this.data.quickPrompts;
      })
      .catch(() => this.data.quickPrompts);
  },

  applyInitialPanel(options) {
    const panel = String((options && options.panel) || "");
    const action = String((options && options.action) || "");
    if (panel === "archive" && action === "add") {
      this.openArchiveCreatePanel();
      return;
    }
    if (panel === "archive") {
      this.openArchivePanel();
    }
  },

  ensureBotReady(options = {}) {
    const quiet = Boolean(options && options.quiet);
    if (!getToken()) {
      if (!quiet) this.requireXiaowanziLogin();
      return Promise.resolve(false);
    }
    return request({
      method: "POST",
      url: "/api/v1/tutorbot",
      data: {
        bot_id: BOT_ID,
        name: "小玩子调试",
        description: "前台小玩子调试实例",
        model: "chat_manager_agent"
      }
    })
      .then(() => {
        this.setData({ canUseBot: true, statusText: "随时可用", errorText: "", actionLabel: "", actionType: "" });
        return true;
      })
      .catch((error) => {
        if (!quiet) this.handleChatError(error, "AI 服务暂不可用");
        return false;
      });
  },

  loadNativeHistory() {
    const activeChild = activeChildProfile();
    const activeSessionId = String(wx.getStorageSync(activeSessionKey()) || (currentUserStorageScope() ? "" : wx.getStorageSync(NATIVE_ACTIVE_SESSION_KEY)) || "").trim();
    const sessionMessages = readNativeSessionMessages(activeSessionId);
    if (sessionMessages.length) {
      this.setData({ messages: sessionMessages, homeMode: false, homeConversationMessages: [], scrollIntoView: sessionMessages[sessionMessages.length - 1].id, knowledgePillCollapsed: true });
      saveNativeSession(activeChild && activeChild.id, activeChild && activeChild.displayName, sessionMessages);
      this.refreshHistoryCards(sessionMessages);
      return Promise.resolve();
    }
    const cached = readCachedHistory(activeChild && activeChild.id);
    if (cached.length) {
      this.setData({ messages: cached, homeMode: false, homeConversationMessages: [], scrollIntoView: cached[cached.length - 1].id, knowledgePillCollapsed: true });
      saveNativeSession(activeChild && activeChild.id, activeChild && activeChild.displayName, cached);
      this.refreshHistoryCards(cached);
    }
    if (!getToken()) return Promise.resolve();
    return request({ url: `/api/v1/tutorbot/${BOT_ID}/history?limit=100` })
      .then((data) => {
        const messages = (Array.isArray(data) ? data : []).map(normalizeMessage).filter(Boolean);
        if (!messages.length) return;
        this.setData({ messages, homeMode: false, homeConversationMessages: [], scrollIntoView: messages[messages.length - 1].id, knowledgePillCollapsed: true });
        saveNativeSession(activeChild && activeChild.id, activeChild && activeChild.displayName, messages);
        this.refreshHistoryCards(messages);
      })
      .catch(() => {});
  },

  updateInput(event) {
    const inputValue = String(event && event.detail && event.detail.value || "");
    const selectedHomePrompt = this.data.selectedHomePrompt ? inputValue.trim() : "";
    this.setData({
      inputValue,
      inputReady: hasComposerContent({ ...this.data, inputValue, selectedHomePrompt }),
      selectedHomePrompt,
      sendPressing: false,
      attachmentMenuOpen: false,
      voiceListening: false,
      voiceHolding: false
    });
  },

  handleInputFocus() {
    this.setData({ inputFocused: true });
  },

  handleInputBlur() {
    this.setData({ inputFocused: false });
  },

  toggleVoiceInput() {
    if (this.data.sending) return;
    this.setData({ voiceListening: false, voiceHolding: false });
    this.showToast("语音输入正在开发中");
  },

  startVoicePress() {
    this.toggleVoiceInput();
  },

  endVoicePress() {
    this.setData({ voiceListening: false, voiceHolding: false });
  },

  ensureVoiceRecognitionManager() {
    this.showToast("语音输入正在开发中");
    return null;
  },

  startVoiceRecognition(holding) {
    this.setData({ voiceListening: false, voiceHolding: false });
    this.showToast("语音输入正在开发中");
  },

  stopVoiceRecognition() {
    this.setData({ voiceListening: false, voiceHolding: false });
  },

  applyVoiceRecognizedText(result, finalResult) {
    const recognizedText = normalizeSpeechText(result || {});
    if (!recognizedText) {
      if (finalResult) this.showToast("没有识别到内容");
      return;
    }
    const baseInput = this.voiceRecognitionBaseInput === undefined ? this.data.inputValue : this.voiceRecognitionBaseInput;
    const inputValue = mergeSpeechInput(baseInput, recognizedText);
    const selectedHomePrompt = this.data.selectedHomePrompt ? inputValue.trim() : "";
    this.setData({
      inputValue,
      selectedHomePrompt,
      inputReady: hasComposerContent({ ...this.data, inputValue, selectedHomePrompt })
    });
    if (finalResult) this.showToast("已转成文字");
  },

  useQuickPrompt(event) {
    const value = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value || "");
    const prompt = value.trim();
    if (!prompt || this.data.sending) return;
    this.setData({ inputValue: "", inputReady: true, selectedHomePrompt: prompt, sendPressing: false, attachmentMenuOpen: false, voiceListening: false, voiceHolding: false, errorText: "", actionLabel: "", actionType: "", scrollIntoView: "xiaowanziChildHint" }, () => {
      this.handleSend();
    });
  },

  startSendPress() {
    if (!this.data.sending && !this.data.inputReady) return;
    this.setData({ sendPressing: true });
  },

  endSendPress() {
    if (this.data.sendPressing) this.setData({ sendPressing: false });
  },

  handleSend() {
    if (this.data.sending) {
      this.setData({ sendPressing: false });
      this.stopNativeResponse();
      return;
    }
    const visibleContent = String(this.data.inputValue || this.data.selectedHomePrompt || "").trim();
    const attachmentPreviewText = this.data.attachmentPreviewText;
    const attachmentContextText = this.data.attachmentContextText;
    const pendingAttachments = normalizePendingAttachments(this.data.pendingAttachments);
    const hasPendingAttachments = pendingAttachments.length > 0;
    if (!hasComposerContent({ inputValue: visibleContent, attachmentContextText, pendingAttachments })) {
      this.setData({ sendPressing: false });
      return;
    }
    if (!getToken()) {
      this.setData({ sendPressing: false });
      return;
    }
    const activeChild = activeChildProfile();

    const keepHomeConversation = Boolean(this.data.homeMode);
    const visibleMessageContent = visibleContent || (hasPendingAttachments ? "帮我解读下图片内容" : attachmentPreviewText || "已添加附件");
    const userMessage = {
      id: messageId("user"),
      role: "user",
      content: visibleMessageContent,
      contentParts: buildMessageContentParts(visibleMessageContent),
      attachments: normalizeMessageAttachments(pendingAttachments),
      shareable: false,
      ts: new Date().toISOString()
    };
    const initialThinkingSteps = buildInitialXiaowanziThinkingSteps();
    const pendingMessage = applyXiaowanziThinkingActiveStep({
      id: messageId("assistant"),
      role: "assistant",
      content: "小玩子正在思考中...",
      contentParts: buildMessageContentParts("小玩子正在思考中..."),
      pending: true,
      thinkingLabel: "小玩子处理中",
      thinkingSteps: initialThinkingSteps,
      shareable: false,
      ts: new Date(Date.now() + 1).toISOString()
    }, 0, 0);
    const nextMessages = this.data.messages.concat(userMessage, pendingMessage);
    this.resetNativeReplyReveal(pendingMessage);
    this.setData({
      messages: nextMessages,
      homeConversationMessages: keepHomeConversation ? buildHomeConversationMessages(nextMessages) : [],
      inputValue: "",
      inputReady: false,
      selectedHomePrompt: "",
      pendingAttachments: [],
      attachmentPreviewText: "",
      attachmentContextText: "",
      homeMode: keepHomeConversation,
      sending: true,
      pendingMessageId: pendingMessage.id,
      sendPressing: false,
      attachmentMenuOpen: false,
      voiceListening: false,
      voiceHolding: false,
      statusText: "正在思考",
      errorText: "",
      actionLabel: "",
      actionType: "",
      childContextStatus: "",
      scrollIntoView: pendingMessage.id,
      knowledgePillCollapsed: true
    });
    this.startNativeThinkingStepCycle(pendingMessage);

    const attachmentContextPromise = hasPendingAttachments
      ? recognizePendingAttachments(pendingAttachments)
      : Promise.resolve(attachmentContextText);

    attachmentContextPromise
      .then((resolvedAttachmentContextText) => {
        const content = buildComposerContent(visibleContent || (hasPendingAttachments ? "帮我解读下图片内容" : ""), resolvedAttachmentContextText);
        if (!content) throw new Error("请先输入问题或上传图片");
        return this.buildContextualContent(activeChild, content).then((contextPayload) => ({ ...contextPayload, content }));
      })
      .then(({ contextualContent, profileSummary, memoryEnabled, content }) => {
        let streamedReply = "";
        return requestXiaowanziStream({
          content: contextualContent,
          onContext: (payload) => {
            this.updateNativeAssistantThinkingTrace(pendingMessage, payload);
          },
          onDelta: (delta) => {
            streamedReply += String(delta || "");
            this.appendNativeAssistantDelta(pendingMessage, delta);
          }
        }).then((payload) => ({ payload, profileSummary, memoryEnabled, content, streamedReply }));
      })
      .then(({ payload, profileSummary, memoryEnabled, content, streamedReply }) => {
        if (this.data.pendingMessageId !== pendingMessage.id) return;
        const streamedContent = String(streamedReply || "").trim();
        const reply = String(payload && (payload.content || payload.message || payload.detail) || streamedContent).trim() || "小玩子暂时没有返回内容。";
        const assistantMessage = {
          id: pendingMessage.id,
          role: "assistant",
          content: reply,
          contentParts: buildMessageContentParts(reply),
          shareable: isShareableAssistantMessageValue("assistant", reply, false, false),
          ts: new Date().toISOString()
        };
        const currentMessages = this.data.messages;
        const savedMessages = currentMessages.map((item) => item.id === pendingMessage.id ? assistantMessage : item);
        if (streamedContent) {
          this.completeNativeAssistantReveal(pendingMessage, reply);
        }
        this.setData({
          ...(streamedContent ? {} : {
            messages: savedMessages,
            homeConversationMessages: this.data.homeMode ? buildHomeConversationMessages(savedMessages) : []
          }),
          sending: false,
          pendingMessageId: "",
          canUseBot: true,
          statusText: streamedContent && this.nativeReplyRevealQueue ? "正在回复" : "随时可用",
          scrollIntoView: assistantMessage.id
        });
        if (!this.data.pendingMessageId) this.clearNativeThinkingStepTimer();
        this.refreshHistoryCards(savedMessages);
        saveNativeSession(activeChild && activeChild.id, activeChild && activeChild.displayName, savedMessages);
        if (activeChild && memoryEnabled) {
          this.mergeChildMemory(activeChild.id, profileSummary, content, reply);
        }
      })
      .catch((error) => {
        if (this.data.pendingMessageId !== pendingMessage.id) return;
        this.clearNativeThinkingStepTimer();
        this.clearNativeReplyRevealTimer();
        const messages = this.data.messages.map((item) => {
          if (item.id !== pendingMessage.id) return item;
          return {
            id: pendingMessage.id,
            role: "assistant",
            content: getRequestMessage(error, "请求失败，请稍后重试。"),
            contentParts: buildMessageContentParts(getRequestMessage(error, "请求失败，请稍后重试。")),
            error: true,
            shareable: false,
            ts: new Date().toISOString()
          };
        });
        this.setData({
          messages,
          homeConversationMessages: this.data.homeMode ? buildHomeConversationMessages(messages) : [],
          sending: false,
          pendingMessageId: "",
          sendPressing: false,
          inputValue: visibleContent,
          pendingAttachments,
          attachmentPreviewText,
          attachmentContextText,
          inputReady: hasComposerContent({ inputValue: visibleContent, attachmentContextText, pendingAttachments }),
          scrollIntoView: pendingMessage.id
        });
        this.refreshHistoryCards(messages);
        saveNativeSession(activeChild && activeChild.id, activeChild && activeChild.displayName, messages);
        this.handleChatError(error, "请求失败，请稍后重试。");
      });
  },

  updateNativeAssistantThinkingTrace(pendingMessage, payload) {
    if (!pendingMessage || this.data.pendingMessageId !== pendingMessage.id) return;
    const thinkingSteps = normalizeXiaowanziThinkingSteps(payload && payload.trace);
    if (!thinkingSteps.length) return;
    const messages = this.data.messages.map((item) => {
      if (item.id !== pendingMessage.id || !item.pending) return item;
      return applyXiaowanziThinkingActiveStep({
        ...item,
        thinkingLabel: "小玩子处理中",
        thinkingSteps
      }, 0, Number(item.thinkingTick || 0) + 1);
    });
    this.setData({
      messages,
      homeConversationMessages: this.data.homeMode ? buildHomeConversationMessages(messages) : [],
      statusText: thinkingSteps[0] && thinkingSteps[0].text || "正在思考"
    });
  },

  startNativeThinkingStepCycle(pendingMessage) {
    this.clearNativeThinkingStepTimer();
    if (!pendingMessage || !pendingMessage.id) return;
    this.nativeThinkingStepTimer = setInterval(() => {
      this.advanceNativeThinkingStep(pendingMessage);
    }, XIAOWANZI_THINKING_STEP_INTERVAL_MS);
  },

  clearNativeThinkingStepTimer() {
    if (this.nativeThinkingStepTimer) clearInterval(this.nativeThinkingStepTimer);
    this.nativeThinkingStepTimer = null;
  },

  advanceNativeThinkingStep(pendingMessage) {
    if (!pendingMessage || this.data.pendingMessageId !== pendingMessage.id) {
      this.clearNativeThinkingStepTimer();
      return;
    }
    let changed = false;
    const messages = this.data.messages.map((item) => {
      if (item.id !== pendingMessage.id || !item.pending) return item;
      const steps = Array.isArray(item.thinkingSteps) ? item.thinkingSteps : [];
      if (steps.length < 2) return item;
      const currentIndex = Math.max(0, Math.min(steps.length - 1, Number(item.thinkingActiveStepIndex || 0)));
      if (currentIndex >= steps.length - 1) return item;
      changed = true;
      const nextIndex = currentIndex + 1;
      return applyXiaowanziThinkingActiveStep(item, nextIndex, Number(item.thinkingTick || 0) + 1);
    });
    if (!changed) return;
    this.setData({
      messages,
      homeConversationMessages: this.data.homeMode ? buildHomeConversationMessages(messages) : []
    });
  },

  appendNativeAssistantDelta(pendingMessage, delta) {
    if (!pendingMessage || this.data.pendingMessageId !== pendingMessage.id) return;
    const value = String(delta || "");
    if (!value) return;
    this.clearNativeThinkingStepTimer();
    if (this.nativeReplyRevealMessageId !== pendingMessage.id) this.resetNativeReplyReveal(pendingMessage);
    this.nativeReplyRevealQueue = `${String(this.nativeReplyRevealQueue || "")}${value}`;
    this.revealNativeAssistantQueuedText(pendingMessage, !this.nativeReplyDisplayedReply);
  },

  resetNativeReplyReveal(pendingMessage) {
    this.clearNativeReplyRevealTimer();
    this.nativeReplyRevealQueue = "";
    this.nativeReplyDisplayedReply = "";
    this.nativeReplyRevealMessageId = pendingMessage && pendingMessage.id || "";
    this.nativeReplyFinalReply = "";
    this.nativeReplyFinalShareable = false;
  },

  clearNativeReplyRevealTimer() {
    if (this.nativeReplyRevealTimer) clearTimeout(this.nativeReplyRevealTimer);
    this.nativeReplyRevealTimer = null;
  },

  canUpdateNativeReplyReveal(pendingMessage) {
    const messageId = pendingMessage && pendingMessage.id;
    if (!messageId || this.nativeReplyRevealMessageId !== messageId) return false;
    return this.data.messages.some((item) => item && item.id === messageId);
  },

  revealNativeAssistantQueuedText(pendingMessage, initial) {
    if (!this.canUpdateNativeReplyReveal(pendingMessage)) return "";
    const queue = String(this.nativeReplyRevealQueue || "");
    if (!queue) return String(this.nativeReplyDisplayedReply || "");
    const queueChars = Array.from(queue);
    const displayedLength = Array.from(String(this.nativeReplyDisplayedReply || "")).length;
    const step = initial
      ? NATIVE_REPLY_REVEAL_INITIAL_CHARS
      : (displayedLength % 5 === 0 ? 1 : NATIVE_REPLY_REVEAL_STEP_CHARS);
    const take = Math.min(queueChars.length, Math.max(1, step));
    const revealedText = queueChars.slice(0, take).join("");
    this.nativeReplyRevealQueue = queueChars.slice(take).join("");
    this.nativeReplyDisplayedReply = `${String(this.nativeReplyDisplayedReply || "")}${revealedText}`;
    const final = !this.nativeReplyRevealQueue && Boolean(this.nativeReplyFinalReply);
    const reply = final ? this.nativeReplyFinalReply : this.nativeReplyDisplayedReply;
    this.applyNativeAssistantReply(pendingMessage, reply, { final });
    if (final) {
      this.nativeReplyFinalReply = "";
      this.nativeReplyFinalShareable = false;
      this.nativeReplyRevealMessageId = "";
      return reply;
    }
    if (this.nativeReplyRevealQueue && !this.nativeReplyRevealTimer) {
      const shouldPause = /[。！？!?；;，,、：:]$/.test(revealedText) || (displayedLength > 0 && displayedLength % 24 === 0);
      this.nativeReplyRevealTimer = setTimeout(() => {
        this.nativeReplyRevealTimer = null;
        this.revealNativeAssistantQueuedText(pendingMessage, false);
      }, shouldPause ? NATIVE_REPLY_REVEAL_PAUSE_MS : NATIVE_REPLY_REVEAL_DELAY_MS);
    }
    return this.nativeReplyDisplayedReply;
  },

  completeNativeAssistantReveal(pendingMessage, reply) {
    if (!this.canUpdateNativeReplyReveal(pendingMessage)) return "";
    const finalReply = String(reply || "").trim();
    if (!finalReply) return "";
    const displayed = String(this.nativeReplyDisplayedReply || "");
    const combined = `${displayed}${String(this.nativeReplyRevealQueue || "")}`;
    this.nativeReplyFinalReply = finalReply;
    this.nativeReplyFinalShareable = isShareableAssistantMessageValue("assistant", finalReply, false, false);
    if (finalReply !== combined) {
      this.nativeReplyRevealQueue = finalReply.indexOf(displayed) === 0
        ? finalReply.slice(displayed.length)
        : finalReply;
      if (finalReply.indexOf(displayed) !== 0) this.nativeReplyDisplayedReply = "";
    }
    if (!this.nativeReplyDisplayedReply && this.nativeReplyRevealQueue) {
      return this.revealNativeAssistantQueuedText(pendingMessage, true);
    }
    if (!this.nativeReplyRevealQueue) {
      this.applyNativeAssistantReply(pendingMessage, finalReply, { final: true });
      this.nativeReplyFinalReply = "";
      this.nativeReplyFinalShareable = false;
      this.nativeReplyRevealMessageId = "";
      return finalReply;
    }
    return this.nativeReplyDisplayedReply;
  },

  flushNativeAssistantReveal(pendingMessage) {
    if (!this.canUpdateNativeReplyReveal(pendingMessage)) return "";
    this.clearNativeReplyRevealTimer();
    const queue = String(this.nativeReplyRevealQueue || "");
    if (queue) {
      this.nativeReplyRevealQueue = "";
      this.nativeReplyDisplayedReply = `${String(this.nativeReplyDisplayedReply || "")}${queue}`;
      this.applyNativeAssistantReply(pendingMessage, this.nativeReplyDisplayedReply);
    }
    return String(this.nativeReplyDisplayedReply || "");
  },

  applyNativeAssistantReply(pendingMessage, reply, options = {}) {
    if (!this.canUpdateNativeReplyReveal(pendingMessage)) return;
    const value = String(reply || "");
    if (!value) return;
    const final = Boolean(options && options.final);
    const messages = this.data.messages.map((item) => {
      if (item.id !== pendingMessage.id) return item;
      return {
        id: pendingMessage.id,
        role: "assistant",
        content: value,
        contentParts: buildMessageContentParts(value),
        pending: false,
        revealPending: !final,
        shareable: final ? this.nativeReplyFinalShareable : false,
        ts: item.ts || pendingMessage.ts
      };
    });
    const data = {
      messages,
      homeConversationMessages: this.data.homeMode ? buildHomeConversationMessages(messages) : [],
      scrollIntoView: pendingMessage.id
    };
    if (final) {
      data.statusText = "随时可用";
    } else {
      data.statusText = "正在回复";
    }
    this.setData(data);
  },

  stopNativeResponse() {
    this.clearNativeThinkingStepTimer();
    this.clearNativeReplyRevealTimer();
    const pendingMessageId = String(this.data.pendingMessageId || "");
    const messages = pendingMessageId
      ? this.data.messages.filter((item) => item.id !== pendingMessageId)
      : this.data.messages;
    const activeChild = activeChildProfile();
    this.setData({
      messages,
      homeConversationMessages: this.data.homeMode ? buildHomeConversationMessages(messages) : [],
      sending: false,
      pendingMessageId: "",
      sendPressing: false,
      statusText: "已停止",
      errorText: "",
      actionLabel: "",
      actionType: "",
      scrollIntoView: messages.length ? messages[messages.length - 1].id : ""
    });
    saveNativeSession(activeChild && activeChild.id, activeChild && activeChild.displayName, messages);
    this.refreshHistoryCards(messages);
  },

  openHistoryDrawer() {
    this.refreshHistoryCards();
    this.clearShareRevealTimer();
    this.setData({ historyDrawerOpen: true, historyDeleteCardId: "", childPickerOpen: false, attachmentMenuOpen: false, shareRevealMessageId: "", shareSelectionMode: false });
  },

  closeHistoryDrawer() {
    this.setData({ historyDrawerOpen: false, historyDeleteCardId: "" });
  },

  returnToExternalPage() {
    this.clearShareRevealTimer();
    this.setData({
      historyDrawerOpen: false,
      historyDeleteCardId: "",
      childPickerOpen: false,
      attachmentMenuOpen: false,
      shareRevealMessageId: "",
      shareSelectionMode: false,
      settingsPanelOpen: false
    });
    returnFromXiaowanzi();
  },

  openMessageLink(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset || {};
    const url = String(dataset.url || "").trim();
    if (!url) return;
    const title = String(dataset.title || "").trim() || "话题详情";
    const readingSearchQuery = getXiaowanziReadingSearchQuery(url, title);
    if (readingSearchQuery) {
      openNativeSearch(readingSearchQuery, { source: "reading", readingSource: "native" });
      return;
    }
    const nativeDetailRoute = getXiaowanziNativeDetailRoute(url, title);
    if (nativeDetailRoute) {
      wx.navigateTo({ url: nativeDetailRoute });
      return;
    }
    const nativeTabRoute = getXiaowanziNativeTabRoute(url);
    if (nativeTabRoute) {
      wx.switchTab({ url: nativeTabRoute });
      return;
    }
    openWeb(url, title, { preserveXiaowanziLayer: true });
  },

  openKnowledgeHub() {
    wx.navigateTo({ url: "/pages/experts/index?from=xiaowanzi" });
  },

  handleKnowledgePillScroll(event) {
    const scrollTop = Number(event && event.detail && event.detail.scrollTop || 0);
    const knowledgePillCollapsed = scrollTop > KNOWLEDGE_PILL_COLLAPSE_SCROLL_TOP;
    const previousScrollTop = Number(this.lastChatScrollTop || 0);
    this.lastChatScrollTop = scrollTop;
    const attachmentMenuJustOpened = this.attachmentMenuOpenedAt && Date.now() - this.attachmentMenuOpenedAt < 500;
    const shouldFoldAttachmentMenu = this.data.attachmentMenuOpen && !attachmentMenuJustOpened && scrollTop > previousScrollTop + 4;
    const payload = {};
    if (this.data.knowledgePillCollapsed !== knowledgePillCollapsed) payload.knowledgePillCollapsed = knowledgePillCollapsed;
    if (shouldFoldAttachmentMenu) payload.attachmentMenuOpen = false;
    if (Object.keys(payload).length) this.setData(payload);
  },

  startNewConversation() {
    this.clearShareRevealTimer();
    wx.setStorageSync(activeSessionKey(), createNativeSessionId());
    this.setData({
      historyDrawerOpen: false,
      historyDeleteCardId: "",
      childPickerOpen: false,
      homeMode: true,
      messages: [DEFAULT_ASSISTANT_MESSAGE],
      homeConversationMessages: [],
      inputValue: "",
      inputReady: false,
      selectedHomePrompt: "",
      sending: false,
      pendingMessageId: "",
      selectedMessageIds: [],
      selectedMessageMap: {},
      shareRoundCount: 0,
      shareRevealMessageId: "",
      shareSelectionMode: false,
      scrollIntoView: "",
      knowledgePillCollapsed: false
    });
  },

  openHistoryCard(event) {
    this.clearShareRevealTimer();
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "");
    const deleteCardId = String(this.data.historyDeleteCardId || "");
    if (deleteCardId) {
      this.setData({ historyDeleteCardId: "" });
      if (deleteCardId === id) return;
    }
    const card = (this.data.historyCards || []).find((item) => item.id === id);
    if (!card) return;
    const sessionId = String(card.sessionId || card.id || "");
    const messages = readNativeSessionMessages(sessionId);
    if (messages.length) {
      wx.setStorageSync(activeSessionKey(), sessionId);
      this.setData({
        historyDrawerOpen: false,
        historyDeleteCardId: "",
        childPickerOpen: false,
        homeMode: false,
        homeConversationMessages: [],
        messages,
        shareRevealMessageId: "",
        scrollIntoView: card.targetId || messages[messages.length - 1].id,
        knowledgePillCollapsed: true
      });
      this.refreshHistoryCards(messages);
      return;
    }
    this.setData({
      historyDrawerOpen: false,
      historyDeleteCardId: "",
      childPickerOpen: false,
      homeMode: false,
      homeConversationMessages: [],
      shareRevealMessageId: "",
      scrollIntoView: card.targetId || id,
      knowledgePillCollapsed: true
    });
  },

  showHistoryDeleteButton(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "");
    if (!id) return;
    this.setData({ historyDeleteCardId: id });
  },

  deleteHistoryCard(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "");
    if (!id) return;
    const card = (this.data.historyCards || []).find((item) => item.id === id);
    if (!card) {
      this.setData({ historyDeleteCardId: "" });
      return;
    }
    const activeChild = activeChildProfile();
    const deletedActiveSession = card.sessionId ? removeNativeSession(card.sessionId) : false;
    const deletedVisibleCachedHistory = !card.sessionId && (this.data.messages || []).some((message) => String(message && message.id || "") === String(card.targetId || id));
    if (!card.sessionId) removeCachedHistory(activeChild && activeChild.id);
    const shouldResetConversation = deletedActiveSession || deletedVisibleCachedHistory;
    const messages = shouldResetConversation ? [DEFAULT_ASSISTANT_MESSAGE] : this.data.messages;
    this.setData({
      historyDeleteCardId: "",
      homeMode: shouldResetConversation ? true : this.data.homeMode,
      messages,
      homeConversationMessages: shouldResetConversation ? [] : this.data.homeConversationMessages,
      scrollIntoView: shouldResetConversation ? "" : this.data.scrollIntoView,
      knowledgePillCollapsed: shouldResetConversation ? false : this.data.knowledgePillCollapsed
    });
    this.refreshHistoryCards(messages);
  },

  toggleAttachmentMenu() {
    if (this.data.sending) return;
    const attachmentMenuOpen = !this.data.attachmentMenuOpen;
    this.attachmentMenuOpenedAt = attachmentMenuOpen ? Date.now() : 0;
    this.clearShareRevealTimer();
    this.setData({
      attachmentMenuOpen,
      shareRevealMessageId: "",
      shareSelectionMode: false,
      historyDrawerOpen: false,
      childPickerOpen: false,
      voiceListening: false,
      voiceHolding: false,
      scrollIntoView: this.data.scrollIntoView
    });
  },

  chooseAttachment(event) {
    const type = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.type || "");
    this.setData({ errorText: "", actionLabel: "", actionType: "" });
    if (type !== "camera" && type !== "image" && type !== "file") {
      this.showToast("请选择图片或文件");
      return;
    }
    if (!getToken()) {
      this.requireXiaowanziLogin();
      return;
    }
    const existingPendingAttachments = normalizePendingAttachments(this.data.pendingAttachments);
    this.setData({ statusText: "正在上传附件", attachmentPreviewText: "正在上传附件...", attachmentContextText: "" });
    return chooseNativeAttachment(type)
      .then((file) => readAttachmentDataUrl(file, type).then((dataUrl) => ({ file, dataUrl })))
      .then(({ file, dataUrl }) => {
        const pendingAttachment = buildPendingAttachment(type, file, dataUrl);
        const nextPendingAttachments = existingPendingAttachments.concat(pendingAttachment);
        this.setData({
          pendingAttachments: nextPendingAttachments,
          attachmentPreviewText: buildPendingAttachmentPreviewText(nextPendingAttachments),
          attachmentContextText: "",
          statusText: "附件已上传",
          inputReady: hasComposerContent({ ...this.data, pendingAttachments: nextPendingAttachments })
        });
      })
      .catch((error) => {
        const message = getAttachmentRequestMessage(error, "附件上传失败，请重试。");
        const canceled = /cancel/i.test(String(error && (error.errMsg || error.message) || ""));
        this.setData({
          statusText: canceled ? (existingPendingAttachments.length ? "附件已上传" : "随时可用") : "附件上传失败",
          pendingAttachments: existingPendingAttachments,
          attachmentPreviewText: buildPendingAttachmentPreviewText(existingPendingAttachments),
          attachmentContextText: "",
          inputReady: hasComposerContent({ ...this.data, pendingAttachments: existingPendingAttachments, attachmentPreviewText: buildPendingAttachmentPreviewText(existingPendingAttachments), attachmentContextText: "" })
        });
        if (!canceled) this.showToast(message);
      });
  },

  removePendingAttachment(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const currentPendingAttachments = normalizePendingAttachments(this.data.pendingAttachments);
    const nextPendingAttachments = currentPendingAttachments.filter((_, itemIndex) => itemIndex !== index);
    this.setData({
      pendingAttachments: nextPendingAttachments,
      attachmentPreviewText: buildPendingAttachmentPreviewText(nextPendingAttachments),
      attachmentContextText: "",
      inputReady: hasComposerContent({ ...this.data, pendingAttachments: nextPendingAttachments, attachmentPreviewText: buildPendingAttachmentPreviewText(nextPendingAttachments), attachmentContextText: "" }),
      statusText: nextPendingAttachments.length ? "附件已上传" : "随时可用"
    });
  },

  openShareSelectionFromMessage(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "");
    const ids = selectPairedMessageIds(currentShareMessages(this.data), id, []);
    this.clearShareRevealTimer();
    this.setData({
      shareSelectionMode: true,
      shareRevealMessageId: "",
      attachmentMenuOpen: false,
      historyDrawerOpen: false,
      childPickerOpen: false,
      selectedMessageIds: ids,
      selectedMessageMap: selectedMessageMapFromIds(ids),
      shareRoundCount: shareRoundCountFromIds(ids)
    });
    this.prepareSelectedConversationShare(ids);
  },

  handleMessageTap(event) {
    if (!this.data.shareSelectionMode) {
      const dataset = event && event.currentTarget && event.currentTarget.dataset || {};
      if (dataset.role === "assistant") this.revealShareButton(String(dataset.id || ""));
      return;
    }
    this.toggleShareMessage(event);
  },

  clearShareRevealTimer() {
    if (!this.shareRevealTimer) return;
    clearTimeout(this.shareRevealTimer);
    this.shareRevealTimer = null;
  },

  revealShareButton(id) {
    if (!id) return;
    if (this.data.sending) return;
    const messages = currentShareMessages(this.data);
    const message = messages.find((item) => item && item.id === id);
    const shareable = message && message.shareable !== undefined
      ? message.shareable
      : isShareableAssistantMessageValue(message && message.role, message && message.content, message && message.pending, message && message.error);
    if (!message || !shareable) return;
    this.clearShareRevealTimer();
    this.setData({ shareRevealMessageId: id });
    this.shareRevealTimer = setTimeout(() => {
      if (this.data.shareRevealMessageId === id) this.setData({ shareRevealMessageId: "" });
      this.shareRevealTimer = null;
    }, SHARE_REVEAL_HIDE_DELAY_MS);
  },

  toggleShareMessage(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "");
    const ids = selectPairedMessageIds(currentShareMessages(this.data), id, this.data.selectedMessageIds);
    this.setData({
      selectedMessageIds: ids,
      selectedMessageMap: selectedMessageMapFromIds(ids),
      shareRoundCount: shareRoundCountFromIds(ids)
    });
    this.prepareSelectedConversationShare(ids);
  },

  exitShareSelection() {
    this.setData({
      shareSelectionMode: false,
      shareRevealMessageId: "",
      selectedMessageIds: [],
      selectedMessageMap: {},
      shareRoundCount: 0,
      selectedConversationShareId: "",
      selectedSharePreparing: false,
      selectedShareError: "",
      selectedShareKey: ""
    });
  },

  prepareSelectedConversationShare(ids) {
    const selectedIds = Array.isArray(ids) ? ids : [];
    const shareKey = selectedShareKeyFromIds(selectedIds);
    const messages = selectedMessagesForIds(currentShareMessages(this.data), selectedIds);
    if (!messages.length) {
      this.setData({
        selectedConversationShareId: "",
        selectedSharePreparing: false,
        selectedShareError: "",
        selectedShareKey: ""
      });
      return;
    }
    this.setData({
      selectedConversationShareId: "",
      selectedSharePreparing: true,
      selectedShareError: "",
      selectedShareKey: shareKey
    });
    createXiaowanziConversationShare(messages)
      .then((shareId) => {
        if (this.data.selectedShareKey !== shareKey) return;
        this.setData({
          selectedConversationShareId: shareId,
          selectedSharePreparing: false,
          selectedShareError: ""
        });
      })
      .catch((error) => {
        if (this.data.selectedShareKey !== shareKey) return;
        const message = getRequestMessage(error, "分享内容准备失败，请重试");
        this.setData({
          selectedConversationShareId: "",
          selectedSharePreparing: false,
          selectedShareError: message
        });
        this.showToast(message);
      });
  },

  copySelectedMessages() {
    const text = selectedMessagesText(currentShareMessages(this.data), this.data.selectedMessageIds);
    if (!text) return;
    if (wx.setClipboardData) {
      wx.setClipboardData({
        data: text,
        success: () => this.showToast("已复制内容")
      });
      return;
    }
    this.showToast("已复制内容");
  },

  generateShareImage() {
    const messages = selectedMessagesForIds(currentShareMessages(this.data), this.data.selectedMessageIds);
    if (!messages.length || this.data.shareImageGenerating) return;
    if (!wx.createCanvasContext || !wx.canvasToTempFilePath) {
      this.showToast("当前环境暂不支持生成图片");
      return;
    }
    this.setData({ shareImageGenerating: true, shareCanvasMounted: true }, () => {
      loadShareQrImagePath(messages).then((qrImagePath) => {
        const ctx = wx.createCanvasContext(SHARE_CANVAS_ID, this);
        const shareCanvasHeight = measureShareImageCanvasHeight(ctx, messages);
        this.setData({ shareCanvasHeight }, () => {
          const drawCtx = wx.createCanvasContext(SHARE_CANVAS_ID, this);
          drawShareImageCanvas(drawCtx, messages, shareCanvasHeight, qrImagePath);
          drawCtx.draw(false, () => {
            wx.canvasToTempFilePath({
              canvasId: SHARE_CANVAS_ID,
              width: SHARE_CANVAS_WIDTH,
              height: shareCanvasHeight,
              destWidth: SHARE_CANVAS_WIDTH,
              destHeight: shareCanvasHeight,
              success: (res) => {
                const path = String(res && res.tempFilePath || "");
                this.setData({ shareImageGenerating: false, shareCanvasMounted: false });
                if (!path) {
                  this.showToast("生成图片失败，请重试");
                  return;
                }
                this.setData({
                  shareImagePreviewOpen: true,
                  shareImagePath: path,
                  shareSelectionMode: false
                });
              },
              fail: () => {
                this.setData({ shareImageGenerating: false, shareCanvasMounted: false });
                this.showToast("生成图片失败，请重试");
              }
            }, this);
          });
        });
      }).catch((error) => {
        this.setData({ shareImageGenerating: false, shareCanvasMounted: false });
        this.showToast(error && error.message || "小程序码生成失败，请重试");
      });
    });
  },

  closeShareImagePreview() {
    this.setData({ shareImagePreviewOpen: false });
  },

  saveGeneratedShareImage() {
    if (!this.data.shareImagePath) return;
    if (!wx.saveImageToPhotosAlbum) {
      this.showToast("当前环境暂不支持保存图片");
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath: this.data.shareImagePath,
      success: () => this.showToast("已保存到相册"),
      fail: () => this.showToast("保存失败，请开启相册权限后重试")
    });
  },

  showToast(text) {
    this.setData({ toastText: text });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.setData({ toastText: "" });
    }, 1600);
  },

  buildContextualContent(activeChild, userContent) {
    const parentRole = getCurrentParentRole();
    const parentName = getCurrentParentName();
    if (!activeChild) {
      const profileSummary = [
        "当前为通用咨询模式",
        parentName ? `家长姓名:${parentName}` : "",
        buildUserAddressingRule("", parentName),
        "用户未选择孩子档案",
        parentRole ? `提问者身份:${parentRole}` : ""
      ].filter(Boolean).join("。");
      return Promise.resolve({
        profileSummary,
        memoryEnabled: false,
        contextualContent: buildXiaowanziPromptPayload({
          profileSummary,
          memorySummary: "",
          userContent
        })
      });
    }
    return this.loadChildMemory(activeChild.id).then((memory) => {
      const backendMemoryEnabled = !memory || memory.enabled !== false;
      const memoryEnabled = memoryEnabledFromStorage() && backendMemoryEnabled;
      const profileSummary = buildChildProfileSummary(activeChild, parentRole, parentName);
      return {
        profileSummary,
        memoryEnabled,
        contextualContent: buildXiaowanziPromptPayload({
          profileSummary,
          memorySummary: memoryEnabled ? String(memory && memory.summary || "").trim() : "",
          userContent
        })
      };
    });
  },

  loadChildMemory(childId) {
    if (!childId || !getToken()) return Promise.resolve({});
    return request({ url: `/api/users/me/child-memories/${encodeURIComponent(childId)}` })
      .catch(() => ({}));
  },

  mergeChildMemory(childId, childProfile, userMessage, assistantReply) {
    if (!childId || !getToken()) return Promise.resolve(null);
    return request({
      method: "POST",
      url: `/api/users/me/child-memories/${encodeURIComponent(childId)}/merge`,
      data: { childProfile, userMessage, assistantReply }
    }).catch(() => null);
  },

  handleChatError(error, fallback) {
    const statusCode = Number(error && error.statusCode);
    if (statusCode === 401) {
      clearSession();
      this.requireXiaowanziLogin();
      return;
    }
    if (isProRequiredError(error)) {
      this.setData({
        canUseBot: false,
        statusText: "需要 Pro",
        errorText: getRequestMessage(error, "该功能需要订阅后使用。"),
        actionLabel: "查看 Pro",
        actionType: "pro"
      });
      return;
    }
    if (statusCode === 403) {
      this.setData({
        canUseBot: false,
        statusText: "暂无权限",
        errorText: getRequestMessage(error, "当前账号暂无小玩子权限。"),
        actionLabel: "",
        actionType: ""
      });
      return;
    }
    this.setData({
      statusText: "请求失败",
      errorText: getRequestMessage(error, fallback),
      actionLabel: "重试",
      actionType: "retry"
    });
  },

  handleActionTap() {
    const actionType = String(this.data.actionType || "");
    if (actionType === "login") {
      this.requireXiaowanziLogin();
      return;
    }
    if (actionType === "pro") {
      wx.navigateTo({ url: "/pages/pro/index" });
      return;
    }
    if (actionType === "archive") {
      this.openArchivePanel();
      return;
    }
    if (actionType === "retry") {
      if (String(this.data.inputValue || "").trim()) {
        this.handleSend();
        return;
      }
      this.ensureBotReady();
    }
  },

  openArchivePanel() {
    setSelectedTab(this, 2, { hidden: true });
    setSettingsTabbarHidden(this, true);
    this.setData({
      settingsPanelOpen: true,
      settingsPanelView: "archive",
      attachmentMenuOpen: false,
      historyDrawerOpen: false,
      childPickerOpen: false,
      shareSelectionMode: false,
      shareRevealMessageId: ""
    });
    this.loadProfilePanelView("archive");
  },

  openNativeChildPicker() {
    this.clearShareRevealTimer();
    this.setData({
      childPickerOpen: true,
      childPickerCards: buildChildPickerCards(this.data.activeChildId),
      attachmentMenuOpen: false,
      historyDrawerOpen: false,
      settingsPanelOpen: false,
      shareSelectionMode: false,
      shareRevealMessageId: ""
    });
  },

  closeChildPicker() {
    this.setData({ childPickerOpen: false });
  },

  chooseChildFromPicker(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "");
    const child = loadChildProfilesForNativeChat().find((item) => item.id === id);
    if (!child) return;
    this.syncSelectedChildToXiaowanzi(child);
    this.markChildContextPending(child);
    this.setData({
      childPickerOpen: false,
      childPickerCards: buildChildPickerCards(child.id)
    });
    this.loadHomeTopicPrompts();
    this.refreshHistoryCards();
  },

  openChildCreateFromPicker() {
    this.setData({ childPickerOpen: false });
    this.openNativeChildCreate();
  },

  openNativeChildCreate() {
    const hasSavedChildren = loadChildProfilesForNativeChat().length > 0;
    this.openArchivePanel();
    if (hasSavedChildren) this.addArchiveChild();
  },

  openArchiveCreatePanel() {
    this.openArchivePanel();
    this.addArchiveChild();
  },

  syncSelectedChildToXiaowanzi(child) {
    const activeChild = child || activeChildProfile();
    if (!activeChild) return;
    wx.setStorageSync(LAST_CHILD_ID_KEY, activeChild.id);
    wx.setStorageSync(CHAT_CONTEXT_KEY, {
      childId: activeChild.id,
      childName: activeChild.displayName || "孩子",
      childGrade: activeChild.grade || "",
      source: "mp-native-xiaowanzi-chat"
    });
    this.syncNativeShellState();
  },

  markChildContextPending(child) {
    const activeChild = child || this.data.archiveDraft || activeChildProfile();
    const name = String((activeChild && activeChild.displayName) || this.data.activeChildName || "孩子").trim();
    this.setData({
      childContextStatus: `已切换为${name || "孩子"}，下一次提问立即生效`
    });
  },

  ...nativeSettingsMethods,

  authorizeXiaowanziPrompt(event) {
    const prompt = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value || "").trim();
    if (prompt) this.setData({ selectedHomePrompt: prompt, inputReady: true });
    this.authorizeXiaowanziSend(event);
  },

  authorizeXiaowanziSend(event) {
    if (getToken()) return;
    this._pendingXiaowanziAction = "send";
    const gate = this.selectComponent("#xiaowanziPhoneLoginGate");
    if (gate && typeof gate.loginWithPhone === "function") gate.loginWithPhone(event);
  },

  handleXiaowanziLoginSuccess() {
    const action = this._pendingXiaowanziAction;
    this._pendingXiaowanziAction = "";
    this.setData({ isLoggedIn: true, xiaowanziLoginRequired: false, profilePanelMessage: "" });
    this.initializeXiaowanzi(this._initialOptions || {});
    if (action === "send") this.handleSend();
  },

  handleXiaowanziLoginFailure(event) {
    this._pendingXiaowanziAction = "";
    wx.showToast({ title: String(event && event.detail && event.detail.message || "登录失败，请重试"), icon: "none" });
  },

  selectArchiveChild(event) {
    nativeSettingsMethods.selectArchiveChild.call(this, event);
    const id = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id) || "");
    const children = this.archiveChildren || loadChildProfilesForNativeChat();
    const active = children.find((child) => String(child && child.id) === id);
    if (active) {
      this.syncSelectedChildToXiaowanzi(active);
      this.markChildContextPending(active);
      this.loadHomeTopicPrompts();
      this.refreshHistoryCards();
    }
  },

  closeSettings() {
    this.setData({
      settingsPanelOpen: false,
      settingsPanelView: "archive"
    });
    setSelectedTab(this, 2, { hidden: true });
    setSettingsTabbarHidden(this, true);
  },

  returnSettingsMenu() {
    this.closeSettings();
  },

  saveArchivePanel() {
    nativeSettingsMethods.saveArchivePanel.call(this);
    if (this.data.profilePanelMessage === "档案已保存") {
      this.syncSelectedChildToXiaowanzi(this.data.archiveDraft);
      this.markChildContextPending(this.data.archiveDraft);
      syncNativeSessionChildTags();
      this.closeSettings();
      this.loadHomeTopicPrompts();
      this.refreshHistoryCards();
    }
  },

  findXiaowanzi() {
    nativeSettingsMethods.findXiaowanzi.call(this);
    this.syncNativeShellState();
  },

  onShareAppMessage() {
    if (this.data && this.data.shareSelectionMode && this.data.selectedMessageIds && this.data.selectedMessageIds.length) {
      const selectedShare = buildSelectedWechatShare(currentShareMessages(this.data), this.data.selectedMessageIds, this.data.selectedConversationShareId);
      if (selectedShare) return selectedShare;
    }
    return createPageShare(SHARE_OPTIONS).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare(SHARE_OPTIONS).onShareTimeline();
  }
});
