const { request, buildUrl } = require("../../utils/request");
const { getToken, getUser, setSession, clearSession } = require("../../utils/session");
const { createPageShare, enableShareMenu, SHARE_PAGE_PATH } = require("../../utils/share");
const { setSelectedTab } = require("../../utils/tabbar");
const { CHILD_PROFILES_KEY, WEB_CHILD_PROFILES_KEY, mergeChildProfileRecords, parseStoredValue } = require("../../utils/profileState");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createNativeSettingsMethods, setSettingsTabbarHidden } = require("../../utils/nativeSettings");
const { openWeb } = require("../../utils/webview");
const { returnFromXiaowanzi } = require("../../utils/xiaowanziReturn");

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
  content: "你好，我是小玩子。先关联孩子档案，再把你正在纠结的问题告诉我。",
  contentParts: buildMessageContentParts("你好，我是小玩子。先关联孩子档案，再把你正在纠结的问题告诉我。"),
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
const SHARE_CANVAS_CONTENT_LEFT = 20;
const SHARE_CARD_LOGO_IMAGE = "/assets/xiaowanzi-icons/share-logo.png";
const SHARE_CARD_QR_FILE_PREFIX = "xiaowanzi-conversation-qrcode";
const shareQrImageCache = {};
const SHARE_REVEAL_HIDE_DELAY_MS = 5000;
const KNOWLEDGE_PILL_COLLAPSE_SCROLL_TOP = 24;

const AI_RESPONSE_RULES = [
  "你是小玩子，一个可爱活泼的助手，风格软萌、热情、会撒娇。",
  "优先使用站内相关内容、孩子档案、孩子记忆和当前上下文回答；当前页面只是线索，不是唯一资料来源。",
  "当站内相关内容不足时，可以使用通用育儿、学习和沟通知识给出可执行建议，但要说明这是通用建议。",
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
      const grade = String(item.grade || "未填年级").trim() || "未填年级";
      return {
        id: item.id,
        displayName,
        relation,
        grade,
        tag: `${relation} · ${grade}`,
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
    shareable: isShareableAssistantMessageValue(message.role, message.content, message.pending, message.error)
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
  const match = String(line || "").trim().match(/^[-*]\s+(.+)$/);
  return match ? stripMarkdownInline(match[1]) : "";
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
    const text = paragraphLines.map(stripMarkdownInline).filter(Boolean).join("\n");
    if (text) {
      parts.push({ type: "md_paragraph", text });
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

    const listText = parseMarkdownListItem(trimmed);
    if (listText) {
      pushParagraph();
      parts.push({ type: "md_list_item", text: listText });
      return;
    }

    paragraphLines.push(trimmed);
  });

  pushParagraph();

  return parts
    .map((part, index) => ({
      key: `${part.type || "text"}-${index}`,
      type: part.type || "md_paragraph",
      level: part.level || 0,
      text: String(part.text || ""),
      url: ""
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
  const topbarHeight = Math.max(72, Math.round(Number(metrics.topbarHeight || 88)));
  const capsuleHeight = Math.round(Number(metrics.capsuleHeight || 32));
  const knowledgeHeight = 34;
  const knowledgeWidth = 86;
  const avatarHeight = 40;
  const searchButtonTop = Math.round(Number(metrics.searchButtonTop || 0));
  const chatTop = topbarHeight + NATIVE_SHELL_BODY_HEIGHT;
  const shellControlTop = Math.max(0, searchButtonTop);
  return {
    topbarHeight,
    chatTop,
    childBoundaryTop: topbarHeight + 12,
    shellLogoTop: shellControlTop,
    shellLogoHeight: capsuleHeight,
    shellAvatarTop: Math.max(0, Math.round(shellControlTop + (capsuleHeight - avatarHeight) / 2)),
    shellAvatarHeight: avatarHeight,
    shellKnowledgeTop: Math.max(0, Math.round(shellControlTop + (capsuleHeight - knowledgeHeight) / 2)),
    shellKnowledgeHeight: knowledgeHeight,
    shellKnowledgeWidth: knowledgeWidth,
    shellKnowledgeRight: Math.max(8, Math.round(Number(metrics.capsuleRight || 96) + 2)),
    sharePreviewTop: Math.max(topbarHeight + 12, shellControlTop + capsuleHeight + 16)
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

function buildChildProfileSummary(profile, parentRole) {
  const exactAge = formatChildAgeFromBirthDate(profile && profile.birthDate);
  return [
    `咨询人:${String((profile && profile.displayName) || "孩子").trim() || "孩子"}`,
    profile && profile.relation ? `关系:${String(profile.relation).trim()}` : "",
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
    shareable: isShareableAssistantMessageValue(role, content, item && item.pending, item && item.error),
    ts: String(item && item.ts || new Date().toISOString())
  };
}

function historyCacheKey(childId) {
  return `${NATIVE_HISTORY_CACHE_PREFIX}${childId || "global"}`;
}

function sessionMessagesKey(sessionId) {
  return `${NATIVE_SESSION_MESSAGES_PREFIX}${sessionId}`;
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
    const raw = wx.getStorageSync(NATIVE_SESSION_INDEX_KEY);
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
    wx.setStorageSync(NATIVE_SESSION_INDEX_KEY, (items || []).slice(0, 60));
  } catch (_error) {}
}

function readNativeSessionMessages(sessionId) {
  if (!sessionId) return [];
  try {
    const raw = wx.getStorageSync(sessionMessagesKey(sessionId));
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
  const sessionId = String(wx.getStorageSync(NATIVE_ACTIVE_SESSION_KEY) || "").trim() || createNativeSessionId();
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
  wx.setStorageSync(NATIVE_ACTIVE_SESSION_KEY, sessionId);
  saveCachedHistory(childId, sanitized);
  return sessionId;
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

function normalizeShareCanvasText(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/#{1,6}\s?/g, "")
    .replace(/[ \t]{2,}/g, " ");
}

function parseStandaloneMarkdownLink(line) {
  const match = String(line || "").trim().match(/^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)$/);
  if (!match) return null;
  const text = String(match[1] || "").trim();
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

function createXiaowanziConversationShare(messages) {
  const items = (Array.isArray(messages) ? messages : [])
    .map((message) => ({
      role: message && message.role === "user" ? "user" : "assistant",
      content: normalizeShareMessageContent(message && message.content)
    }))
    .filter((message) => message.content);
  if (!items.length) return Promise.reject(new Error("当前内容没有可分享的对话"));
  const userQuestion = items.find((message) => message.role === "user") || items[0];
  const title = `小玩子：${truncateWechatShareTitle(userQuestion.content)}`;
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
    if (shareQrImageCache[shareId]) return shareQrImageCache[shareId];
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
        url: buildUrl(`/api/wechat-mini/xiaowanzi-share-qrcode?shareId=${encodeURIComponent(shareId)}`),
        header,
        responseType: "arraybuffer",
        success(res) {
          if (Number(res && res.statusCode) !== 200 || !res || !res.data) {
            reject(new Error("小程序码生成失败，请重试"));
            return;
          }
          fs.writeFile({
            filePath,
            data: res.data,
            success() {
              shareQrImageCache[shareId] = filePath;
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
  return references.slice(0, 2);
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
      content: normalizeShareMessageContent(message.content),
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

function buildSelectedWechatShare(messages, ids) {
  const selected = selectedMessagesForIds(messages, ids);
  if (!selected.length) return null;
  const userQuestion = selected.find((message) => message.role === "user") || selected[0];
  const title = `小玩子：${truncateWechatShareTitle(userQuestion.content)}`;
  return createPageShare({
    title,
    path: SHARE_PAGE_PATH,
    query: {
      target: SHARE_OPTIONS.path,
      title
    }
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

function shareCanvasLinkMetrics(ctx, text, fontSize) {
  const markSize = Math.round(fontSize * 0.9);
  const markGap = Math.round(fontSize * 0.24);
  const paddingX = Math.round(fontSize * 0.44);
  const textWidth = canvasTextWidth(ctx, text, fontSize);
  return {
    width: Math.ceil(textWidth + paddingX * 2 + markSize + markGap),
    height: Math.ceil(fontSize * 1.42),
    markSize,
    markGap,
    paddingX,
    textWidth
  };
}

function richRunWidth(ctx, run, fontSize) {
  const text = String((run && run.text) || "");
  if (String((run && run.type) || "") === "link") return shareCanvasLinkMetrics(ctx, text, fontSize).width;
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
    const linkWidth = shareCanvasLinkMetrics(ctx, value, fontSize).width;
    if (line.length && lineWidth + linkWidth > maxWidth) pushLine();
    lineType = lineType || "link";
    line.push({ type: "link", text: value });
    lineWidth += linkWidth;
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
  if (type === "md_paragraph" && previousType === "md_heading") return 12;
  if (type === "md_paragraph") return 20;
  if (type === "md_list_item") return 12;
  return 0;
}

function shareCanvasRichTextHeight(lines, lineHeight) {
  return (lines || []).reduce((total, line, index) => total + shareCanvasLineTopGap(lines, index) + lineHeight, 0);
}

function drawCanvasRichTextLines(ctx, lines, x, y, lineHeight, options) {
  const defaultFillStyle = options && options.defaultFillStyle || "#121735";
  const linkFillStyle = options && options.linkFillStyle || "#6d28f2";
  const fontSize = Number(options && options.fontSize) || 28;
  let baselineY = y;
  setShareCanvasTextAlign(ctx, "left");
  (lines || []).forEach((line, lineIndex) => {
    baselineY += shareCanvasLineTopGap(lines, lineIndex);
    let cursorX = x;
    richLineRuns(line).forEach((run) => {
      const runType = String((run && run.type) || "");
      const fillStyle = runType === "link" || runType === "md_bullet"
        ? linkFillStyle
        : defaultFillStyle;
      if (runType === "link") {
        const metrics = shareCanvasLinkMetrics(ctx, run.text, fontSize);
        const pillY = baselineY - fontSize - Math.round((metrics.height - fontSize) / 2);
        ctx.setFillStyle("rgba(116, 88, 255, 0.12)");
        drawRoundRect(ctx, cursorX, pillY, metrics.width, metrics.height, Math.round(metrics.height / 2));
        const markX = cursorX + metrics.paddingX;
        const markY = pillY + Math.round((metrics.height - metrics.markSize) / 2);
        ctx.setFillStyle("rgba(105, 74, 232, 0.14)");
        drawRoundRect(ctx, markX, markY, metrics.markSize, metrics.markSize, Math.round(metrics.markSize / 2));
        ctx.setFillStyle("#5d39dc");
        const markFontSize = Math.max(16, Math.round(fontSize * 0.64));
        setShareCanvasFontSize(ctx, markFontSize);
        ctx.fillText("↗", markX + Math.round(metrics.markSize * 0.18), markY + Math.round(metrics.markSize * 0.74));
        setShareCanvasFontSize(ctx, fontSize);
        ctx.setFillStyle(fillStyle);
        ctx.fillText(run.text, markX + metrics.markSize + metrics.markGap, baselineY);
        cursorX += metrics.width;
        return;
      }
      ctx.setFillStyle(fillStyle);
      ctx.fillText(run.text, cursorX, baselineY);
      cursorX += richRunWidth(ctx, run, fontSize);
    });
    baselineY += lineHeight;
  });
}

function getCenteredUserBubbleTextOffset(message) {
  if (!message || !message.isUser) return Number(message && message.bubblePadTop) || 0;
  const textHeight = Math.max(message.fontSize, shareCanvasRichTextHeight(message.lines, message.lineHeight) - (message.lineHeight - message.fontSize));
  return Math.max(0, (message.bubbleHeight - textHeight) / 2);
}

function buildShareImageCanvasSections(ctx, messages) {
  const contentLeft = SHARE_CANVAS_CONTENT_LEFT;
  const contentWidth = SHARE_CANVAS_WIDTH - contentLeft * 2;
  const userFontSize = 28;
  const assistantFontSize = 28;
  const referenceFontSize = 24;
  const userLineHeight = 49;
  const assistantLineHeight = 51;
  const referenceLineHeight = 34;
  const userPadX = 30;
  const userPadTop = 22;
  const userPadBottom = 26;
  const assistantPadX = 30;
  const assistantPadTop = 30;
  const assistantPadBottom = 32;
  const referenceGap = 16;
  const referenceBottomPadding = assistantPadTop;
  const userMaxWidth = 584;
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
    const measuredWidth = Math.max(0, ...lines.map((line) => richLineWidth(ctx, line, fontSize)));
    setShareCanvasFontSize(ctx, referenceFontSize);
    const measuredReferenceWidth = Math.max(0, ...referenceLines.map((line) => canvasTextWidth(ctx, line, referenceFontSize)));
    const bubbleWidth = Math.max(120, Math.min(Math.max(measuredWidth, measuredReferenceWidth) + bubblePadX * 2, maxBubbleWidth));
    const referenceHeight = referenceLines.length
      ? referenceGap + referenceLines.length * referenceLineHeight + referenceBottomPadding
      : 0;
    const textHeight = shareCanvasRichTextHeight(lines, lineHeight);
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
  const messageBlockHeight = visibleMessages.reduce((total, message) => total + message.bubbleHeight + 24, 0);
  return Math.ceil(Math.max(SHARE_CANVAS_MIN_HEIGHT, 232 + messageBlockHeight + 460));
}

function drawShareImageCanvas(ctx, messages, canvasHeight, qrImagePath) {
  if (!ctx) return;
  const contentLeft = SHARE_CANVAS_CONTENT_LEFT;
  const contentWidth = SHARE_CANVAS_WIDTH - contentLeft * 2;
  const qrPanelY = canvasHeight - 392;
  const qrY = qrPanelY + 28;
  const visibleMessages = buildShareImageCanvasSections(ctx, messages);

  ctx.setFillStyle("#f8f7fc");
  ctx.fillRect(0, 0, SHARE_CANVAS_WIDTH, canvasHeight);

  ctx.drawImage(SHARE_CARD_LOGO_IMAGE, 265, 74, 220, 71);

  let y = 232;
  visibleMessages.forEach((message) => {
    const x = message.isUser ? contentLeft + contentWidth - message.bubbleWidth : contentLeft;
    ctx.setFillStyle(message.isUser ? "#6d3ff2" : "#ffffff");
    drawRoundRect(ctx, x, y, message.bubbleWidth, message.bubbleHeight, message.isUser ? 34 : 30);
    setShareCanvasFontSize(ctx, message.fontSize);
    const textX = x + message.bubblePadX;
    const textY = y + getCenteredUserBubbleTextOffset(message) + message.fontSize;
    drawCanvasRichTextLines(ctx, message.lines, textX, textY, message.lineHeight, {
      defaultFillStyle: message.isUser ? "#ffffff" : "#121735",
      linkFillStyle: message.isUser ? "#ffffff" : "#6d28f2",
      fontSize: message.fontSize
    });
    if (message.referenceLines.length) {
      ctx.setFillStyle("#6d28f2");
      setShareCanvasFontSize(ctx, message.referenceFontSize);
      const referenceY = textY + message.textHeight + message.referenceGap + message.referenceFontSize;
      drawCanvasTextLines(ctx, message.referenceLines, textX, referenceY, message.referenceLineHeight);
    }
    y += message.bubbleHeight + 24;
  });

  ctx.drawImage(qrImagePath, SHARE_CANVAS_WIDTH / 2 - 70, qrY, 140, 140);
  if (typeof ctx.setTextAlign === "function") ctx.setTextAlign("center");
  ctx.setFillStyle("#475569");
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

function buildAttachmentState(type, file) {
  const label = attachmentKindLabel(type);
  const name = attachmentName(file, label);
  const size = formatFileSize(file && file.size);
  const path = String((file && (file.tempFilePath || file.path)) || "").trim();
  const suffix = size ? ` · ${size}` : "";
  return {
    attachmentPreviewText: `已添加${label}：${name}${suffix}`,
    attachmentContextText: [
      `用户在小程序端选择了${label}附件。`,
      `附件名称：${name}。`,
      size ? `附件大小：${size}。` : "",
      path ? `本地临时路径：${path}。` : "",
      "当前聊天接口尚未接入附件内容解析；如果回答需要附件细节，请先让用户补充图片或文件中的关键信息。"
    ].filter(Boolean).join("")
  };
}

function hasComposerContent(data) {
  return Boolean(String(data && (data.inputValue || data.selectedHomePrompt) || "").trim() || String(data && data.attachmentContextText || "").trim());
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
    childPickerOpen: false,
    childPickerCards: [],
    attachmentMenuOpen: false,
    shareRevealMessageId: "",
    shareSelectionMode: false,
    selectedMessageIds: [],
    selectedMessageMap: {},
    shareRoundCount: 0,
    shareImageGenerating: false,
    shareCanvasMounted: false,
    shareCanvasHeight: SHARE_CANVAS_MIN_HEIGHT,
    shareImagePreviewOpen: false,
    shareImagePath: "",
    toastText: "",
    voiceListening: false,
    voiceHolding: false,
    attachmentPreviewText: "",
    attachmentContextText: "",
    canUseBot: true,
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
    archiveInsightGrade: "小班",
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
    archiveGradeSelectOptions: [],
    archiveGradeName: "小班",
    archiveGradeDropdownOpen: false,
    archiveTagOptions: [],
    profilePanelMessage: ""
  },

  shareRevealTimer: null,

  onLoad(options = {}) {
    this._initialOptions = options;
    enableShareMenu();
    if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: "" });
    setSelectedTab(this, 2, { hidden: true });
    if (!this.requireXiaowanziLogin()) return;
    this.initializeXiaowanzi(options);
  },

  onUnload() {
    this.clearShareRevealTimer();
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
    if (!this.requireXiaowanziLogin()) return;
    const entryTriggered = consumeXiaowanziEntryTrigger();
    if (entryTriggered) this.restoreTopbarAvatar({ advance: true });
    this.syncNativeShellState();
    this.loadHomeTopicPrompts();
  },

  requireXiaowanziLogin() {
    if (getToken()) {
      if (this.data.xiaowanziLoginRequired) this.setData({ xiaowanziLoginRequired: false, profilePanelMessage: "" });
      return true;
    }
    this.setData({
      xiaowanziLoginRequired: true,
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
    this.setData({
      historyCards: sessionCards.length ? sessionCards : buildHistoryCards(messages, childName)
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
    const activeSessionId = String(wx.getStorageSync(NATIVE_ACTIVE_SESSION_KEY) || "").trim();
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
    const content = buildComposerContent(visibleContent, attachmentContextText);
    if (!content) {
      this.setData({ sendPressing: false });
      return;
    }
    if (!getToken()) {
      this.setData({ sendPressing: false });
      this.requireXiaowanziLogin();
      return;
    }
    const activeChild = activeChildProfile();
    if (!activeChild && !this.data.homeMode) {
      this.setData({
        errorText: "请先关联孩子档案，小玩子才能给出贴合年龄和年级的建议。",
        actionLabel: "关联孩子",
        actionType: "archive",
        sendPressing: false,
        statusText: "需要孩子档案"
      });
      this.openArchivePanel();
      return;
    }

    const keepHomeConversation = Boolean(this.data.homeMode);
    const userMessage = {
      id: messageId("user"),
      role: "user",
      content: visibleContent || attachmentPreviewText || "已添加附件",
      contentParts: buildMessageContentParts(visibleContent || attachmentPreviewText || "已添加附件"),
      shareable: false,
      ts: new Date().toISOString()
    };
    const pendingMessage = {
      id: messageId("assistant"),
      role: "assistant",
      content: "小玩子正在思考中...",
      contentParts: buildMessageContentParts("小玩子正在思考中..."),
      pending: true,
      shareable: false,
      ts: new Date(Date.now() + 1).toISOString()
    };
    const nextMessages = this.data.messages.concat(userMessage, pendingMessage);
    this.setData({
      messages: nextMessages,
      homeConversationMessages: keepHomeConversation ? buildHomeConversationMessages(nextMessages) : [],
      inputValue: "",
      inputReady: false,
      selectedHomePrompt: "",
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

    this.buildContextualContent(activeChild, content)
      .then(({ contextualContent, profileSummary, memoryEnabled }) => request({
        method: "POST",
        url: `/api/v1/tutorbot/${BOT_ID}/messages`,
        data: { content: contextualContent, stream: false }
      }).then((payload) => ({ payload, profileSummary, memoryEnabled })))
      .then(({ payload, profileSummary, memoryEnabled }) => {
        if (this.data.pendingMessageId !== pendingMessage.id) return;
        const reply = String(payload && (payload.content || payload.message || payload.detail) || "").trim() || "小玩子暂时没有返回内容。";
        const assistantMessage = {
          id: pendingMessage.id,
          role: "assistant",
          content: reply,
          contentParts: buildMessageContentParts(reply),
          shareable: isShareableAssistantMessageValue("assistant", reply, false, false),
          ts: new Date().toISOString()
        };
        const messages = this.data.messages.map((item) => item.id === pendingMessage.id ? assistantMessage : item);
        this.setData({
          messages,
          homeConversationMessages: this.data.homeMode ? buildHomeConversationMessages(messages) : [],
          sending: false,
          pendingMessageId: "",
          canUseBot: true,
          statusText: "随时可用",
          scrollIntoView: assistantMessage.id
        });
        this.refreshHistoryCards(messages);
        saveNativeSession(activeChild && activeChild.id, activeChild && activeChild.displayName, messages);
        if (activeChild && memoryEnabled) {
          this.mergeChildMemory(activeChild.id, profileSummary, content, reply);
        }
      })
      .catch((error) => {
        if (this.data.pendingMessageId !== pendingMessage.id) return;
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
          attachmentPreviewText,
          attachmentContextText,
          inputReady: hasComposerContent({ inputValue: visibleContent, attachmentContextText }),
          scrollIntoView: pendingMessage.id
        });
        this.refreshHistoryCards(messages);
        saveNativeSession(activeChild && activeChild.id, activeChild && activeChild.displayName, messages);
        this.handleChatError(error, "请求失败，请稍后重试。");
      });
  },

  stopNativeResponse() {
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
    this.setData({ historyDrawerOpen: true, childPickerOpen: false, attachmentMenuOpen: false, shareRevealMessageId: "", shareSelectionMode: false });
  },

  closeHistoryDrawer() {
    this.setData({ historyDrawerOpen: false });
  },

  returnToExternalPage() {
    this.clearShareRevealTimer();
    this.setData({
      historyDrawerOpen: false,
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
    openWeb(url, title, { preserveXiaowanziLayer: true });
  },

  openKnowledgeHub() {
    openWeb("https://xianfeng.xinzhi.info/experts?xw_layer=1&xw_return=xiaowanzi", "先疯智库", { preserveXiaowanziLayer: true });
  },

  handleKnowledgePillScroll(event) {
    const scrollTop = Number(event && event.detail && event.detail.scrollTop || 0);
    const knowledgePillCollapsed = scrollTop > KNOWLEDGE_PILL_COLLAPSE_SCROLL_TOP;
    const previousScrollTop = Number(this.lastChatScrollTop || 0);
    this.lastChatScrollTop = scrollTop;
    const shouldFoldAttachmentMenu = this.data.attachmentMenuOpen && scrollTop > previousScrollTop + 4;
    const payload = {};
    if (this.data.knowledgePillCollapsed !== knowledgePillCollapsed) payload.knowledgePillCollapsed = knowledgePillCollapsed;
    if (shouldFoldAttachmentMenu) payload.attachmentMenuOpen = false;
    if (Object.keys(payload).length) this.setData(payload);
  },

  startNewConversation() {
    this.clearShareRevealTimer();
    wx.setStorageSync(NATIVE_ACTIVE_SESSION_KEY, createNativeSessionId());
    this.setData({
      historyDrawerOpen: false,
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
    const card = (this.data.historyCards || []).find((item) => item.id === id);
    if (!card) return;
    const sessionId = String(card.sessionId || card.id || "");
    const messages = readNativeSessionMessages(sessionId);
    if (messages.length) {
      wx.setStorageSync(NATIVE_ACTIVE_SESSION_KEY, sessionId);
      this.setData({
        historyDrawerOpen: false,
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
      childPickerOpen: false,
      homeMode: false,
      homeConversationMessages: [],
      shareRevealMessageId: "",
      scrollIntoView: card.targetId || id,
      knowledgePillCollapsed: true
    });
  },

  toggleAttachmentMenu() {
    if (this.data.sending) return;
    const attachmentMenuOpen = !this.data.attachmentMenuOpen;
    this.clearShareRevealTimer();
    this.setData({
      attachmentMenuOpen,
      shareRevealMessageId: "",
      shareSelectionMode: false,
      historyDrawerOpen: false,
      childPickerOpen: false,
      voiceListening: false,
      voiceHolding: false,
      scrollIntoView: attachmentMenuOpen && this.data.homeMode ? "xiaowanziPromptPanel" : this.data.scrollIntoView
    });
  },

  chooseAttachment(event) {
    const type = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.type || "");
    this.setData({ attachmentMenuOpen: false });
    if (type === "camera" || type === "image" || type === "file") {
      this.showToast("相关功能正在开发中");
      return;
    }
    this.showToast("相关功能正在开发中");
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
  },

  exitShareSelection() {
    this.setData({
      shareSelectionMode: false,
      shareRevealMessageId: "",
      selectedMessageIds: [],
      selectedMessageMap: {},
      shareRoundCount: 0
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
    if (!activeChild) {
      const profileSummary = [
        "当前为通用咨询模式",
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
      const profileSummary = buildChildProfileSummary(activeChild, parentRole);
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

  loginWithPhone(event) {
    if (this.data.bindingPhone) return;
    const phoneCode = String(event && event.detail && event.detail.code || "");
    if (!phoneCode) {
      this.setData({ profilePanelMessage: "需要授权手机号后登录" });
      this.showToast("需要授权手机号后登录");
      return;
    }
    this.setData({ bindingPhone: true, profilePanelMessage: "" });
    wx.login({
      success: ({ code }) => {
        if (!code) {
          this.setData({ bindingPhone: false, profilePanelMessage: "微信登录失败，请重试" });
          this.showToast("微信登录失败，请重试");
          return;
        }
        request({
          method: "POST",
          url: "/api/wechat-mini/login",
          data: { code, phoneCode }
        })
          .then((payload) => {
            setSession(payload);
            const app = typeof getApp === "function" ? getApp() : null;
            if (app) {
              if (typeof app.setLoginSession === "function") {
                app.setLoginSession(payload);
              } else {
                app.globalData = app.globalData || {};
                app.globalData.token = getToken();
                app.globalData.user = getUser();
              }
            }
            this.setData({ xiaowanziLoginRequired: false, bindingPhone: false, profilePanelMessage: "登录成功" });
            this.initializeXiaowanzi(this._initialOptions || {});
          })
          .catch((error) => {
            this.setData({ bindingPhone: false, profilePanelMessage: error.message || "登录失败" });
            this.showToast(error.message || "登录失败");
          });
      },
      fail: () => {
        this.setData({ bindingPhone: false, profilePanelMessage: "无法调用微信登录" });
        this.showToast("无法调用微信登录");
      }
    });
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
      const selectedShare = buildSelectedWechatShare(currentShareMessages(this.data), this.data.selectedMessageIds);
      if (selectedShare) return selectedShare;
    }
    return createPageShare(SHARE_OPTIONS).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare(SHARE_OPTIONS).onShareTimeline();
  }
});
