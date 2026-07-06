import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiUrl } from "../../lib/api";
import { LearningMaterial, Program, publicApi, PublicGuestDetail, PublicGuest } from "../../services/api";
import { forceExitMiniProgramXiaowanzi, isMiniProgramWebView, openMiniProgramNativeArchiveCreate, openMiniProgramNativeArchivePicker } from "../../utils/mpAuthBridge";
import { useXiaowanziEmbeddedLayer } from "../../utils/xiaowanziLayer";
import { getAdminOrUserToken, hasAdminBypass, isProBillingEnabled, isProRequiredPayload, showProUpgradeFromPayload } from "../../utils/proGate";
import {
  advanceAvatarState,
  buildXiaowanziInlineLinks,
  buildXiaowanziMentionLinks,
  buildChildProfileSummary,
  buildXiaowanziPromptPayload,
  canEnterXiaowanziSuperMode,
  clampFabPosition,
  FAB_SIZE,
  getAvatarSrc,
  getDefaultFabPosition,
  isNumberedMessageLine,
  normalizeAssistantLinkDisplayText,
  normalizeAssistantLayoutText,
  shouldPersistChildMemory,
  XiaowanziMentionLink,
} from "./XiaowanziWidget.logic";

type Msg = { role: "user" | "assistant"; content: string; ts?: string };
type HistorySessionCard = { id: string; title: string; sub: string; targetIndex?: number; sessionId?: string; childTag?: string };
type ShortcutItem = { label: string; prompt: string };
type TopicPromptItem = { label: string; prompt: string };
type ConversationSession = {
  id: string;
  title: string;
  childId?: string | null;
  childName?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: string;
};
type ChildProfileLite = {
  id: string;
  relation: string;
  displayName: string;
  gender: "男" | "女";
  birthDate: string;
  city?: string;
  region?: string;
  grade: string;
  concernTags: string[];
  avatar: string;
  createdAt: string;
  draft?: boolean;
};
type ChildProfileDeletion = {
  id: string;
  removedAt: string;
};
type ChatSessionContext = {
  sessionId: string;
  childProfileId: string;
  isChildBound: boolean;
  lastSwitchedAt: string;
};
type BrowsingMemoryItem = {
  pathname: string;
  label: string;
  summary: string;
  visitedAt: string;
};
type XiaowanziSyncPayload = {
  childProfiles?: ChildProfileLite[];
  childProfileDeletions?: ChildProfileDeletion[];
  chatContext?: ChatSessionContext | null;
  browsingMemory?: BrowsingMemoryItem[];
  conversationSessions?: ConversationSession[];
  conversationMessages?: Record<string, Msg[]>;
};
type PageContextPayload = {
  summary: string;
  readReceipt: string;
  shortcuts: ShortcutItem[];
};
type ChildMemoryPayload = {
  enabled?: boolean;
  summary?: string;
  skipped?: boolean;
};
type UploadedImage = {
  name: string;
  dataUrl: string;
  kind?: "image" | "file";
};
type HomeBrowseTarget = {
  path: string;
  label: string;
};
type XiaowanziTopicLinkSource = {
  _id?: string;
  id?: string;
  slug?: string;
  title?: string;
};
type XiaowanziWidgetProps = {
  standalone?: boolean;
  hideLauncher?: boolean;
};
const STANDALONE_MENU_ITEMS: HomeBrowseTarget[] = [
  { label: "播客节目", path: "/programs/list" },
  { label: "先疯智库", path: "/experts" },
  { label: "及阅", path: "/reading" },
  { label: "学习资料", path: "/materials" },
  { label: "请教一下", path: "/topics" },
  { label: "知物", path: "/worthbuy" },
];

function normalizeShortcutPrompt(prompt: string): string {
  return String(prompt || "")
    .replace(/《[^》]+》/g, "")
    .replace(/基于[^,。;::]*[,。;::]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const BOT_ID = "xiaowanzi_debug_bot";
const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { label: "🧾 页面摘要", prompt: "给我一个简明摘要" },
  { label: "🎯 关键要点", prompt: "提炼最关键的 3 个要点" },
  { label: "🧭 下一步建议", prompt: "我下一步应该做什么" },
  { label: "🔎 信息定位", prompt: "最值得先看的信息在哪里" },
];
const HOME_FALLBACK_PROMPT_GROUPS: TopicPromptItem[][] = [
  [
    { label: "孩子写作业拖延怎么办？", prompt: "孩子写作业拖延怎么办？" },
    { label: "孩子被批评后情绪崩了怎么接？", prompt: "孩子被批评后情绪崩了怎么接？" },
    { label: "睡前总吵架怎么沟通？", prompt: "睡前总吵架怎么沟通？" },
  ],
  [
    { label: "孩子不愿意开口聊学校怎么办？", prompt: "孩子不愿意开口聊学校怎么办？" },
    { label: "一提醒学习就顶嘴怎么沟通？", prompt: "一提醒学习就顶嘴怎么沟通？" },
    { label: "孩子总说自己不行怎么鼓励？", prompt: "孩子总说自己不行怎么鼓励？" },
  ],
  [
    { label: "孩子做事三分钟热度怎么办？", prompt: "孩子做事三分钟热度怎么办？" },
    { label: "考试前焦虑怎么帮他稳下来？", prompt: "考试前焦虑怎么帮他稳下来？" },
    { label: "孩子沉迷短视频怎么谈规则？", prompt: "孩子沉迷短视频怎么谈规则？" },
  ],
  [
    { label: "孩子总和同学闹矛盾怎么办？", prompt: "孩子总和同学闹矛盾怎么办？" },
    { label: "写作业时注意力总飘怎么办？", prompt: "写作业时注意力总飘怎么办？" },
    { label: "怎么帮孩子建立睡前节奏？", prompt: "怎么帮孩子建立睡前节奏？" },
  ],
];
const HOME_FALLBACK_PROMPTS: TopicPromptItem[] = HOME_FALLBACK_PROMPT_GROUPS.flat();
const HOME_PROMPT_BLOCKED_TERMS = ["节目", "这期", "本期", "先听", "哪一段", "收听"];
const HOME_FALLBACK_PROMPT_ROTATION_KEY = "xiaowanzi_home_fallback_prompt_group_v1";
const MESSAGE_LAYOUT_VERSION = "md-paragraph-v3";
function isReadReceiptMessage(content: string): boolean {
  const text = String(content || "").trim();
  if (!text) return false;
  const hasReadPrefix =
    text.includes("我已读取") ||
    text.includes("已读取当前") ||
    text.includes("已进入当前页面") ||
    text.includes("已在超能模式中打开") ||
    /^已读取《[^》]+》/.test(text);
  if (!hasReadPrefix) return false;
  return (
    text.includes("你可以直接点下方") ||
    text.includes("你可以继续问我") ||
    text.includes("你可以继续告诉我") ||
    text.includes("本期词典") ||
    text.includes("嘉宾介绍") ||
    text.includes("延伸阅读") ||
    text.includes("内容推荐") ||
    text.includes("先看谁") ||
    text.includes("如何按背景筛选") ||
    text.includes("哪位嘉宾更适合你的问题")
  );
}

function isFailedAssistantMessage(content: string): boolean {
  const text = String(content || "").trim();
  if (!text) return false;
  if (/^请求失败(?:[:：]|$)/.test(text)) return true;
  const knownFailureMessages = [
    "校验 Pro 权限失败",
    "Pro 权限校验失败",
    "校验权限失败",
    "权限校验失败",
    "登录态已过期",
    "无效的登录凭证",
  ];
  if (knownFailureMessages.includes(text)) return true;
  return (
    /^(校验|验证|检查).{0,16}(失败|出错)$/.test(text) ||
    /^.*(权限|登录凭证|登录态).{0,12}(失败|无效|过期)$/.test(text)
  );
}

function isShareableAssistantMessage(message: Msg) {
  if (message.role !== "assistant") return false;
  if (message.content === "__THINKING__") return false;
  const content = String(message.content || "").trim();
  if (!content) return false;
  if (isReadReceiptMessage(content)) return false;
  if (isFailedAssistantMessage(message.content)) return false;
  return true;
}

function extractUserQuestion(content: string): string {
  const text = String(content || "").trim();
  if (!text) return "";
  const marker = "[用户问题]";
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex < 0) return text;
  const question = text.slice(markerIndex + marker.length).trim();
  return question || text;
}

function sanitizeDisplayMessage(msg: Msg): Msg {
  if (msg.role !== "user") return msg;
  return {
    ...msg,
    content: extractUserQuestion(msg.content),
  };
}

type XiaowanziMentionLinkClick = (event: React.MouseEvent<HTMLAnchorElement>, link: XiaowanziMentionLink) => void;

function normalizeMessageLinkKey(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findMarkdownMentionLink(label: string, href: string, mentionLinks: XiaowanziMentionLink[]) {
  const normalizedLabel = normalizeMessageLinkKey(label);
  const normalizedHref = String(href || "").trim();
  return mentionLinks.find((link) => normalizeMessageLinkKey(link.title) === normalizedLabel || link.href === normalizedHref);
}

function renderTextWithMentionLinks(
  content: string,
  mentionLinks: XiaowanziMentionLink[],
  keyPrefix: string,
  onMentionLinkClick?: XiaowanziMentionLinkClick,
  usedLinkKeys: Set<string> = new Set(),
) {
  const text = String(content || "");
  const links = buildXiaowanziInlineLinks(text, mentionLinks)
    .filter((link) => !usedLinkKeys.has(normalizeMessageLinkKey(link.title)));
  if (!text || !links.length) return [<span key={`${keyPrefix}-text`}>{text}</span>];

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let nodeIndex = 0;

  while (cursor < text.length) {
    const matched = links.find((link) => text.startsWith(link.title, cursor));
    if (!matched) {
      const nextMatchIndex = links.reduce((nearest, link) => {
        const index = text.indexOf(link.title, cursor + 1);
        return index >= 0 && index < nearest ? index : nearest;
      }, text.length);
      nodes.push(<span key={`${keyPrefix}-plain-${nodeIndex}`}>{text.slice(cursor, nextMatchIndex)}</span>);
      cursor = nextMatchIndex;
      nodeIndex += 1;
      continue;
    }

    const linkKey = normalizeMessageLinkKey(matched.title);
    usedLinkKeys.add(linkKey);
    nodes.push(
      <a
        key={`${keyPrefix}-link-${nodeIndex}`}
        className="xw-msg-link"
        href={matched.href}
        onClick={(event) => onMentionLinkClick?.(event, matched)}
      >
        {matched.title}
      </a>,
    );
    cursor += matched.title.length;
    nodeIndex += 1;
  }

  return nodes;
}

function renderMarkdownLinksAndText(
  content: string,
  mentionLinks: XiaowanziMentionLink[],
  keyPrefix: string,
  onMentionLinkClick?: XiaowanziMentionLinkClick,
  usedLinkKeys: Set<string> = new Set(),
) {
  const text = String(content || "");
  const markdownLinkRe = /\[([^\]\n]{1,120})\]\((\/[^)\s]+|https?:\/\/[^)\s]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownLinkRe.exec(text))) {
    const [fullMatch, label, href] = match;
    const start = match.index;
    if (start > cursor) {
      nodes.push(...renderTextWithMentionLinks(text.slice(cursor, start), mentionLinks, `${keyPrefix}-text-${index}`, onMentionLinkClick, usedLinkKeys));
      index += 1;
    }

    const linkKey = normalizeMessageLinkKey(label);
    const matchedMention = findMarkdownMentionLink(label, href, mentionLinks);
    if (usedLinkKeys.has(linkKey)) {
      nodes.push(<span key={`${keyPrefix}-md-plain-${index}`}>{label}</span>);
    } else {
      usedLinkKeys.add(linkKey);
      nodes.push(
        <a
          key={`${keyPrefix}-md-link-${index}`}
          className="xw-msg-link"
          href={matchedMention?.href || href}
          onClick={(event) => matchedMention ? onMentionLinkClick?.(event, matchedMention) : undefined}
        >
          {label}
        </a>,
      );
    }
    cursor = start + fullMatch.length;
    index += 1;
  }

  if (cursor < text.length) {
    nodes.push(...renderTextWithMentionLinks(text.slice(cursor), mentionLinks, `${keyPrefix}-tail`, onMentionLinkClick, usedLinkKeys));
  }

  return nodes.length ? nodes : renderTextWithMentionLinks(text, mentionLinks, keyPrefix, onMentionLinkClick, usedLinkKeys);
}

function renderInlineMarkdown(
  content: string,
  mentionLinks: XiaowanziMentionLink[] = [],
  onMentionLinkClick?: XiaowanziMentionLinkClick,
  usedLinkKeys: Set<string> = new Set(),
) {
  const parts = String(content || "").split(/(\*\*[\s\S]+?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index}>
          {renderMarkdownLinksAndText(part.slice(2, -2).trim(), mentionLinks, `bold-${index}`, onMentionLinkClick, usedLinkKeys)}
        </strong>
      );
    }
    return renderMarkdownLinksAndText(part, mentionLinks, `part-${index}`, onMentionLinkClick, usedLinkKeys);
  });
}

function renderAssistantMessageContent(
  content: string,
  mentionLinks: XiaowanziMentionLink[] = [],
  onMentionLinkClick?: XiaowanziMentionLinkClick,
) {
  const linkedMentionKeys = new Set<string>();
  const blocks = normalizeAssistantLayoutText(normalizeAssistantLinkDisplayText(content))
    .split(/\n{2,}/g)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <span className="xw-msg-flow">
      {blocks.map((block, blockIndex) => (
        <span className="xw-msg-block" key={`block-${blockIndex}`}>
          {block.split(/\n/g).map((line, lineIndex) => (
            <span className={`xw-msg-line ${isNumberedMessageLine(line) ? "numbered" : ""}`.trim()} key={`line-${blockIndex}-${lineIndex}`}>
              {renderInlineMarkdown(line.trim(), mentionLinks, onMentionLinkClick, linkedMentionKeys)}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function renderDisplayMessage(
  message: Msg,
  mentionLinks: XiaowanziMentionLink[] = [],
  onMentionLinkClick?: XiaowanziMentionLinkClick,
) {
  if (message.content === "__THINKING__") {
    return (
      <span key={message.ts} className="xw-thinking-dots">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="xw-thinking-label">小玩子思考中</span>
      </span>
    );
  }
  return message.role === "assistant" ? renderAssistantMessageContent(message.content, mentionLinks, onMentionLinkClick) : message.content;
}

function getAuthHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getSessionToken(): string {
  return (getAdminOrUserToken() || localStorage.getItem("wel_tok") || "").trim();
}

const SHARE_CARD_SITE_URL = "https://xianfeng.xinzhi.info";
const SHARE_CARD_LOGO_URL = "/assets/wel-avatar/no-hat.png";
const SHARE_CARD_WIDTH = 750;
const SHARE_CARD_LOGO_HEIGHT = 156;
const SHARE_CARD_MAX_PIXELS = 5_400_000;
const SHARE_REVEAL_HIDE_DELAY_MS = 5000;
let cachedShareLogoPromise: Promise<HTMLImageElement | null> | null = null;
let cachedShareQrPromise: Promise<HTMLImageElement | null> | null = null;

function loadShareImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function getCachedShareLogo(): Promise<HTMLImageElement | null> {
  if (!cachedShareLogoPromise) cachedShareLogoPromise = loadShareImage(SHARE_CARD_LOGO_URL);
  return cachedShareLogoPromise;
}

async function getCachedShareQr(): Promise<HTMLImageElement | null> {
  if (!cachedShareQrPromise) {
    cachedShareQrPromise = (async () => {
      const { default: QR } = await import("qrcode");
      const qr = await QR.toDataURL(SHARE_CARD_SITE_URL, {
        width: 140,
        margin: 1,
        color: { dark: "#1e293b", light: "#f8f7fc" },
      });
      return loadShareImage(qr);
    })();
  }
  return cachedShareQrPromise;
}

function getShareCardScale(totalHeight: number): number {
  const scale = Math.sqrt(SHARE_CARD_MAX_PIXELS / (SHARE_CARD_WIDTH * Math.max(totalHeight, 1)));
  return Math.max(1.15, Math.min(1.6, scale));
}

function canvasToShareObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("share card blob encoding failed"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

function resetHomeInputHeight(textarea: HTMLTextAreaElement) {
  textarea.closest(".xw-home-input-shell")?.classList.remove("multiline");
  textarea.style.height = "58px";
  textarea.style.lineHeight = "58px";
}

function syncHomeInputHeight(textarea: HTMLTextAreaElement, value: string): boolean {
  const shell = textarea.closest(".xw-home-input-shell");
  shell?.classList.remove("multiline");
  textarea.style.height = "58px";
  textarea.style.lineHeight = "58px";
  const expanded = Boolean(value.length > 0 && (value.includes("\n") || textarea.scrollHeight > 66));
  if (!expanded) return false;
  shell?.classList.add("multiline");
  textarea.style.lineHeight = "1.38";
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  return true;
}

function showXiaowanziSuperModeLoginModal() {
  document.dispatchEvent(new CustomEvent("xf-show-login-modal", {
    detail: {
      title: "登录后使用小玩子",
      description: "登录后可使用小玩子提问、同步孩子档案、页面浏览上下文和个性化建议。",
    },
  }));
}

function handleExpiredXiaowanziSession() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("wel_tok");
  } catch (_error) {}
  showXiaowanziSuperModeLoginModal();
}

function canEnterXiaowanziSuperModeFromStorage(): boolean {
  try {
    if (hasAdminBypass()) return true;
    return canEnterXiaowanziSuperMode({ token: localStorage.getItem("token"), welToken: localStorage.getItem("wel_tok") });
  } catch (_error) {
    return false;
  }
}

function shouldBlockXiaowanziSuperModeForAuth(): boolean {
  if (canEnterXiaowanziSuperModeFromStorage()) return false;
  clearXiaowanziHomeActive();
  showXiaowanziSuperModeLoginModal();
  return true;
}

function shouldBlockXiaowanziForAuth(): boolean {
  if (canEnterXiaowanziSuperModeFromStorage()) return false;
  showXiaowanziSuperModeLoginModal();
  return true;
}

function getCurrentParentRole(): string {
  try {
    const raw = localStorage.getItem("user");
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed?.parentRole || "").trim();
  } catch (_error) {
    return "";
  }
}

async function loadChildMemory(childId: string): Promise<ChildMemoryPayload> {
  if (!childId) return {};
  if (!getSessionToken()) return {};
  try {
    const res = await fetch(apiUrl(`/api/users/me/child-memories/${encodeURIComponent(childId)}`), {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return {};
    return await res.json().catch(() => ({}));
  } catch (_error) {
    return {};
  }
}

async function mergeChildMemory(input: {
  childId: string;
  childProfile: string;
  userMessage: string;
  assistantReply: string;
}): Promise<ChildMemoryPayload | null> {
  if (!input.childId || !getSessionToken()) return null;
  try {
    const res = await fetch(apiUrl(`/api/users/me/child-memories/${encodeURIComponent(input.childId)}/merge`), {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        childProfile: input.childProfile,
        userMessage: input.userMessage,
        assistantReply: input.assistantReply,
      }),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_error) {
    return null;
  }
}

const DEFAULT_MESSAGE = { role: "assistant" as const, content: "你好,我是小玩子 ✨", ts: new Date().toISOString() };
const AVATAR_FADE_DURATION_MS = 300;
const AVATAR_EFFECT_DURATION_MS = 500;
const AVATAR_FALLBACK_SRC = "/assets/wel-avatar/optimized/no-hat.webp";
const LEGACY_AVATAR_INDEX_KEY = "wel_avatar_index";
const LEGACY_AVATAR_CLICK_COUNT_KEY = "wel_avatar_click_count";
const GLOBAL_HISTORY_CACHE_KEY = "xiaowanzi_global_history_v1";
const CHILD_HISTORY_CACHE_PREFIX = "xiaowanzi_child_history_v1:";
const XIAOWANZI_SESSION_INDEX_KEY = "xiaowanzi_session_index_v1";
const XIAOWANZI_ACTIVE_SESSION_KEY = "xiaowanzi_active_session_id_v1";
const XIAOWANZI_SESSION_MESSAGES_PREFIX = "xiaowanzi_session_messages_v1:";
const XIAOWANZI_TOPIC_PROMPT_CACHE_KEY = "xiaowanzi_topic_prompt_cache_v1";
const GLOBAL_DOCKED_PREF_KEY = "xiaowanzi_global_docked_v1";
const GLOBAL_DOCKED_THEME_KEY = "xiaowanzi_global_docked_theme_v1";
const CHILD_PROFILES_KEY = "xiaowanzi_child_profiles_v1";
const CHILD_PROFILE_DELETIONS_KEY = "xiaowanzi_child_profile_deletions_v1";
const CHAT_CONTEXT_KEY = "xiaowanzi_chat_context_v1";
const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const BROWSING_MEMORY_KEY = "xiaowanzi_browsing_memory_v1";
const RETURN_TO_HOME_KEY = "xiaowanzi_return_home_v1";
const HOME_ACTIVE_KEY = "xiaowanzi_home_active_v1";
const MINI_PROGRAM_XIAOWANZI_RESET_QUERY_KEY = "xf_xw_reset";
const MINI_PROGRAM_XIAOWANZI_ACTION_QUERY_KEY = "xf_xw_action";
const MINI_PROGRAM_CHILD_PROFILES_QUERY_KEY = "xf_child_profiles";
const MINI_PROGRAM_CHILD_ID_QUERY_KEY = "xf_child_id";
const APP_MODE_KEY = "xiaowanzi_app_mode_v1";
const HOME_DESKTOP_BREAKPOINT = 769;
const PANEL_WIDTH = 360;
const DOCKED_WIDTH = 430;
const DOCKED_TOP_OFFSET = 0;
const PANEL_MAX_HEIGHT = 520;
const PANEL_GAP = 14;

function readMiniProgramXiaowanziEntryMode(): "chat" | "home" | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("xf_xw");
    return raw === "home" ? "home" : raw === "chat" ? "chat" : null;
  } catch (_error) {
    return null;
  }
}

function shouldResetMiniProgramXiaowanziEntry(): boolean {
  if (typeof window === "undefined" || !isMiniProgramWebView()) return false;
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get(MINI_PROGRAM_XIAOWANZI_RESET_QUERY_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

function clearMiniProgramXiaowanziResetParam() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(MINI_PROGRAM_XIAOWANZI_RESET_QUERY_KEY)) return;
    url.searchParams.delete(MINI_PROGRAM_XIAOWANZI_RESET_QUERY_KEY);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch (_error) {}
}

function applyMiniProgramNativeCapsuleVars() {
  if (typeof window === "undefined" || !isMiniProgramWebView()) return;
  try {
    const url = new URL(window.location.href);
    const mappings = [
      ["xf_native_capsule_top", "--xf-native-capsule-top"],
      ["xf_native_action_top", "--xf-native-action-top"],
      ["xf_native_capsule_height", "--xf-native-capsule-height"],
      ["xf_native_capsule_right", "--xf-native-capsule-right"],
      ["xf_native_topbar_height", "--xf-native-topbar-height"],
      ["xf_native_webview_shift", "--xf-native-webview-shift"],
    ] as const;
    mappings.forEach(([param, cssVar]) => {
      const value = Number(url.searchParams.get(param));
      if (!Number.isFinite(value) || value <= 0) return;
      document.documentElement.style.setProperty(cssVar, `${Math.round(value)}px`);
    });
  } catch (_error) {}
}

function shouldRestoreXiaowanziHome(): boolean {
  if (typeof window === "undefined") return false;
  if (shouldResetMiniProgramXiaowanziEntry()) {
    clearXiaowanziHomeActive();
    clearMiniProgramXiaowanziResetParam();
    return false;
  }
  if (!canEnterXiaowanziSuperModeFromStorage()) {
    clearXiaowanziHomeActive();
    return false;
  }
  const miniProgramEntryMode = readMiniProgramXiaowanziEntryMode();
  if (miniProgramEntryMode === "chat") {
    clearXiaowanziHomeActive();
    return false;
  }
  if (miniProgramEntryMode === "home") return true;
  try {
    if (shouldSkipXiaowanziHomeIntro()) return true;
    return localStorage.getItem(HOME_ACTIVE_KEY) === "1";
  } catch (_error) {
    try {
      return localStorage.getItem(HOME_ACTIVE_KEY) === "1";
    } catch (_innerError) {
      return false;
    }
  }
}

function shouldSkipXiaowanziHomeIntro(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("xw_restore") === "xiaowanzi";
  } catch (_error) {
    return false;
  }
}

function takeMiniProgramXiaowanziEntryMode(): "chat" | "home" | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const mode = readMiniProgramXiaowanziEntryMode();
    if (!mode) return null;
    url.searchParams.delete("xf_xw");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return mode;
  } catch (_error) {
    return null;
  }
}

function takeMiniProgramXiaowanziAction(): "history" | "new" | null {
  if (typeof window === "undefined" || !isMiniProgramWebView()) return null;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(MINI_PROGRAM_XIAOWANZI_ACTION_QUERY_KEY);
    const action = raw === "history" ? "history" : raw === "new" ? "new" : null;
    if (!action) return null;
    url.searchParams.delete(MINI_PROGRAM_XIAOWANZI_ACTION_QUERY_KEY);
    url.searchParams.delete("xf_xw_ts");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return action;
  } catch (_error) {
    return null;
  }
}

function clearXiaowanziRestoreMarker() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(RETURN_TO_HOME_KEY);
  } catch (_error) {}
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("xw_restore") !== "xiaowanzi") return;
    url.searchParams.delete("xw_restore");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch (_error) {}
}

function persistXiaowanziHomeActive() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HOME_ACTIVE_KEY, "1");
  } catch (_error) {}
}

function clearXiaowanziHomeActive() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HOME_ACTIVE_KEY);
  } catch (_error) {}
  try {
    sessionStorage.removeItem(RETURN_TO_HOME_KEY);
  } catch (_error) {}
}

function shouldUseXiaowanziAppMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(APP_MODE_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

function childProfileTime(value?: string | null): number {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function loadChildProfileDeletions(): ChildProfileDeletion[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CHILD_PROFILE_DELETIONS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return mergeByLatest(
      parsed
        .map((item: any): ChildProfileDeletion => ({
          id: String(item?.id || "").trim(),
          removedAt: String(item?.removedAt || new Date(0).toISOString()),
        }))
        .filter((item) => Boolean(item.id)),
      (item) => item.id,
      (item) => item.removedAt,
      12
    );
  } catch (_error) {
    return [];
  }
}

function isDeletedChildProfile(item: { id: string; createdAt?: string }, deletions: ChildProfileDeletion[]): boolean {
  const removed = deletions.find((entry) => entry.id === item.id);
  return Boolean(removed) && childProfileTime(removed?.removedAt) >= childProfileTime(item.createdAt);
}

function normalizeChildProfileLite(item: any, index = 0): ChildProfileLite | null {
  const displayName = normalizeChildProfileDisplayName(item?.displayName || item?.name || item?.title);
  const id = String(item?.id || (displayName ? `child-${index}` : "")).trim();
  if (!id || !displayName) return null;
  return {
    id,
    relation: String(item?.relation || "").trim(),
    displayName,
    gender: item?.gender === "男" ? "男" : "女",
    birthDate: String(item?.birthDate || "").trim(),
    city: String(item?.city || "").trim(),
    region: String(item?.region || "").trim(),
    grade: String(item?.grade || "").trim(),
    concernTags: Array.isArray(item?.concernTags) ? item.concernTags.map((v: any) => String(v || "").trim()).filter(Boolean) : [],
    avatar: String(item?.avatar || AVATAR_FALLBACK_SRC).trim(),
    createdAt: String(item?.createdAt || new Date().toISOString()),
    draft: Boolean(item?.draft),
  };
}

function normalizeChildProfileDisplayName(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function dedupeChildProfilesByDisplayName(items: ChildProfileLite[]): ChildProfileLite[] {
  const byName = new Map<string, ChildProfileLite>();
  items.forEach((item) => {
    const nameKey = normalizeChildProfileDisplayName(item.displayName);
    if (!nameKey) return;
    byName.set(nameKey, { ...item, displayName: nameKey });
  });
  return Array.from(byName.values());
}

function applyMiniProgramChildProfileBridge(): ChildProfileLite[] | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const rawProfiles = url.searchParams.get(MINI_PROGRAM_CHILD_PROFILES_QUERY_KEY);
    if (!rawProfiles) return null;
    const parsed = JSON.parse(rawProfiles);
    if (!Array.isArray(parsed)) return null;
    const childProfileDeletions = loadChildProfileDeletions();
    const profiles = dedupeChildProfilesByDisplayName(parsed
      .map((item: any, index: number) => normalizeChildProfileLite(item, index))
      .filter((item): item is ChildProfileLite => {
        if (!item) return false;
        return !item.draft && !isDeletedChildProfile(item, childProfileDeletions);
      }));
    localStorage.setItem(CHILD_PROFILES_KEY, JSON.stringify(profiles));
    const preferredChildId = String(url.searchParams.get(MINI_PROGRAM_CHILD_ID_QUERY_KEY) || "").trim();
    const picked = profiles.find((item) => item.id === preferredChildId) || profiles[0] || null;
    if (picked) {
      const nextContext: ChatSessionContext = {
        sessionId: `session-${Date.now()}`,
        childProfileId: picked.id,
        isChildBound: true,
        lastSwitchedAt: new Date().toISOString(),
      };
      localStorage.setItem(CHAT_CONTEXT_KEY, JSON.stringify(nextContext));
      localStorage.setItem(LAST_CHILD_ID_KEY, picked.id);
    } else {
      localStorage.removeItem(CHAT_CONTEXT_KEY);
      localStorage.removeItem(LAST_CHILD_ID_KEY);
    }
    url.searchParams.delete(MINI_PROGRAM_CHILD_PROFILES_QUERY_KEY);
    url.searchParams.delete(MINI_PROGRAM_CHILD_ID_QUERY_KEY);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return profiles;
  } catch (_error) {
    return null;
  }
}

function loadChildProfiles(): ChildProfileLite[] {
  if (typeof window === "undefined") return [];
  try {
    const bridgedProfiles = applyMiniProgramChildProfileBridge();
    if (bridgedProfiles) return bridgedProfiles;
    const childProfileDeletions = loadChildProfileDeletions();
    const raw = localStorage.getItem(CHILD_PROFILES_KEY) || "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeChildProfilesByDisplayName(parsed
      .map((item: any, index: number) => normalizeChildProfileLite(item, index))
      .filter((item): item is ChildProfileLite => {
        if (!item) return false;
        return Boolean(item.id) && !item.draft && !isDeletedChildProfile(item, childProfileDeletions);
      }));
  } catch (_error) {
    return [];
  }
}

function saveChildProfiles(items: ChildProfileLite[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHILD_PROFILES_KEY, JSON.stringify(dedupeChildProfilesByDisplayName(items)));
    scheduleXiaowanziAccountSync();
  } catch (_error) {}
}

function loadChatContext(): ChatSessionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHAT_CONTEXT_KEY);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (!item || typeof item !== "object") return null;
    return {
      sessionId: String(item.sessionId || ""),
      childProfileId: String(item.childProfileId || ""),
      isChildBound: Boolean(item.isChildBound),
      lastSwitchedAt: String(item.lastSwitchedAt || ""),
    };
  } catch (_error) {
    return null;
  }
}

function saveChatContext(context: ChatSessionContext | null) {
  if (typeof window === "undefined") return;
  try {
    if (!context) {
      localStorage.removeItem(CHAT_CONTEXT_KEY);
      scheduleXiaowanziAccountSync();
      return;
    }
    localStorage.setItem(CHAT_CONTEXT_KEY, JSON.stringify(context));
    scheduleXiaowanziAccountSync();
  } catch (_error) {}
}

function calcAgeYears(birthDate: string): number {
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const md = now.getMonth() - date.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < date.getDate())) age -= 1;
  return Math.max(0, age);
}

function buildChildShortcuts(profile: ChildProfileLite | null): ShortcutItem[] {
  if (!profile) return DEFAULT_SHORTCUTS;
  const age = calcAgeYears(profile.birthDate);
  const ageText = age > 0 ? `${age}岁` : "孩子";
  const gradeText = profile.grade || "当前阶段";
  const tags = profile.concernTags.slice(0, 3);
  const tagText = tags.join("、") || "近期状态";
  return [
    { label: "🧒 当前状态", prompt: `${profile.displayName}${gradeText}阶段，关注${tagText}，我先做什么？` },
    { label: "📘 本期怎么用", prompt: `结合${profile.displayName}的情况，本期最该做的3件事？` },
    { label: "🧭 追问建议", prompt: `${profile.displayName}在${tagText}上没改善，下一轮怎么问？` },
    { label: "👪 亲子沟通", prompt: `给我一段和${profile.displayName}沟通的话术，围绕${tagText}` },
  ];
}

function historyCacheKey(childId?: string | null): string {
  return childId ? `${CHILD_HISTORY_CACHE_PREFIX}${childId}` : GLOBAL_HISTORY_CACHE_KEY;
}

function loadCachedHistory(childId?: string | null): Msg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(historyCacheKey(childId)) || "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): Msg => ({
        role: item?.role === "user" ? "user" : "assistant",
        content: String(item?.content || "").trim(),
        ts: item?.ts ? String(item.ts) : undefined,
      }))
      .filter((item) => item.content && item.content !== DEFAULT_MESSAGE.content && !isReadReceiptMessage(item.content) && item.content !== "__THINKING__")
      .map(sanitizeDisplayMessage);
  } catch (_error) {
    return [];
  }
}

function loadCachedGlobalHistory(): Msg[] {
  return loadCachedHistory(null);
}

function saveCachedHistory(items: Msg[], childId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      historyCacheKey(childId),
      JSON.stringify((items || []).filter((item) => item.content !== DEFAULT_MESSAGE.content && !isReadReceiptMessage(item.content) && item.content !== "__THINKING__").map(sanitizeDisplayMessage).slice(-120))
    );
    scheduleXiaowanziAccountSync();
  } catch (_error) {}
}

function saveCachedGlobalHistory(items: Msg[]) {
  saveCachedHistory(items, null);
}

function createConversationSessionId(): string {
  return `xw-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readActiveConversationSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    return String(localStorage.getItem(XIAOWANZI_ACTIVE_SESSION_KEY) || "").trim();
  } catch (_error) {
    return "";
  }
}

function saveActiveConversationSessionId(sessionId: string) {
  if (!sessionId || typeof window === "undefined") return;
  try {
    localStorage.setItem(XIAOWANZI_ACTIVE_SESSION_KEY, sessionId);
  } catch (_error) {}
}

function conversationSessionMessagesKey(sessionId: string): string {
  return `${XIAOWANZI_SESSION_MESSAGES_PREFIX}${sessionId}`;
}

function formatHistoryTime(value?: string): string {
  const ts = value ? new Date(value) : null;
  return ts && !Number.isNaN(ts.getTime())
    ? `${ts.getMonth() + 1}/${ts.getDate()} ${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`
    : "历史会话";
}

function getConversationTitle(items: Msg[], fallback = "新的小玩子对话"): string {
  const picked = items.find((item) => item.role === "user" && item.content.trim() && !isReadReceiptMessage(item.content));
  const text = String(picked?.content || fallback).trim();
  return text.length > 30 ? `${text.slice(0, 30)}...` : text;
}

function loadConversationSessions(): ConversationSession[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(XIAOWANZI_SESSION_INDEX_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): ConversationSession => ({
        id: String(item?.id || ""),
        title: String(item?.title || "历史会话").trim() || "历史会话",
        childId: item?.childId ? String(item.childId) : null,
        childName: String(item?.childName || ""),
        createdAt: String(item?.createdAt || item?.updatedAt || new Date().toISOString()),
        updatedAt: String(item?.updatedAt || item?.createdAt || new Date().toISOString()),
        messageCount: Number.isFinite(Number(item?.messageCount)) ? Number(item.messageCount) : 0,
        lastMessage: item?.lastMessage ? String(item.lastMessage) : "",
      }))
      .filter((item) => item.id)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch (_error) {
    return [];
  }
}

function saveConversationSessions(items: ConversationSession[]) {
  if (typeof window === "undefined") return;
  try {
    const deduped = new Map<string, ConversationSession>();
    items.forEach((item) => {
      if (item.id) deduped.set(item.id, item);
    });
    const next = Array.from(deduped.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 40);
    localStorage.setItem(XIAOWANZI_SESSION_INDEX_KEY, JSON.stringify(next));
    scheduleXiaowanziAccountSync();
  } catch (_error) {}
}

function upsertConversationSession(session: ConversationSession) {
  const existing = loadConversationSessions().filter((item) => item.id !== session.id);
  saveConversationSessions([session, ...existing]);
}

function loadConversationSessionMessages(sessionId?: string | null): Msg[] {
  if (!sessionId || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(conversationSessionMessagesKey(sessionId)) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): Msg => ({
        role: item?.role === "user" ? "user" : "assistant",
        content: String(item?.content || "").trim(),
        ts: item?.ts ? String(item.ts) : undefined,
      }))
      .filter((item) => item.content && item.content !== DEFAULT_MESSAGE.content && !isReadReceiptMessage(item.content) && item.content !== "__THINKING__")
      .map(sanitizeDisplayMessage);
  } catch (_error) {
    return [];
  }
}

function saveConversationSessionMessages(sessionId: string, items: Msg[]) {
  if (!sessionId || typeof window === "undefined") return;
  try {
    localStorage.setItem(
      conversationSessionMessagesKey(sessionId),
      JSON.stringify((items || []).filter((item) => item.content !== DEFAULT_MESSAGE.content && !isReadReceiptMessage(item.content) && item.content !== "__THINKING__").map(sanitizeDisplayMessage).slice(-120))
    );
    scheduleXiaowanziAccountSync();
  } catch (_error) {}
}

function loadInitialConversationState(): { sessionId: string; messages: Msg[]; hasHistoryMessages: boolean } {
  const activeSessionId = readActiveConversationSessionId();
  if (activeSessionId) {
    const activeMessages = loadConversationSessionMessages(activeSessionId);
    if (activeMessages.length) {
      return { sessionId: activeSessionId, messages: activeMessages, hasHistoryMessages: true };
    }
    return { sessionId: activeSessionId, messages: [DEFAULT_MESSAGE], hasHistoryMessages: false };
  }
  return { sessionId: createConversationSessionId(), messages: [DEFAULT_MESSAGE], hasHistoryMessages: false };
}

let xiaowanziSyncTimer: number | null = null;
let xiaowanziSyncInFlight = false;
let xiaowanziSyncApplyingRemote = false;

function readBrowsingMemory(): BrowsingMemoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(BROWSING_MEMORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): BrowsingMemoryItem => ({
        pathname: String(item?.pathname || "").trim(),
        label: String(item?.label || "").trim(),
        summary: String(item?.summary || "").trim(),
        visitedAt: String(item?.visitedAt || new Date(0).toISOString()),
      }))
      .filter((item) => item.pathname)
      .slice(0, 40);
  } catch (_error) {
    return [];
  }
}

function collectXiaowanziSyncPayload(): XiaowanziSyncPayload {
  const conversationSessions = loadConversationSessions();
  const conversationMessages: Record<string, Msg[]> = {};
  conversationSessions.forEach((session) => {
    const messages = loadConversationSessionMessages(session.id);
    if (messages.length) conversationMessages[session.id] = messages;
  });
  return {
    childProfiles: loadChildProfiles(),
    childProfileDeletions: loadChildProfileDeletions(),
    chatContext: loadChatContext(),
    browsingMemory: readBrowsingMemory(),
    conversationSessions,
    conversationMessages,
  };
}

function latestTime(value?: string | null): number {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function mergeByLatest<T>(items: T[], keyOf: (item: T) => string, timeOf: (item: T) => string | undefined, limit: number): T[] {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const key = keyOf(item);
    if (!key) return;
    const current = map.get(key);
    if (!current || latestTime(timeOf(item)) >= latestTime(timeOf(current))) map.set(key, item);
  });
  return Array.from(map.values())
    .sort((a, b) => latestTime(timeOf(b)) - latestTime(timeOf(a)))
    .slice(0, limit);
}

function applyXiaowanziSyncPayload(remote: XiaowanziSyncPayload | null | undefined) {
  if (typeof window === "undefined" || !remote) return;
  xiaowanziSyncApplyingRemote = true;
  try {
    const childProfileDeletions = mergeByLatest(
      [...loadChildProfileDeletions(), ...(Array.isArray(remote.childProfileDeletions) ? remote.childProfileDeletions : [])],
      (item) => item.id,
      (item) => item.removedAt,
      12
    );
    localStorage.setItem(CHILD_PROFILE_DELETIONS_KEY, JSON.stringify(childProfileDeletions));

    const childProfiles = mergeByLatest(
      [...loadChildProfiles(), ...(Array.isArray(remote.childProfiles) ? remote.childProfiles : [])],
      (item) => item.id,
      (item) => item.createdAt,
      12
    ).filter((item) => !isDeletedChildProfile(item, childProfileDeletions));
    localStorage.setItem(CHILD_PROFILES_KEY, JSON.stringify(childProfiles));

    const localContext = loadChatContext();
    const remoteContext = remote.chatContext || null;
    const mergedContext =
      latestTime(remoteContext?.lastSwitchedAt) >= latestTime(localContext?.lastSwitchedAt)
        ? remoteContext
        : localContext;
    const nextContext =
      mergedContext?.childProfileId && !childProfiles.some((item) => item.id === mergedContext.childProfileId)
        ? null
        : mergedContext;
    if (nextContext) localStorage.setItem(CHAT_CONTEXT_KEY, JSON.stringify(nextContext));
    else localStorage.removeItem(CHAT_CONTEXT_KEY);

    const browsingMemory = mergeByLatest(
      [...readBrowsingMemory(), ...(Array.isArray(remote.browsingMemory) ? remote.browsingMemory : [])],
      (item) => item.pathname,
      (item) => item.visitedAt,
      40
    );
    localStorage.setItem(BROWSING_MEMORY_KEY, JSON.stringify(browsingMemory));

    const conversationSessions = mergeByLatest(
      [...loadConversationSessions(), ...(Array.isArray(remote.conversationSessions) ? remote.conversationSessions : [])],
      (item) => item.id,
      (item) => item.updatedAt,
      40
    );
    localStorage.setItem(XIAOWANZI_SESSION_INDEX_KEY, JSON.stringify(conversationSessions));
    const validSessionIds = new Set(conversationSessions.map((session) => session.id));
    const remoteMessages = remote.conversationMessages || {};
    validSessionIds.forEach((sessionId) => {
      const localMessages = loadConversationSessionMessages(sessionId);
      const nextMessages = Array.isArray(remoteMessages[sessionId]) && remoteMessages[sessionId].length
        ? remoteMessages[sessionId]
        : localMessages;
      if (nextMessages.length) {
        localStorage.setItem(conversationSessionMessagesKey(sessionId), JSON.stringify(nextMessages.slice(-120)));
      }
    });
  } catch (_error) {
  } finally {
    xiaowanziSyncApplyingRemote = false;
  }
}

async function pushXiaowanziAccountSync() {
  if (typeof window === "undefined" || xiaowanziSyncApplyingRemote || xiaowanziSyncInFlight) return;
  const token = getSessionToken();
  if (!token) return;
  xiaowanziSyncInFlight = true;
  try {
    await fetch(apiUrl("/api/users/me/xiaowanzi-sync"), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(collectXiaowanziSyncPayload()),
    });
  } catch (_error) {
  } finally {
    xiaowanziSyncInFlight = false;
  }
}

function scheduleXiaowanziAccountSync(delay = 1000) {
  if (typeof window === "undefined" || xiaowanziSyncApplyingRemote) return;
  if (!getSessionToken()) return;
  if (xiaowanziSyncTimer) window.clearTimeout(xiaowanziSyncTimer);
  xiaowanziSyncTimer = window.setTimeout(() => {
    xiaowanziSyncTimer = null;
    void pushXiaowanziAccountSync();
  }, delay);
}

async function pullAndMergeXiaowanziAccountSync(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const token = getSessionToken();
  if (!token) return false;
  try {
    const res = await fetch(apiUrl("/api/users/me/xiaowanzi-sync"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const remote = await res.json().catch(() => null);
    applyXiaowanziSyncPayload(remote);
    await pushXiaowanziAccountSync();
    return true;
  } catch (_error) {
    return false;
  }
}

function isMeaningfulHistory(items: Msg[]): boolean {
  return items.some((item) => item.content && item.content !== DEFAULT_MESSAGE.content && !isReadReceiptMessage(item.content));
}

type AvatarParticle = {
  id: number;
  size: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  delay: number;
};

function loadPersistedAvatarState() {
  if (typeof window === "undefined") {
    return { avatarIndex: 0, clickCount: 0 };
  }
  try {
    const avatarIndex = Number.parseInt(localStorage.getItem(LEGACY_AVATAR_INDEX_KEY) || "0", 10);
    const clickCount = Number.parseInt(localStorage.getItem(LEGACY_AVATAR_CLICK_COUNT_KEY) || "0", 10);
    return {
      avatarIndex: Number.isFinite(avatarIndex) && avatarIndex >= 0 ? avatarIndex : 0,
      clickCount: Number.isFinite(clickCount) && clickCount >= 0 ? clickCount : 0,
    };
  } catch (_error) {
    return { avatarIndex: 0, clickCount: 0 };
  }
}

function buildProgramListContext(programs: Program[]): PageContextPayload {
  const topPrograms = programs.slice(0, 3).map((item) => item.title).filter(Boolean);
  return {
    summary: `当前页面是节目列表页,已读取 ${programs.length} 个节目。优先节目包括:${topPrograms.join("、") || "暂无节目"}。`,
    readReceipt: `已读取当前节目列表:共 ${programs.length} 个节目。你可以继续问我:先看哪几期、不同主题怎么选、某一页节目适合什么问题。`,
    shortcuts: [
      { label: "🎙 先看哪期", prompt: "帮我挑 3 期最值得先听的节目" },
      { label: "🧭 主题筛选", prompt: "按主题帮我快速分类" },
      { label: "👪 适合谁听", prompt: "分别适合哪些家长问题" },
      { label: "📚 节目地图", prompt: "给我一个收听顺序建议" },
      { label: "⚡ 把嘉宾全拉出来", prompt: "请用最快速度把节目列表里有嘉宾介绍的节目全列出来！每期：节目标题+嘉宾身份，别啰嗦直接上干货！" },
    ],
  };
}

function buildProgramDetailContext(program: Program): PageContextPayload {
  const tags = Array.isArray(program.summary?.tags) ? program.summary?.tags?.slice(0, 4).join("、") : "";
  const guests = Array.isArray(program.guests)
    ? program.guests
        .map((guest) => guest?.name)
        .filter(Boolean)
        .join("、")
    : program.guest?.name || "";
  return {
    summary: `当前页面是节目详情页。节目标题:${program.title}。简介:${program.description || "暂无简介"}。${tags ? `标签:${tags}。` : ""}${guests ? `嘉宾:${guests}。` : ""}`,
    readReceipt: `已读取《${program.title}》页面。你可以继续问我:本期讲了啥、嘉宾是谁、词典概念有哪些~ 也可以试试"1秒钟我要看到这个嘉宾所有资料"😎`,
    shortcuts: [
      { label: "🧠 本期总结", prompt: "请总结这一期的核心观点" },
      { label: "👥 嘉宾观点", prompt: "请整理这期内容里的嘉宾观点与分工" },
      { label: "📖 词典概念", prompt: "请提炼值得关注的概念词条" },
      { label: "🧭 我该怎么听", prompt: "如果我是家长，这一期应重点关注什么" },
      { label: "⚡ 1秒钟我要看到这个嘉宾所有资料", prompt: "请用最快速度把本期所有嘉宾的资料一次性列出来！包含：嘉宾名字、身份/头衔、一句话介绍、在本期说了什么关键观点。别啰嗦直接上干货！" },
    ],
  };
}

function buildExpertsListContext(guests: PublicGuest[], keyword: string): PageContextPayload {
  const topGuests = guests.slice(0, 4).map((item) => item.name).filter(Boolean);
  return {
    summary: `当前页面是先疯智库列表页,已读取 ${guests.length} 位嘉宾。当前搜索词:${keyword || "无"}。当前可见嘉宾包括:${topGuests.join("、") || "暂无嘉宾"}。`,
    readReceipt: `已读取当前智库列表:共 ${guests.length} 位嘉宾。你可以继续问我:先看谁、如何按背景筛选、哪位嘉宾更适合你的问题。`,
    shortcuts: [
      { label: "👀 先看谁", prompt: "帮我先挑最值得看的嘉宾" },
      { label: "🧭 如何筛选", prompt: "按嘉宾背景给我一个筛选方法" },
      { label: "📚 看什么资料", prompt: "先看哪类公开资料最有效" },
      { label: "🎙 关联节目", prompt: "先从哪些关联节目入手更好" },
      { label: "⚡ 1秒我要看到嘉宾资料", prompt: "请用最快速度把当前列表里的嘉宾资料一次性列出来！每个嘉宾：名字+身份+擅长领域，别啰嗦直接上干货！" },
    ],
  };
}

function buildExpertDetailContext(guest: PublicGuestDetail): PageContextPayload {
  const relatedPrograms = guest.relatedPrograms.slice(0, 3).map((item) => item.title).filter(Boolean);
  return {
    summary: `当前页面是嘉宾详情页。嘉宾:${guest.name},身份:${guest.title || "节目嘉宾"}。简介:${guest.bio || "暂无简介"}。社交媒体 ${guest.socialProfiles?.length || 0} 项,公开成果 ${guest.publications?.length || guest.profileReferences?.length || 0} 项,关联节目 ${guest.relatedPrograms.length} 项。`,
    readReceipt: `已读取《${guest.name}》嘉宾资料。你可以继续问我:这位嘉宾的专业背景、先看哪条公开资料、先听哪期关联节目、是否适合你的问题。`,
    shortcuts: [
      { label: "👤 人物背景", prompt: "请概括这位嘉宾的专业背景和核心视角" },
      { label: "📚 先看资料", prompt: "推荐我先看哪条公开资料" },
      { label: "🎙 关联节目", prompt: "推荐我先听哪期关联节目" },
      { label: "🧭 是否适合我", prompt: "判断这位嘉宾更适合解决哪类家长问题" },
      { label: "⚡ 这个嘉宾关联所有节目", prompt: "请用最快速度把这个嘉宾关联的节目全部列出来！每期节目：标题+一句话核心看点。别啰嗦直接上干货！" },
    ],
  };
}

function buildWorthbuyContext(pathname: string): PageContextPayload {
  const isDetail = /^\/worthbuy\/[^/]+$/.test(pathname);
  if (isDetail) {
    return {
      summary: `当前页面是知物详情页。路径:${pathname}。请优先基于当前可见的品牌分析内容回答。`,
      readReceipt: "已读取当前知物详情页。你可以继续问我：结论可靠吗、最该先看哪三段、下一步怎么决策。",
      shortcuts: [
        { label: "🧾 结论摘要", prompt: "请用 3 句话总结这个品牌结论" },
        { label: "🎯 风险点", prompt: "请指出最关键的 3 个风险点" },
        { label: "✅ 购买建议", prompt: "请给出可执行的购买建议和避坑清单" },
        { label: "🔍 证据定位", prompt: "请标出支撑结论的证据段落" },
      ],
    };
  }
  return {
    summary: `当前页面是知物列表页。路径:${pathname}。请优先基于当前列表与筛选结果回答。`,
    readReceipt: "已读取当前知物列表页。你可以继续问我：先看哪个品牌、怎么快速筛选、下一步怎么比较。",
    shortcuts: [
      { label: "👀 先看哪个", prompt: "先看哪个品牌最有价值" },
      { label: "🧭 如何筛选", prompt: "请给我一个品牌筛选顺序" },
      { label: "📌 关键维度", prompt: "比较品牌时最关键的维度是什么" },
      { label: "⚡ 快速决策", prompt: "请给我一个 1 分钟决策清单" },
    ],
  };
}

function getDockedShareLabel(summary: string): string {
  const text = String(summary || "").trim();
  if (!text) return "当前页面";
  const titleMatch = text.match(/节目标题:([^。]+)。?/);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  const guestMatch = text.match(/嘉宾:([^,。]+)[,。]?/);
  if (guestMatch?.[1]) return guestMatch[1].trim();
  if (text.includes("节目列表页")) return "节目列表";
  if (text.includes("先疯智库列表页")) return "先疯智库";
  if (text.includes("嘉宾详情页")) return "嘉宾详情";
  return "当前页面";
}

function appendBrowsingMemory(entry: { pathname: string; label: string; summary: string }) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.parse(localStorage.getItem(BROWSING_MEMORY_KEY) || "[]");
    const items = Array.isArray(raw) ? raw : [];
    const normalized = {
      pathname: entry.pathname,
      label: entry.label,
      summary: entry.summary,
      visitedAt: new Date().toISOString(),
    };
    const next = [
      normalized,
      ...items.filter((item: any) => String(item?.pathname || "") !== entry.pathname),
    ].slice(0, 20);
    localStorage.setItem(BROWSING_MEMORY_KEY, JSON.stringify(next));
    scheduleXiaowanziAccountSync();
  } catch (_error) {}
}

function normalizeHomePromptItem(rawPrompt: string): TopicPromptItem | null {
  const raw = String(rawPrompt || "")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;
  if (HOME_PROMPT_BLOCKED_TERMS.some((term) => raw.includes(term))) return null;
  // 去掉后端可能已经加上的"围绕「"前缀，保持简洁直接
  const clean = raw.replace(/^围绕「(.+?)」[,，]?/g, "$1").trim();
  const prompt = /[?？]$/.test(clean) ? clean : clean + "？";
  if (HOME_PROMPT_BLOCKED_TERMS.some((term) => prompt.includes(term))) return null;
  return {
    label: prompt.length > 34 ? `${prompt.slice(0, 34)}...` : prompt,
    prompt,
  };
}

function topicPromptFromItem(item: any): TopicPromptItem | null {
  const title = String(item?.title || item?.question || item?.name || "").trim();
  const subtitle = String(item?.subtitle || item?.shortSummary || item?.summary || "").trim();
  return normalizeHomePromptItem(title || subtitle);
}

function shuffleItems<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function pickRandomHomeFallbackPrompts(): TopicPromptItem[] {
  const fallbackGroups = HOME_FALLBACK_PROMPT_GROUPS.length ? HOME_FALLBACK_PROMPT_GROUPS : [HOME_FALLBACK_PROMPTS];
  const lastIndex = (() => {
    if (typeof window === "undefined" || fallbackGroups.length <= 1) return -1;
    try {
      const value = Number(localStorage.getItem(HOME_FALLBACK_PROMPT_ROTATION_KEY));
      return Number.isInteger(value) ? value : -1;
    } catch (_error) {
      return -1;
    }
  })();
  const candidateIndexes = fallbackGroups
    .map((_, index) => index)
    .filter((index) => fallbackGroups.length <= 1 || index !== lastIndex);
  const index = candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)] ?? 0;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(HOME_FALLBACK_PROMPT_ROTATION_KEY, String(index));
    } catch (_error) {}
  }
  return fallbackGroups[index].slice(0, 3);
}

function loadCachedTopicPromptItems(): TopicPromptItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(XIAOWANZI_TOPIC_PROMPT_CACHE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeHomePromptItem(String(item?.prompt || item?.label || "").trim()))
      .filter((item): item is TopicPromptItem => Boolean(item));
  } catch (_error) {
    return [];
  }
}

function saveCachedTopicPromptItems(items: TopicPromptItem[]) {
  if (typeof window === "undefined" || !items.length) return;
  try {
    const sanitized = items
      .map((item) => normalizeHomePromptItem(item.prompt || item.label))
      .filter((item): item is TopicPromptItem => Boolean(item));
    if (!sanitized.length) return;
    localStorage.setItem(XIAOWANZI_TOPIC_PROMPT_CACHE_KEY, JSON.stringify(sanitized.slice(0, 40)));
  } catch (_error) {}
}

function pickHomePromptItems(items: TopicPromptItem[]): TopicPromptItem[] {
  const picked = shuffleItems(items).slice(0, 3);
  if (picked.length >= 3) return picked;
  const existing = new Set(picked.map((item) => item.prompt));
  const fallback = pickRandomHomeFallbackPrompts().filter((item) => !existing.has(item.prompt)).slice(0, 3 - picked.length);
  return [...picked, ...fallback];
}

async function loadTopicPromptItems(grade?: string): Promise<TopicPromptItem[]> {
  const params = new URLSearchParams({ limit: "24", page: "1" });
  if (grade) params.set("grade", grade);
  try {
    const res = await fetch(`/api/topic-hub?${params.toString()}`);
    if (!res.ok) return pickHomePromptItems(loadCachedTopicPromptItems());
    const data = await res.json().catch(() => ({}));
    const topics: any[] = Array.isArray(data?.topics) ? data.topics : [];
    const prompts: TopicPromptItem[] = topics
      .map(topicPromptFromItem)
      .filter((item): item is TopicPromptItem => Boolean(item));
    if (!prompts.length) return pickHomePromptItems(loadCachedTopicPromptItems());
    if (prompts.length) {
      saveCachedTopicPromptItems(prompts);
    }
    return pickHomePromptItems(prompts);
  } catch (_error) {
    return pickHomePromptItems(loadCachedTopicPromptItems());
  }
}

function readFrontDisplayName(): string {
  if (typeof window === "undefined") return "";
  const nameEl =
    (document.getElementById("uc-name") as HTMLElement | null) ||
    (document.querySelector(".uc-name") as HTMLElement | null);
  const text = String(nameEl?.textContent || "").trim();
  if (!text || text === "登录/注册") return "";
  return text;
}

function buildHomeBrowseSrc(path: string): string {
  const raw = String(path || "/").trim() || "/";
  const hashIndex = raw.indexOf("#");
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  if (new RegExp(`(?:^|[?&])xw_layer=`).test(withoutHash)) return `${withoutHash}${hash}`;
  const separator = withoutHash.includes("?") ? "&" : "?";
  return `${withoutHash}${separator}xw_layer=1${hash}`;
}

function extractProgramItems(data: unknown): Program[] {
  if (Array.isArray(data)) return data as Program[];
  const value = data as { programs?: Program[] } | null | undefined;
  return Array.isArray(value?.programs) ? value.programs : [];
}

function extractMaterialItems(data: unknown): LearningMaterial[] {
  return Array.isArray(data) ? data as LearningMaterial[] : [];
}

function extractTopicItems(data: unknown): XiaowanziTopicLinkSource[] {
  const value = data as { topics?: XiaowanziTopicLinkSource[] } | XiaowanziTopicLinkSource[] | null | undefined;
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.topics) ? value.topics : [];
}

async function loadXiaowanziMentionLinks(): Promise<XiaowanziMentionLink[]> {
  const [programRes, topicRes, materialRes] = await Promise.allSettled([
    publicApi.getPrograms({ page: 1, pageSize: 200 }),
    fetch("/api/topic-hub?limit=200"),
    publicApi.getMaterials(),
  ]);
  const programs = programRes.status === "fulfilled" ? extractProgramItems(programRes.value.data) : [];
  const topics = topicRes.status === "fulfilled" && topicRes.value.ok ? extractTopicItems(await topicRes.value.json()) : [];
  const materials = materialRes.status === "fulfilled" ? extractMaterialItems(materialRes.value.data) : [];
  return buildXiaowanziMentionLinks({ programs, topics, materials });
}

function scheduleXiaowanziContentWarmup(task: () => void): () => void {
  if (typeof window === "undefined") {
    task();
    return () => {};
  }
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  let rafOne: number | null = null;
  let rafTwo: number | null = null;
  let idleHandle: number | null = null;
  let timeoutHandle: number | null = null;

  const scheduleIdle = () => {
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback?.(task, { timeout: 2500 }) ?? null;
      return;
    }
    timeoutHandle = window.setTimeout(task, 900);
  };

  if (typeof window.requestAnimationFrame === "function") {
    rafOne = window.requestAnimationFrame(() => {
      rafTwo = window.requestAnimationFrame(() => {
        scheduleIdle();
      });
    });
  } else {
    timeoutHandle = window.setTimeout(task, 900);
  }

  return () => {
    if (rafOne !== null) window.cancelAnimationFrame(rafOne);
    if (rafTwo !== null) window.cancelAnimationFrame(rafTwo);
    if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
    if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
  };
}

const XiaowanziWidget: React.FC<XiaowanziWidgetProps> = ({ standalone = false, hideLauncher = false }) => {
  const { pathname } = useLocation();
  const [shouldOpenHomeOnMount] = useState(() => standalone ? true : shouldRestoreXiaowanziHome());
  const [skipHomeIntroOnMount] = useState(() => standalone ? true : shouldSkipXiaowanziHomeIntro());
  const [open, setOpen] = useState(() => shouldOpenHomeOnMount);
  const [homeActive, setHomeActive] = useState(() => standalone ? true : shouldOpenHomeOnMount);
  const [homePortalKey, setHomePortalKey] = useState(0);
  const [initialConversationState] = useState(() => loadInitialConversationState());
  const [currentSessionId, setCurrentSessionId] = useState(() => initialConversationState.sessionId);
  const [conversationSessions, setConversationSessions] = useState<ConversationSession[]>(() => loadConversationSessions());
  const [homeSwipeStartX, setHomeSwipeStartX] = useState(0);
  const [homeFallbackPrompts] = useState<TopicPromptItem[]>(() => pickRandomHomeFallbackPrompts());
  const [homePromptItems, setHomePromptItems] = useState<TopicPromptItem[]>([]);
  const [homeBrowsingOpen, setHomeBrowsingOpen] = useState(false);
  const [homeBrowseTarget, setHomeBrowseTarget] = useState<HomeBrowseTarget | null>(null);
  const [homeHistoryDrawerOpen, setHomeHistoryDrawerOpen] = useState(false);
  const [homeViewingHistory, setHomeViewingHistory] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [pinned, setPinned] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(GLOBAL_DOCKED_PREF_KEY) === "1";
    } catch (_error) {
      return false;
    }
  });
  const [dockedDark, setDockedDark] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(GLOBAL_DOCKED_THEME_KEY) === "dark";
    } catch (_error) {
      return false;
    }
  });
  const [messages, setMessages] = useState<Msg[]>(() => initialConversationState.messages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceHolding, setVoiceHolding] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [canUseBot, setCanUseBot] = useState(true);
  const [statusText, setStatusText] = useState("● 随时可用");
  const [shareVisible, setShareVisible] = useState(true);
  const [hasHistoryMessages, setHasHistoryMessages] = useState(() => initialConversationState.hasHistoryMessages);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [fabPosition, setFabPosition] = useState(() =>
    typeof window === "undefined" ? { left: 0, top: 0 } : getDefaultFabPosition(window.innerWidth, window.innerHeight),
  );
  const [avatarState, setAvatarState] = useState(loadPersistedAvatarState);
  const [displayAvatar, setDisplayAvatar] = useState<string>(() => getAvatarSrc(loadPersistedAvatarState().avatarIndex));
  const [avatarFxClassName, setAvatarFxClassName] = useState("");
  const [avatarParticles, setAvatarParticles] = useState<AvatarParticle[]>([]);
  const [childProfiles, setChildProfiles] = useState<ChildProfileLite[]>(() => loadChildProfiles());
  const [chatContext, setChatContext] = useState<ChatSessionContext | null>(() => loadChatContext());
  const [hiddenEntryOpen, setHiddenEntryOpen] = useState(false);
  const [pageContext, setPageContext] = useState<PageContextPayload>({
    summary: "",
    readReceipt: DEFAULT_MESSAGE.content,
    shortcuts: DEFAULT_SHORTCUTS,
  });
  const [xiaowanziMentionLinks, setXiaowanziMentionLinks] = useState<XiaowanziMentionLink[]>([]);
  const [shareMenuOpenId, setShareMenuOpenId] = useState<string | null>(null);
  const [shareMenuPos, setShareMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [shareCardUrl, setShareCardUrl] = useState<string | null>(null);
  const [shareGenerating, setShareGenerating] = useState(false);
  const [shareToastMsg, setShareToastMsg] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [homeComposerExpanded, setHomeComposerExpanded] = useState(false);
  const [shareRevealMessageId, setShareRevealMessageId] = useState<string | null>(null);
  /* ─── 分享选择模式 ─── */
  const [shareSelectionMode, setShareSelectionMode] = useState(false);
  const [selectedMessagesForShare, setSelectedMessagesForShare] = useState<Set<string>>(new Set());
  const msgContainerRef = useRef<HTMLDivElement | null>(null);
  const latestMsgRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const homeInputbarRef = useRef<HTMLDivElement | null>(null);
  const homeAttachMenuRef = useRef<HTMLDivElement | null>(null);
  const panelInputbarRef = useRef<HTMLDivElement | null>(null);
  const panelAttachMenuRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const voicePressTimerRef = useRef<number | null>(null);
  const fabLongPressRef = useRef<number | null>(null);
  const dragRef = useRef({ active: false, moved: false, offsetX: 0, offsetY: 0, pointerId: -1 });
  const avatarTimersRef = useRef<number[]>([]);
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shareCardObjectUrlRef = useRef<string | null>(null);
  const shareRevealHideTimerRef = useRef<number | null>(null);
  const layoutRerenderedRef = useRef(false);
  const lastPathnameRef = useRef(pathname);
  const lastBrowsingMemoryRef = useRef("");
  const shortcutItems = (pageContext.shortcuts.length ? pageContext.shortcuts : DEFAULT_SHORTCUTS).map((item) => ({
    ...item,
    prompt: normalizeShortcutPrompt(item.prompt),
  }));
  const explicitActiveChild = childProfiles.find((item) => item.id === chatContext?.childProfileId) || null;
  const singleChild = childProfiles.length === 1 ? childProfiles[0] : null;
  const activeChild = explicitActiveChild || singleChild;
  const isChildBound = Boolean(activeChild && (chatContext?.isChildBound || childProfiles.length === 1));
  const canSwitchChild = childProfiles.length !== 1;
  const currentHistoryChildId = isChildBound ? activeChild?.id || null : null;
  const childShortcutItems = buildChildShortcuts(activeChild).map((item) => ({
    ...item,
    prompt: normalizeShortcutPrompt(item.prompt),
  }));
  const avatar = getAvatarSrc(avatarState.avatarIndex);
  const isDocked = pinned && !maximized;
  const isDockedEmpty = isDocked && !hasHistoryMessages && messages.length <= 1;
  const visibleMessages = isDocked ? messages.filter((message) => !isReadReceiptMessage(message.content)) : messages;
  const effectiveHomePrompts = homePromptItems.length ? homePromptItems : homeFallbackPrompts;
  const homeConversationMessages = visibleMessages.filter((message) => !isReadReceiptMessage(message.content));
  const homeAnswerMessages = shareSelectionMode ? homeConversationMessages : homeConversationMessages.slice(-6);
  const currentUserName = (() => {
    try {
      const raw = localStorage.getItem("user");
      const parsed = raw ? JSON.parse(raw) : null;
      const localName = String(
        parsed?.nickname ||
          parsed?.nickName ||
          parsed?.displayName ||
          parsed?.name ||
          parsed?.realName ||
          parsed?.username ||
          "",
      ).trim();
      const frontName = readFrontDisplayName();
      if (frontName && frontName.toLowerCase() !== "admin") return frontName;
      if (localName && localName.toLowerCase() !== "admin") return localName;
      return "";
    } catch (_error) {
      const frontName = readFrontDisplayName();
      return frontName.toLowerCase() === "admin" ? "" : frontName;
    }
  })();

  function revokeShareCardObjectUrl() {
    if (!shareCardObjectUrlRef.current) return;
    URL.revokeObjectURL(shareCardObjectUrlRef.current);
    shareCardObjectUrlRef.current = null;
  }

  function clearShareCardUrl() {
    revokeShareCardObjectUrl();
    setShareCardUrl(null);
  }

  function clearShareRevealHideTimer() {
    if (!shareRevealHideTimerRef.current) return;
    window.clearTimeout(shareRevealHideTimerRef.current);
    shareRevealHideTimerRef.current = null;
  }

  function scheduleShareRevealHide(messageId: string) {
    clearShareRevealHideTimer();
    shareRevealHideTimerRef.current = window.setTimeout(() => {
      setShareRevealMessageId((current) => (current === messageId ? null : current));
      shareRevealHideTimerRef.current = null;
    }, SHARE_REVEAL_HIDE_DELAY_MS);
  }

  function showShareCardUrl(url: string) {
    revokeShareCardObjectUrl();
    shareCardObjectUrlRef.current = url;
    setShareCardUrl(url);
  }

  function refreshConversationSessions() {
    setConversationSessions(loadConversationSessions());
  }

  function rerenderMessagesForLayoutVersion() {
    setMessages((items) => items.map((item) => ({ ...item })));
    setHomePortalKey((value) => value + 1);
  }

  function persistConversation(items: Msg[], sessionId = currentSessionId) {
    if (!sessionId || !isMeaningfulHistory(items)) return;
    const sanitized = items
      .filter((item) => item.content !== DEFAULT_MESSAGE.content && !isReadReceiptMessage(item.content) && item.content !== "__THINKING__")
      .map(sanitizeDisplayMessage);
    if (!sanitized.length) return;
    saveActiveConversationSessionId(sessionId);
    saveConversationSessionMessages(sessionId, sanitized);
    const now = new Date().toISOString();
    const existing = loadConversationSessions().find((item) => item.id === sessionId);
    upsertConversationSession({
      id: sessionId,
      title: getConversationTitle(sanitized, existing?.title || "新的小玩子对话"),
      childId: currentHistoryChildId,
      childName: activeChild?.displayName || existing?.childName || "",
      createdAt: existing?.createdAt || sanitized[0]?.ts || now,
      updatedAt: sanitized[sanitized.length - 1]?.ts || now,
      messageCount: sanitized.length,
      lastMessage: sanitized[sanitized.length - 1]?.content || "",
    });
    refreshConversationSessions();
  }

  function isCurrentSessionExpired(): boolean {
    if (messages.length <= 1) return false;
    // 找最近一条用户消息的时间戳
    const lastUserTs = [...messages].reverse().find((m) => m.role === "user")?.ts;
    if (!lastUserTs) return false;
    const lastTime = new Date(lastUserTs).getTime();
    if (Number.isNaN(lastTime)) return false;
    const hoursSince = (Date.now() - lastTime) / (1000 * 60 * 60);
    return hoursSince > 24;
  }

  function maybeStartNewConversationIfNeeded() {
    if (isCurrentSessionExpired()) {
      persistConversation(messages);
      startNewConversationSession();
      setHomePortalKey((value) => value + 1);
      void loadTopicPromptItems().then((items) => {
        if (items.length) setHomePromptItems(items);
      });
      return;
    }
    setHomePortalKey((value) => value + 1);
    void loadTopicPromptItems().then((items) => {
      if (items.length) setHomePromptItems(items);
    });
  }

  function startNewConversationSession() {
    const nextSessionId = createConversationSessionId();
    saveActiveConversationSessionId(nextSessionId);
    setCurrentSessionId(nextSessionId);
    setMessages([DEFAULT_MESSAGE]);
    setHasHistoryMessages(false);
    setHistoryPanelOpen(false);
    setHomeHistoryDrawerOpen(false);
    setHomeViewingHistory(false);
    refreshConversationSessions();
    return nextSessionId;
  }

  function openManualNewConversation() {
    persistConversation(messages);
    startNewConversationSession();
    setHomeHistoryDrawerOpen(false);
    setStatusText("● 已开启新对话");
    void loadTopicPromptItems().then((items) => {
      if (items.length) setHomePromptItems(items);
    });
  }

  function restoreConversationSession(sessionId: string) {
    const cached = loadConversationSessionMessages(sessionId);
    if (!cached.length) return;
    saveActiveConversationSessionId(sessionId);
    setCurrentSessionId(sessionId);
    setMessages(cached.map((item) => ({ ...item })));
    setHasHistoryMessages(true);
    setHistoryPanelOpen(false);
    setHomeHistoryDrawerOpen(false);
    setHomeViewingHistory(true);
    saveCachedHistory(cached, currentHistoryChildId);
  }

  function openXiaowanziMentionLink(event: React.MouseEvent<HTMLAnchorElement>, link: XiaowanziMentionLink) {
    event.stopPropagation();
    if (!homeActive) return;
    event.preventDefault();
    setHomeHistoryDrawerOpen(false);
    setHomeBrowsingOpen(true);
    setHomeBrowseTarget({ path: link.href, label: link.title });
    setPageContext({
      summary: `当前正在小玩子超能模式内浏览「${link.title}」页面。路径:${link.href}。请结合该页面浏览上下文回答。`,
      readReceipt: `已在超能模式中打开「${link.title}」。你可以继续问我这页重点、先看哪里、怎么结合孩子情况使用。`,
      shortcuts: DEFAULT_SHORTCUTS,
    });
  }

  function clearAvatarTimers() {
    avatarTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    avatarTimersRef.current = [];
  }

  function closePanel() {
    if (homeActive && isMiniProgramWebView()) {
      clearXiaowanziHomeActive();
      void forceExitMiniProgramXiaowanzi();
      return;
    }
    clearXiaowanziHomeActive();
    setOpen(false);
    setHomeActive(false);
    setHomeBrowsingOpen(false);
    setHomeBrowseTarget(null);
    setHomeHistoryDrawerOpen(false);
    setMaximized(false);
    setPinned(false);
    setHiddenEntryOpen(false);
    document.dispatchEvent(new CustomEvent("xf-close-public-menu"));
  }

  function openHiddenEntry() {
    if (isMiniProgramWebView()) {
      void openMiniProgramNativeArchivePicker();
      return;
    }
    if (shouldBlockXiaowanziForAuth()) return;
    setOpen(true);
    setHiddenEntryOpen(true);
  }

  function openSidebarChildCreate() {
    if (isMiniProgramWebView()) {
      void openMiniProgramNativeArchiveCreate();
      return;
    }
    if (shouldBlockXiaowanziForAuth()) return;
    setHiddenEntryOpen(false);
    document.dispatchEvent(new CustomEvent("xf-open-child-profile-create"));
  }

  function bindChildProfile(profile: ChildProfileLite) {
    if (shouldBlockXiaowanziForAuth()) return;
    if (isMeaningfulHistory(messages)) saveCachedHistory(messages, currentHistoryChildId);
    persistConversation(messages);
    const nextContext: ChatSessionContext = {
      sessionId: `session-${Date.now()}`,
      childProfileId: profile.id,
      isChildBound: true,
      lastSwitchedAt: new Date().toISOString(),
    };
    setChatContext(nextContext);
    saveChatContext(nextContext);
    try {
      localStorage.setItem(LAST_CHILD_ID_KEY, profile.id);
    } catch (_error) {}
    const cached = loadCachedHistory(profile.id);
    setMessages(cached.length ? cached : [DEFAULT_MESSAGE]);
    setHasHistoryMessages(cached.length > 0);
    setHiddenEntryOpen(false);
    setStatusText(`● 正在为 ${profile.displayName} 提供建议`);
  }

  function buildAvatarParticles(): AvatarParticle[] {
    return Array.from({ length: 14 }, (_, index) => ({
      id: Date.now() + index,
      size: 4 + Math.round(Math.random() * 5),
      x: 18 + Math.random() * 52,
      y: 22 + Math.random() * 44,
      dx: (Math.random() - 0.5) * 58,
      dy: -18 - Math.random() * 42,
      delay: Math.random() * 120,
    }));
  }

  function runAvatarTransition(nextAvatar: string) {
    clearAvatarTimers();
    setAvatarFxClassName("avatar-fade-out");

    const swapTimer = window.setTimeout(() => {
      setAvatarParticles(buildAvatarParticles());
      setDisplayAvatar(nextAvatar);
      setAvatarFxClassName("avatar-pop-in avatar-glow");
    }, AVATAR_FADE_DURATION_MS);

    const cleanupTimer = window.setTimeout(() => {
      setAvatarFxClassName("");
      setAvatarParticles([]);
    }, AVATAR_FADE_DURATION_MS + AVATAR_EFFECT_DURATION_MS);

    avatarTimersRef.current = [swapTimer, cleanupTimer];
  }

  useEffect(() => () => {
    revokeShareCardObjectUrl();
    clearShareRevealHideTimer();
  }, []);

  useEffect(() => {
    if (layoutRerenderedRef.current) return;
    layoutRerenderedRef.current = true;
    rerenderMessagesForLayoutVersion();
  }, []);

  useEffect(() => {
    applyMiniProgramNativeCapsuleVars();
  }, []);

  useEffect(() => {
    let alive = true;
    if (!getSessionToken()) return () => { alive = false; };
    void pullAndMergeXiaowanziAccountSync().then((changed) => {
      if (!alive || !changed) return;
      setChildProfiles(loadChildProfiles());
      setChatContext(loadChatContext());
      refreshConversationSessions();
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const cancelWarmup = scheduleXiaowanziContentWarmup(() => {
      void loadXiaowanziMentionLinks().then((links) => {
        if (alive) setXiaowanziMentionLinks(links);
      });
    });
    return () => {
      alive = false;
      cancelWarmup();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadContext() {
      try {
        if (pathname === "/programs" || pathname === "/programs/list") {
          const response = await publicApi.getPrograms();
          if (!alive) return;
          const programs = Array.isArray(response.data) ? response.data : [];
          setPageContext(buildProgramListContext(programs));
          return;
        }

        if (/^\/programs\/[^/]+$/.test(pathname)) {
          const id = pathname.split("/")[2] || "";
          const response = await publicApi.getProgram(id);
          if (!alive) return;
          setPageContext(buildProgramDetailContext(response.data));
          return;
        }

        if (pathname === "/experts") {
          const keyword = String((document.getElementById("tb-program-search-input") as HTMLInputElement | null)?.value || "").trim();
          const response = await publicApi.getGuests(keyword ? { search: keyword } : undefined);
          if (!alive) return;
          const guests = Array.isArray(response.data) ? response.data : [];
          setPageContext(buildExpertsListContext(guests, keyword));
          return;
        }

        if (/^\/experts\/[^/]+$/.test(pathname)) {
          const id = pathname.split("/")[2] || "";
          const response = await publicApi.getGuest(id);
          if (!alive) return;
          setPageContext(buildExpertDetailContext(response.data));
          return;
        }

        if (pathname === "/worthbuy" || /^\/worthbuy\/[^/]+$/.test(pathname)) {
          setPageContext(buildWorthbuyContext(pathname));
          return;
        }

        setPageContext({
          summary: `当前页面路径:${pathname}`,
          readReceipt: "已读取当前页面。你可以继续告诉我你想解决的具体问题。",
          shortcuts: DEFAULT_SHORTCUTS,
        });
      } catch (_error) {
        if (!alive) return;
        setPageContext({
          summary: `当前页面路径:${pathname}`,
          readReceipt: "已进入当前页面。你可以继续告诉我你想解决的具体问题。",
          shortcuts: DEFAULT_SHORTCUTS,
        });
      }
    }

    void loadContext();
    return () => {
      alive = false;
    };
  }, [pathname]);

  useEffect(() => {
    const onResize = () => {
      setFabPosition((prev) => clampFabPosition(prev, window.innerWidth, window.innerHeight));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (standalone) return;
    if (!open || !homeActive) return;
    const exitHomeOnDesktop = () => {
      if (window.innerWidth >= HOME_DESKTOP_BREAKPOINT) {
        closePanel();
      }
    };
    exitHomeOnDesktop();
    window.addEventListener("resize", exitHomeOnDesktop);
    return () => window.removeEventListener("resize", exitHomeOnDesktop);
  }, [open, homeActive, standalone]);

  useEffect(() => {
    try {
      localStorage.setItem(LEGACY_AVATAR_INDEX_KEY, String(avatarState.avatarIndex));
      localStorage.setItem(LEGACY_AVATAR_CLICK_COUNT_KEY, String(avatarState.clickCount));
    } catch (_error) {}
  }, [avatarState]);

  useEffect(() => {
    const onPageShow = () => {
      const persistedState = loadPersistedAvatarState();
      setAvatarState(persistedState);
      setDisplayAvatar(getAvatarSrc(persistedState.avatarIndex));
      setAvatarFxClassName("");
      setAvatarParticles([]);
      clearAvatarTimers();
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (avatar === displayAvatar) return;
    if (!displayAvatar) {
      setDisplayAvatar(avatar);
      return;
    }
    runAvatarTransition(avatar);
  }, [avatar, displayAvatar]);

  useEffect(() => {
    return () => {
      clearAvatarTimers();
      if (fabLongPressRef.current) window.clearTimeout(fabLongPressRef.current);
      if (voicePressTimerRef.current) window.clearTimeout(voicePressTimerRef.current);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      recognitionRef.current?.stop?.();
    };
  }, []);

  useEffect(() => {
    if (!open || hasHistoryMessages) return;
    setMessages([{ role: "assistant", content: pageContext.readReceipt || DEFAULT_MESSAGE.content, ts: new Date().toISOString() }]);
  }, [open, hasHistoryMessages, pageContext.readReceipt]);

  async function ensureBotReady() {
    const token = getSessionToken();
    if (!token) {
      setCanUseBot(false);
      shouldBlockXiaowanziForAuth();
      return false;
    }

    const createRes = await fetch(apiUrl("/api/v1/tutorbot"), {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        bot_id: BOT_ID,
        name: "小玩子调试",
        description: "前台小玩子调试实例",
        model: "chat_manager_agent",
      }),
    });

    if (!createRes.ok) {
      if (createRes.status === 401) {
        setCanUseBot(false);
        shouldBlockXiaowanziForAuth();
      } else if (createRes.status === 403) {
        setCanUseBot(false);
        setStatusText("● 当前账号暂无小玩子权限");
      } else {
        setCanUseBot(false);
        setStatusText("● AI 服务暂不可用");
      }
      return false;
    }

    setCanUseBot(true);
    setStatusText("● AI在线中");
    return true;
  }

  async function reloadHistory() {
    const token = getSessionToken();
    if (!token) return;
    const res = await fetch(apiUrl(`/api/v1/tutorbot/${BOT_ID}/history?limit=100`), { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      const filtered = (data as Msg[]).filter((m) => !isReadReceiptMessage(m.content) && m.content !== "__THINKING__").map(sanitizeDisplayMessage);
      setHasHistoryMessages(filtered.length > 0);
      setMessages(filtered.length ? filtered : [DEFAULT_MESSAGE]);
      if (filtered.length) saveCachedHistory(filtered, currentHistoryChildId);
      return;
    }
    const cached = loadCachedHistory(currentHistoryChildId);
    setHasHistoryMessages(cached.length > 0);
    setMessages(cached.length ? cached : [DEFAULT_MESSAGE]);
  }

  useEffect(() => {
    if (!open || homeActive) return;
    const cached = loadCachedHistory(currentHistoryChildId);
    if (cached.length) {
      setHasHistoryMessages(true);
      setMessages(cached);
    }
    void (async () => {
      const ok = await ensureBotReady();
      if (ok && !cached.length) await reloadHistory();
    })();
  }, [open, homeActive, currentHistoryChildId]);

  async function onHistoryClick() {
    const token = getSessionToken();
    if (!token) {
      setCanUseBot(false);
      shouldBlockXiaowanziForAuth();
      return;
    }
    if (!canUseBot) {
      setStatusText("● 当前账号暂无小玩子权限");
      return;
    }
    const sessions = loadConversationSessions();
    setConversationSessions(sessions);
    if (!sessions.length) await reloadHistory();
    setHistoryPanelOpen((v) => !v);
    setStatusText("● 已加载历史会话");
  }

  function handleHomeSwipeStart(e: React.TouchEvent) {
    setHomeSwipeStartX(e.touches[0].clientX);
  }

  function handleHomeSwipeEnd(e: React.TouchEvent) {
    const endX = e.changedTouches[0].clientX;
    const dx = endX - homeSwipeStartX;
    const threshold = 60;
    if (Math.abs(dx) < threshold) return;
    // 左滑 → 三个点（公共菜单）
    if (dx < 0) {
      setHomeHistoryDrawerOpen(false);
      document.dispatchEvent(new CustomEvent("xf-open-public-menu"));
    } else {
      // 右滑 → 历史会话
      void openHomeHistoryMenu();
    }
  }

  async function openHomeHistoryMenu() {
    const sessions = loadConversationSessions();
    setConversationSessions(sessions);
    if (!sessions.length) await reloadHistory();
    document.dispatchEvent(new CustomEvent("xf-close-public-menu"));
    setHomeHistoryDrawerOpen(true);
    setStatusText("● 已加载历史会话");
  }

  function buildHistoryCards(items: Msg[]): HistorySessionCard[] {
    const sessionCards = conversationSessions
      .filter((session) => loadConversationSessionMessages(session.id).length > 0)
      .map((session) => ({
        id: session.id,
        sessionId: session.id,
        title: session.title || "历史会话",
        sub: formatHistoryTime(session.updatedAt),
        childTag: session.childName || "",
      }));
    if (sessionCards.length) return sessionCards;
    const cards: HistorySessionCard[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const msg = items[i];
      if (msg.role !== "user") continue;
      const raw = String(msg.content || "").trim();
      if (!raw) continue;
      const title = raw.slice(0, 28);
      const ts = msg.ts ? new Date(msg.ts) : null;
      const time = ts && !Number.isNaN(ts.getTime())
        ? `${ts.getMonth() + 1}/${ts.getDate()} ${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`
        : "历史会话";
      cards.push({
        id: `${i}-${msg.ts || ""}`,
        title,
        sub: time,
        targetIndex: i,
        childTag: activeChild?.displayName || "",
      });
    }
    return cards.slice(-20).reverse();
  }

  function jumpToMessage(index: number) {
    const wrap = msgContainerRef.current;
    if (!wrap) return;
    const el = wrap.querySelector(`[data-msg-index="${index}"]`) as HTMLDivElement | null;
    if (!el) return;
    wrap.scrollTo({ top: Math.max(0, el.offsetTop - wrap.offsetTop - 8), behavior: "smooth" });
    setHistoryPanelOpen(false);
  }

  function openHistoryCard(card: HistorySessionCard) {
    if (card.sessionId) {
      restoreConversationSession(card.sessionId);
      return;
    }
    if (typeof card.targetIndex === "number") {
      jumpToMessage(card.targetIndex);
    }
  }

  useEffect(() => {
    if (!open || homeActive) return;
    const container = msgContainerRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      inputRef.current?.focus();
    });
  }, [open, homeActive, messages, hasHistoryMessages]);

  useEffect(() => {
    if (!open || !homeActive) return;
    requestAnimationFrame(() => {
      const container = msgContainerRef.current;
      if (!container) return;
      // Home 模式下：有消息时滚动到底部，否则保持顶部
      if (visibleMessages.length > 1) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      } else {
        container.scrollTo({ top: 0 });
      }
      inputRef.current?.focus();
    });
  }, [open, homeActive, messages, hasHistoryMessages]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && homeInputbarRef.current?.contains(target)) return;
      if (target && homeAttachMenuRef.current?.contains(target)) return;
      if (target && panelInputbarRef.current?.contains(target)) return;
      if (target && panelAttachMenuRef.current?.contains(target)) return;
      setAttachmentMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [attachmentMenuOpen]);

  useEffect(() => {
    if (!open) {
      setMaximized(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && homeActive) {
      persistXiaowanziHomeActive();
    }
  }, [open, homeActive]);

  useEffect(() => {
    const onOpenFromTab = (event: Event) => {
      const customEvent = event as CustomEvent<{ avatarState?: { avatarIndex: number; clickCount: number }; childProfileId?: string; childId?: string; mode?: "chat" | "home"; maximized?: boolean }>;
      if (shouldBlockXiaowanziForAuth()) return;
      if (customEvent?.detail?.mode === "home" && shouldBlockXiaowanziSuperModeForAuth()) return;
      const incomingAvatarState = customEvent?.detail?.avatarState;
      if (incomingAvatarState && Number.isFinite(incomingAvatarState.avatarIndex) && Number.isFinite(incomingAvatarState.clickCount)) {
        setAvatarState({
          avatarIndex: Math.max(0, Math.floor(incomingAvatarState.avatarIndex)),
          clickCount: Math.max(0, Math.floor(incomingAvatarState.clickCount)),
        });
      } else {
        setAvatarState((value) => advanceAvatarState(value));
      }
      const latestProfiles = loadChildProfiles();
      setChildProfiles(latestProfiles);
      const incomingChildId = String(customEvent?.detail?.childProfileId || customEvent?.detail?.childId || "").trim();
      const picked = latestProfiles.find((item) => item.id === incomingChildId) || null;
      if (picked) {
        const nextContext: ChatSessionContext = {
          sessionId: `session-${Date.now()}`,
          childProfileId: picked.id,
          isChildBound: true,
          lastSwitchedAt: new Date().toISOString(),
        };
        setChatContext(nextContext);
        saveChatContext(nextContext);
        try {
          localStorage.setItem(LAST_CHILD_ID_KEY, picked.id);
        } catch (_error) {}
        setHiddenEntryOpen(false);
      }
      const nextIsHomeMode = customEvent?.detail?.mode === "home";
      setPinned(false);
      setMaximized(Boolean(!nextIsHomeMode && customEvent?.detail?.maximized));
      setHomeActive(nextIsHomeMode);
      setHomeBrowsingOpen(false);
      setHomeBrowseTarget(null);
      setOpen(true);
      if (nextIsHomeMode) {
        maybeStartNewConversationIfNeeded();
      }
    };
    document.addEventListener("xf-open-xiaowanzi", onOpenFromTab as EventListener);
    return () => document.removeEventListener("xf-open-xiaowanzi", onOpenFromTab as EventListener);
  }, []);

  useLayoutEffect(() => {
    const mode = takeMiniProgramXiaowanziEntryMode();
    const action = takeMiniProgramXiaowanziAction();
    if (!mode && !action) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const nextIsHomeMode = mode !== "chat";
    setPinned(false);
    setMaximized(false);
    setHomeActive(nextIsHomeMode);
    setHomeBrowsingOpen(false);
    setHomeBrowseTarget(null);
    setOpen(true);
    if (nextIsHomeMode) {
      maybeStartNewConversationIfNeeded();
      if (action === "new") {
        window.setTimeout(() => openManualNewConversation(), 0);
      } else if (action === "history") {
        window.setTimeout(() => void openHomeHistoryMenu(), 0);
      }
    }
  }, []);

  useLayoutEffect(() => {
    if (!shouldRestoreXiaowanziHome()) return;
    clearXiaowanziRestoreMarker();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setPinned(false);
    setMaximized(false);
    setHomeActive(true);
    setHomeBrowsingOpen(false);
    setHomeBrowseTarget(null);
    setOpen(true);
    maybeStartNewConversationIfNeeded();
  }, []);

  useEffect(() => {
    const onProfilesUpdated = () => {
      const latestProfiles = loadChildProfiles();
      setChildProfiles(latestProfiles);
      try {
        const lastId = localStorage.getItem(LAST_CHILD_ID_KEY) || "";
        if (lastId && !latestProfiles.some((profile) => profile.id === lastId)) {
          localStorage.removeItem(LAST_CHILD_ID_KEY);
        }
      } catch (_error) {}
      setChatContext((prev) => {
        if (!prev) return prev;
        const stillExists = latestProfiles.some((profile) => profile.id === prev.childProfileId);
        if (stillExists) return prev;
        try {
          localStorage.removeItem(LAST_CHILD_ID_KEY);
        } catch (_error) {}
        return null;
      });
      scheduleXiaowanziAccountSync();
    };
    document.addEventListener("xf-child-profiles-updated", onProfilesUpdated as EventListener);
    return () => document.removeEventListener("xf-child-profiles-updated", onProfilesUpdated as EventListener);
  }, []);

  useEffect(() => {
    setShareVisible(true);
  }, [pathname]);

  useEffect(() => {
    document.dispatchEvent(new CustomEvent("xf-xiaowanzi-home-state", { detail: { active: open && homeActive } }));
  }, [open, homeActive]);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea?.classList.contains("xw-home-input")) return;
    setHomeComposerExpanded(syncHomeInputHeight(textarea, input));
  }, [input, open, homeActive]);

  useEffect(() => {
    const onBrowseLayer = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean; path?: string; label?: string }>).detail || {};
      const active = Boolean(detail.active);
      if (active) {
        if (shouldBlockXiaowanziSuperModeForAuth()) {
          setHomeBrowsingOpen(false);
          setHomeBrowseTarget(null);
          return;
        }
        const label = String(detail.label || "页面").trim() || "页面";
        const path = String(detail.path || pathname || "/").trim() || "/";
        setOpen(true);
        setHomeActive(true);
        setHomeBrowseTarget({ path, label });
        setPageContext({
          summary: `当前正在小玩子超能模式内浏览「${label}」页面。路径:${path}。请结合该页面浏览上下文回答。`,
          readReceipt: `已在超能模式中打开「${label}」。你可以继续问我这页重点、先看哪里、怎么结合孩子情况使用。`,
          shortcuts: DEFAULT_SHORTCUTS,
        });
      } else {
        setHomeBrowseTarget(null);
      }
      setHomeBrowsingOpen(active);
    };
    document.addEventListener("xf-xiaowanzi-browse-layer", onBrowseLayer);
    return () => document.removeEventListener("xf-xiaowanzi-browse-layer", onBrowseLayer);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if ((event.data as any)?.type !== "xf-close-xiaowanzi-browse-layer") return;
      setHomeBrowsingOpen(false);
      setHomeBrowseTarget(null);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!open || !homeActive || !pageContext.summary) return;
    const label = getDockedShareLabel(pageContext.summary);
    const memoryKey = `${pathname}::${pageContext.summary}`;
    if (lastBrowsingMemoryRef.current === memoryKey) return;
    lastBrowsingMemoryRef.current = memoryKey;
    appendBrowsingMemory({ pathname, label, summary: pageContext.summary });
  }, [open, homeActive, pathname, pageContext.summary]);

  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    if (homeActive) return;
    closePanel();
  }, [pathname, homeActive]);

  useEffect(() => {
    if (!open) return undefined;
    if (homeActive) return undefined;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("#ai-panel, #ai-fab, .aip-hidden-sheet, .xw-home")) return;
      closePanel();
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [open, homeActive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(GLOBAL_DOCKED_PREF_KEY, pinned ? "1" : "0");
    } catch (_error) {}
    // 进入超能模式时，如果不在小玩子独立页面，则跳转到小玩子路由
    if (pinned && !standalone) {
      window.location.href = "/index-xiaowanzi.html";
    }
  }, [pinned]);

  useEffect(() => {
    saveChatContext(chatContext);
  }, [chatContext]);

  useEffect(() => {
    if (!isMeaningfulHistory(messages)) return;
    saveCachedHistory(messages, currentHistoryChildId);
    persistConversation(messages);
  }, [messages, currentHistoryChildId, currentSessionId]);

  useEffect(() => {
    if (chatContext || childProfiles.length === 0) return;
    try {
      const lastId = localStorage.getItem(LAST_CHILD_ID_KEY) || "";
      const picked = childProfiles.find((item) => item.id === lastId) || childProfiles[0];
      if (!picked) return;
      const nextContext: ChatSessionContext = {
        sessionId: `session-${Date.now()}`,
        childProfileId: picked.id,
        isChildBound: true,
        lastSwitchedAt: new Date().toISOString(),
      };
      setChatContext(nextContext);
    } catch (_error) {}
  }, [chatContext, childProfiles]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(GLOBAL_DOCKED_THEME_KEY, dockedDark ? "dark" : "light");
    } catch (_error) {}
  }, [dockedDark]);

  useEffect(() => {
    const docked = open && pinned && !maximized;
    document.body.classList.toggle("xiaowanzi-docked", docked);
    document.documentElement.style.setProperty("--xiaowanzi-docked-width", `${DOCKED_WIDTH}px`);
    document.documentElement.style.setProperty("--xiaowanzi-docked-top", `${DOCKED_TOP_OFFSET}px`);
    return () => {
      document.body.classList.remove("xiaowanzi-docked");
    };
  }, [open, pinned, maximized]);

  function stopXiaowanziResponse() {
    abortControllerRef.current?.abort();
    setStatusText("● 已停止输出");
    setMessages((prev) => prev.filter((item) => item.content !== "__THINKING__"));
  }

  async function sendMessage(text?: string) {
    if (sending) {
      stopXiaowanziResponse();
      return;
    }
    const plainContent = (text ?? input).trim();
    const imageAttachment = uploadedImage;
    if ((!plainContent && !imageAttachment)) return;
    const token = getSessionToken();
    if (!token) {
      shouldBlockXiaowanziForAuth();
      return;
    }
    const content = imageAttachment
      ? `${plainContent || (imageAttachment.kind === "file" ? "请帮我看一下这个文件" : "请帮我看一下这张图片")}\n\n[用户上传${imageAttachment.kind === "file" ? "文件" : "图片"}] ${imageAttachment.name}`
      : plainContent;
    if ((!isChildBound || !activeChild) && !homeActive) {
      setStatusText("● 请先选择孩子档案后提问");
      setHiddenEntryOpen(true);
      return;
    }

    const parentRole = getCurrentParentRole();
    const profileSummary = activeChild
      ? [
          buildChildProfileSummary(activeChild),
          parentRole ? `提问者身份:${parentRole}` : "",
        ].filter(Boolean).join("。")
      : [
          "当前为通用咨询模式",
          "用户未选择孩子档案",
          parentRole ? `提问者身份:${parentRole}` : "",
        ].filter(Boolean).join("。");
    const memory = activeChild ? await loadChildMemory(activeChild.id) : {};
    const memoryEnabled = memory.enabled !== false;
    const contextualContent = buildXiaowanziPromptPayload({
      profileSummary,
      memorySummary: memoryEnabled ? String(memory.summary || "").trim() : "",
      pageSummary: pageContext.summary,
      userContent: content,
    });

    const userMessage: Msg = {
      role: "user",
      content,
      ts: new Date().toISOString(),
    };
    const assistantTs = new Date(Date.now() + 1).toISOString();

    setSending(true);
    setStatusText("● 正在思考中...");
    // 插入一个 thinking 占位消息，收到第一个 delta 后移除
    const thinkingTs = new Date(Date.now() + 2).toISOString();
    setMessages((prev) => [...prev, userMessage, { role: "assistant" as const, content: "__THINKING__", ts: thinkingTs }]);
    setInput("");
    setAttachmentMenuOpen(false);
    if (inputRef.current?.classList.contains("xw-home-input")) {
      resetHomeInputHeight(inputRef.current);
      setHomeComposerExpanded(false);
    }
    setUploadedImage(null);
    setHasHistoryMessages(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsReplying(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/tutorbot/${BOT_ID}/messages`), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content: contextualContent, stream: true }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402 || isProRequiredPayload(err)) {
          setCanUseBot(false);
          showProUpgradeFromPayload(err);
          setMessages((prev) => prev.filter((item) => item.ts !== userMessage.ts && item.ts !== thinkingTs));
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setCanUseBot(false);
          if (res.status === 401) {
            setMessages((prev) => prev.filter((item) => item.ts !== userMessage.ts && item.ts !== thinkingTs));
            handleExpiredXiaowanziSession();
            return;
          }
          setStatusText("● 当前账号暂无小玩子权限");
        }
        const msg = String(err?.content || err?.detail || err?.message || "请求失败");
        setMessages((prev) => [...prev.filter((item) => item.ts !== thinkingTs), { role: "assistant", content: msg, ts: assistantTs }]);
        return;
      }
      if (!res.body) {
        throw new Error("当前浏览器不支持流式回复");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";
      let thinkingCleared = false;
      const appendAssistantContent = (delta: string) => {
        if (!delta) return;
        reply += delta;
        setMessages((prev) => {
          // 移除 thinking 占位（仅第一次）
          if (!thinkingCleared) {
            thinkingCleared = true;
            setStatusText("● 正在回复...");
            prev = prev.filter((item) => item.content !== "__THINKING__");
          }
          const existing = prev.find((item) => item.ts === assistantTs);
          if (existing) {
            return prev.map((item) => item.ts === assistantTs ? { ...item, content: item.content + delta } : item);
          }
          return [...prev, { role: "assistant", content: delta, ts: assistantTs }];
        });
        // 滚动到底部
        requestAnimationFrame(() => {
          const el = msgContainerRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
        });
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const eventName = part.split("\n").find((line) => line.startsWith("event:"))?.replace(/^event:\s*/, "").trim();
          const dataLine = part.split("\n").find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.replace(/^data:\s*/, ""));
          if (eventName === "delta") {
            appendAssistantContent(String(payload?.content || ""));
          } else if (eventName === "error") {
            appendAssistantContent(String(payload?.content || "请求失败"));
          }
        }
      }
      const finalReply = reply.trim() || "（小玩子暂时没有返回内容）";
      if (!reply.trim()) {
        setMessages((prev) => [...prev.filter((item) => item.content !== "__THINKING__"), { role: "assistant", content: finalReply, ts: assistantTs }]);
      }
      setStatusText("● 随时可用");
      const nextMessages = [
        ...messages.filter((m) => !isReadReceiptMessage(m.content) && m.content !== "__THINKING__"),
        userMessage,
        { role: "assistant" as const, content: finalReply, ts: assistantTs },
      ];
      setMessages(nextMessages);
      saveCachedHistory(nextMessages, currentHistoryChildId);
      if (activeChild && shouldPersistChildMemory({ childId: activeChild.id, enabled: memoryEnabled })) {
        await mergeChildMemory({
          childId: activeChild.id,
          childProfile: profileSummary,
          userMessage: content,
          assistantReply: finalReply,
        });
      }
      document.dispatchEvent(new CustomEvent("xf-billing-balance-changed", { detail: { featureKey: "xiaowanzi" } }));
    } catch (error: any) {
      if (error?.name === "AbortError") {
        setStatusText("● 已停止输出");
        setMessages((prev) => prev.filter((item) => item.content !== "__THINKING__"));
        return;
      }
      setStatusText("● 请求失败");
      const msg = `请求失败:${String(error?.message || "unknown")}`;
      setMessages((prev) => {
        prev = prev.filter((item) => item.content !== "__THINKING__");
        const existing = prev.find((item) => item.ts === assistantTs);
        if (existing) return prev.map((item) => item.ts === assistantTs ? { ...item, content: item.content || msg } : item);
        return [...prev, { role: "assistant", content: msg, ts: assistantTs }];
      });
    } finally {
      setIsReplying(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setSending(false);
    }
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (shouldBlockXiaowanziForAuth()) return;
      if (!isChildBound && !homeActive) {
        setHiddenEntryOpen(true);
        setStatusText("● 请先选择孩子档案后提问");
        return;
      }
      void sendMessage();
    }
  }

  function onInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
    if (event.currentTarget.classList.contains("xw-home-input")) {
      setHomeComposerExpanded(syncHomeInputHeight(event.currentTarget, event.target.value));
      return;
    }
    event.currentTarget.style.height = "auto";
    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
  }

  function startVoiceInput() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusText("● 当前浏览器不支持语音输入");
      return;
    }
    if (voiceListening) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onstart = () => {
      setVoiceListening(true);
      setStatusText("● 正在听你说话");
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((result: any) => String(result?.[0]?.transcript || ""))
        .join("")
        .trim();
      if (transcript) setInput(transcript);
    };
    recognition.onerror = () => {
      setVoiceListening(false);
      setVoiceHolding(false);
      setStatusText("● 语音输入失败，请重试");
    };
    recognition.onend = () => {
      setVoiceListening(false);
      setVoiceHolding(false);
      setStatusText("● 语音输入已结束");
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopVoiceInput() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setVoiceListening(false);
    setVoiceHolding(false);
  }

  function toggleVoiceInput() {
    if (shouldBlockXiaowanziForAuth()) return;
    if (voiceListening) {
      stopVoiceInput();
      return;
    }
    startVoiceInput();
  }

  function startInputVoicePress() {
    if (shouldBlockXiaowanziForAuth()) return;
    if (voicePressTimerRef.current) return;
    setVoiceHolding(true);
    voicePressTimerRef.current = window.setTimeout(() => {
      voicePressTimerRef.current = null;
      setVoiceHolding(false);
      startVoiceInput();
    }, 450);
  }

  function endInputVoicePress() {
    if (voicePressTimerRef.current) {
      window.clearTimeout(voicePressTimerRef.current);
      voicePressTimerRef.current = null;
    }
    setVoiceHolding(false);
    if (voiceListening) stopVoiceInput();
  }

  function onImagePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (shouldBlockXiaowanziForAuth()) return;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatusText("● 请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage({ name: file.name || "拍照上传图片", dataUrl: String(reader.result || "") });
      setAttachmentMenuOpen(false);
      setStatusText("● 图片已添加，可继续输入问题");
      inputRef.current?.focus();
    };
    reader.onerror = () => setStatusText("● 图片读取失败，请重试");
    reader.readAsDataURL(file);
  }

  function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (shouldBlockXiaowanziForAuth()) return;
    if (!file) return;
    setUploadedImage({ name: file.name || "上传文件", dataUrl: "", kind: "file" });
    setAttachmentMenuOpen(false);
    setStatusText("● 文件已添加，可继续输入问题");
    inputRef.current?.focus();
  }

  function onFabPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (open) return;
    dragRef.current.active = true;
    dragRef.current.moved = false;
    dragRef.current.pointerId = event.pointerId;
    dragRef.current.offsetX = event.clientX - fabPosition.left;
    dragRef.current.offsetY = event.clientY - fabPosition.top;
    event.currentTarget.setPointerCapture(event.pointerId);
    fabLongPressRef.current = window.setTimeout(() => {
      dragRef.current.moved = true;
      openHiddenEntry();
    }, 560);
  }

  function onFabPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.active) return;
    const next = clampFabPosition(
      {
        left: event.clientX - dragRef.current.offsetX,
        top: event.clientY - dragRef.current.offsetY,
      },
      window.innerWidth,
      window.innerHeight,
    );
    if (Math.abs(next.left - fabPosition.left) > 2 || Math.abs(next.top - fabPosition.top) > 2) {
      dragRef.current.moved = true;
      if (fabLongPressRef.current) {
        window.clearTimeout(fabLongPressRef.current);
        fabLongPressRef.current = null;
      }
    }
    setFabPosition(next);
  }

  function onFabPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.active) return;
    try {
      event.currentTarget.releasePointerCapture(dragRef.current.pointerId);
    } catch (_error) {}
    dragRef.current.active = false;
    if (fabLongPressRef.current) {
      window.clearTimeout(fabLongPressRef.current);
      fabLongPressRef.current = null;
    }
  }

  function onFabClick() {
    if (shouldBlockXiaowanziForAuth()) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    if (!open) {
      setPinned(false);
    }
    setAvatarState((value) => advanceAvatarState(value));
    setOpen((value) => !value);
  }

  function onAvatarError(event: React.SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    if (img.src.endsWith(AVATAR_FALLBACK_SRC)) return;
    img.src = AVATAR_FALLBACK_SRC;
  }

  function getFloatingPanelStyle(): React.CSSProperties | undefined {
    if (typeof window === "undefined" || maximized || pinned) return undefined;
    const left = clampFabPosition(
      {
        left: fabPosition.left - PANEL_WIDTH + FAB_SIZE,
        top: fabPosition.top - PANEL_MAX_HEIGHT - PANEL_GAP,
      },
      window.innerWidth - PANEL_WIDTH + FAB_SIZE,
      window.innerHeight - PANEL_MAX_HEIGHT + FAB_SIZE,
    );

    return {
      left: `${left.left}px`,
      top: `${left.top}px`,
      right: "auto",
      bottom: "auto",
    };
  }

  const embeddedLayer = useXiaowanziEmbeddedLayer();
  if (embeddedLayer) return null;

  /* ─── 分享卡片 Canvas 渲染（对话截图风格） ─── */
  const generateShareCard = async (baseMsg: Msg, msgs: Msg[]) => {
    const canvas = shareCanvasRef.current;
    if (!canvas) return;
    clearShareCardUrl();
    setShareGenerating(true);

    const W = SHARE_CARD_WIDTH;
    const PAD = 32;
    const FONT = 30;
    const LH = 1.55;
    const BUBBLE_PAD_X = 28;
    const BUBBLE_PAD_Y = 22;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setShareGenerating(false); return; }

    function cln(t: string) { return t.replace(/\*\*(.+?)\*\*/g,"$1").replace(/\*(.+?)\*/g,"$1").replace(/`{1,3}[^`]*`{1,3}/g,"").replace(/#{1,6}\s?/g,""); }
    function wrapParagraphs(c: CanvasRenderingContext2D, t: string, w: number): string[] {
      // 保留换行分段
      const paragraphs = t.split("\n");
      const result: string[] = [];
      for (const p of paragraphs) {
        if (!p.trim()) { result.push(""); continue; }
        const lines = wrap(c, p, w);
        result.push(...lines);
      }
      return result;
    }
    function wrap(c: CanvasRenderingContext2D, t: string, w: number): string[] {
      if (!t) return [""];
      const o: string[] = []; let cur = "";
      for (const ch of t) { if (c.measureText(cur + ch).width > w && cur) { o.push(cur); cur = ch; } else cur += ch; }
      if (cur) o.push(cur);
      return o.length ? o : [""];
    }

    try {
      const logoPromise = getCachedShareLogo();
      const qrPromise = getCachedShareQr();
      const logo = await logoPromise;
      const FS = "-apple-system,'PingFang SC',sans-serif";

      // ═══ 第一步：测量总高度 ═══
      let totalH = PAD;

      // Logo：放大到 88px 高，居中
      const logoH = SHARE_CARD_LOGO_HEIGHT;
      const rawLogoW = logo && logo.naturalWidth > 0 ? (logo.naturalWidth / logo.naturalHeight) * logoH : 120;
      const logoW = Math.min(rawLogoW, W - PAD * 4); // 限制最大宽度
      totalH += logoH + 20;
      const headerBottom = totalH;
      totalH += 20;

      // 对话区域：模拟界面气泡样式
      ctx.font = `${FONT}px ${FS}`;
      const contentW = W - PAD * 2;
      const BUBBLE_MAX_TEXT_W = contentW - BUBBLE_PAD_X * 2 - 16;
      const lineHeight = FONT * LH;

      const sections: { role: string; lines: string[]; bubbleH: number }[] = [];
      for (const msg of msgs) {
        if (msg.role !== "user" && msg.role !== "assistant") continue;
        const text = msg.role === "assistant" ? normalizeAssistantLayoutText(cln(msg.content)) : cln(msg.content);
        const lines = wrapParagraphs(ctx, text, BUBBLE_MAX_TEXT_W);
        const bubbleH = lines.length * lineHeight + BUBBLE_PAD_Y * 2;
        sections.push({ role: msg.role, lines, bubbleH });
        totalH += bubbleH + 24;
      }

      // 底部二维码
      totalH += 60;
      const qrY = totalH;
      totalH += 200;
      totalH += PAD;

      // ═══ 第二步：绘制 ═══
      const SCALE = getShareCardScale(totalH);
      canvas.width = W * SCALE;
      canvas.height = Math.ceil(totalH) * SCALE;

      ctx.scale(SCALE, SCALE);

      ctx.fillStyle = "#f8f7fc";
      ctx.fillRect(0, 0, W, totalH);

      // ── Logo 居中 ──
      let curY = PAD;
      if (logo && logo.naturalWidth > 0) {
        ctx.drawImage(logo, W/2 - logoW/2, curY, logoW, logoH);
      }
      curY = headerBottom + 20;

      // ── 对话气泡 ──
      ctx.font = `${FONT}px ${FS}`;
      ctx.textBaseline = "middle";
      for (const sec of sections) {
        const isUser = sec.role === "user";
        // 计算气泡实际宽度（自适应文本）
        let maxLW = Math.max(...sec.lines.map(l => ctx.measureText(l).width));
        let bw = Math.min(maxLW + BUBBLE_PAD_X * 2, contentW);
        bw = Math.max(bw, 80);

        if (isUser) {
          const ux = PAD + (contentW - bw) * 0.9;
          ctx.fillStyle = "#7C34E8";
          ctx.beginPath();
          ctx.roundRect(ux, curY, bw, sec.bubbleH, 22);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          const textCenterY = curY + sec.bubbleH / 2 - ((sec.lines.length - 1) * lineHeight) / 2;
          sec.lines.forEach((l, i) => {
            ctx.fillText(l, ux + BUBBLE_PAD_X, textCenterY + i * lineHeight);
          });
        } else {
          ctx.fillStyle = "#f3f0ff";
          ctx.beginPath();
          ctx.roundRect(PAD, curY, bw, sec.bubbleH, 22);
          ctx.fill();
          ctx.fillStyle = "#1e293b";
          const textCenterY2 = curY + sec.bubbleH / 2 - ((sec.lines.length - 1) * lineHeight) / 2;
          sec.lines.forEach((l, i) => {
            ctx.fillText(l, PAD + BUBBLE_PAD_X, textCenterY2 + i * lineHeight);
          });
        }
        curY += sec.bubbleH + 24;
      }

      // ── 底部二维码 ──
      curY = qrY;
      try {
        const qi = await qrPromise;
        if (qi && qi.naturalWidth > 0) {
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.roundRect(W/2 - 80, curY - 10, 160, 160, 22);
          ctx.fill();
          ctx.drawImage(qi, W/2 - 70, curY, 140, 140);
        }
      } catch {}
      ctx.textAlign = "center";
      ctx.fillStyle = "#475569";
      ctx.font = `22px ${FS}`;
      ctx.fillText("扫描二维码，和小玩子继续聊", W/2, curY + 180);

      showShareCardUrl(await canvasToShareObjectUrl(canvas));
    } catch (err) {
      console.error("generateShareCard error:", err);
      setShareToastMsg("生成失败，请重试");
      setTimeout(() => setShareToastMsg(""), 2000);
    } finally {
      setShareGenerating(false);
    }
  };

  /* ─── 分享：点击直接进入选择模式 ─── */
  const toggleShareMenu = (e: React.MouseEvent, msgTs: string) => {
    e.stopPropagation();
    clearShareRevealHideTimer();
    setShareSelectionMode(true);
    // 同时选中配对的 Q/A
    const ids = new Set<string>([msgTs]);
    const idx = visibleMessages.findIndex(m => m.ts === msgTs);
    if (idx >= 0) {
      const msg = visibleMessages[idx];
      if (msg.role === "user") {
        const nextMsg = visibleMessages[idx + 1];
        if (nextMsg && nextMsg.role === "assistant") ids.add(nextMsg.ts || "");
      } else if (msg.role === "assistant") {
        const prevMsg = visibleMessages[idx - 1];
        if (prevMsg && prevMsg.role === "user") ids.add(prevMsg.ts || "");
      }
    }
    setSelectedMessagesForShare(ids);
    clearShareCardUrl();
  };
  const revealShareButtonForMessage = (message: Msg) => {
    if (!isShareableAssistantMessage(message)) return;
    const messageId = message.ts || "";
    setShareRevealMessageId(messageId);
    scheduleShareRevealHide(messageId);
  };
  const toggleSelectMsg = (msgTs: string) => {
    setSelectedMessagesForShare((prev) => {
      const next = new Set(prev);
      if (next.has(msgTs)) {
        // 取消选中：同时取消配对的 Q/A
        next.delete(msgTs);
        const idx = visibleMessages.findIndex(m => m.ts === msgTs);
        if (idx >= 0) {
          const msg = visibleMessages[idx];
          if (msg.role === "user") {
            // 取消用户消息，同时取消后面紧跟的 assistant
            const nextMsg = visibleMessages[idx + 1];
            if (nextMsg && nextMsg.role === "assistant") next.delete(nextMsg.ts || "");
          } else if (msg.role === "assistant") {
            // 取消 assistant，同时取消前面紧跟的 user
            const prevMsg = visibleMessages[idx - 1];
            if (prevMsg && prevMsg.role === "user") next.delete(prevMsg.ts || "");
          }
        }
      } else {
        // 选中：同时选中配对的 Q/A
        next.add(msgTs);
        const idx = visibleMessages.findIndex(m => m.ts === msgTs);
        if (idx >= 0) {
          const msg = visibleMessages[idx];
          if (msg.role === "user") {
            // 选中用户消息，同时选中后面紧跟的 assistant
            const nextMsg = visibleMessages[idx + 1];
            if (nextMsg && nextMsg.role === "assistant") next.add(nextMsg.ts || "");
          } else if (msg.role === "assistant") {
            // 选中 assistant，同时选中前面紧跟的 user
            const prevMsg = visibleMessages[idx - 1];
            if (prevMsg && prevMsg.role === "user") next.add(prevMsg.ts || "");
          }
        }
      }
      return next;
    });
  };
  const exitShareSelectionMode = () => {
    setShareSelectionMode(false);
    setSelectedMessagesForShare(new Set());
  };
  function dismissShareSelectionBackdropEvent(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    exitShareSelectionMode();
  }
  const renderHomeTop = () => (
    <div className="xw-home-top">
      <button
        className="xw-home-menu"
        type="button"
        aria-label="历史记录"
        onClick={() => void openHomeHistoryMenu()}
      >
        menu
      </button>
      <button className="xw-home-brand-button" type="button" aria-label="新对话" onClick={openManualNewConversation}>
        <img key={displayAvatar} className="xw-home-brand-avatar" src={displayAvatar} alt="小玩子" draggable={false} loading="eager" decoding="async" onError={onAvatarError} />
      </button>
      <div className="xw-home-spacer" />
      <button
        className="xw-home-agent-entry"
        type="button"
        onClick={() => {
          if (shouldBlockXiaowanziForAuth()) return;
          setHomeBrowsingOpen(false);
          setHomeBrowseTarget(null);
          try {
            sessionStorage.setItem(RETURN_TO_HOME_KEY, "1");
          } catch (_error) {}
          window.location.href = "/experts?xw_layer=1&xw_return=xiaowanzi";
        }}
      >
        <img className="xw-home-agent-entry-icon" src="/assets/xianfeng-round-logo.webp" alt="" aria-hidden="true" draggable={false} loading="eager" decoding="async" />
        <span>先疯智库</span>
      </button>
      {!standalone ? <div className="xw-home-more-wrap">
        <button
          className="xw-home-icon"
          type="button"
          aria-label="更多"
          onClick={() => {
            setHomeHistoryDrawerOpen(false);
            document.dispatchEvent(new CustomEvent("xf-open-public-menu"));
          }}
        >
          more_vert
        </button>
      </div> : null}
    </div>
  );
  return (
    <>
      <style>{`
        #ai-fab{position:fixed !important;z-index:8100 !important;width:48px !important;height:48px !important;border-radius:50% !important;background:transparent !important;border:none !important;box-shadow:0 4px 20px rgba(124,52,232,.24) !important;display:flex !important;align-items:center !important;justify-content:center !important;cursor:grab !important;overflow:hidden !important;transition:all .2s !important;caret-color:transparent !important}
        #ai-fab:hover{transform:scale(1.1) !important;box-shadow:0 6px 28px rgba(124,52,232,.24) !important}
        body.xiaowanzi-docked #ai-fab{z-index:7000 !important}
        #ai-fab #ai-avatar-img{width:48px !important;height:48px !important;object-fit:contain !important;padding:6px !important;background:rgba(255,255,255,.92) !important;border-radius:50% !important;display:block !important}
        .ai-avatar-wrapper{position:relative;width:100%;height:100%;overflow:visible;caret-color:transparent !important}
        .ai-avatar-wrapper img{width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-drag:none;transition:all .3s ease}
        .ai-avatar-wrapper.avatar-fade-out img{opacity:0;transform:scale(.82) rotate(-8deg);filter:blur(4px)}
        .ai-avatar-wrapper.avatar-pop-in img{animation:avatarPopIn .4s cubic-bezier(.68,-0.55,.265,1.55) forwards}
        .ai-avatar-wrapper.avatar-glow img{filter:drop-shadow(0 0 14px rgba(124,52,232,.45)) drop-shadow(0 0 22px rgba(129,89,255,.28))}
        @keyframes avatarPopIn{0%{opacity:0;transform:scale(.82) rotate(-8deg)}65%{opacity:1;transform:scale(1.14) rotate(3deg)}100%{opacity:1;transform:scale(1) rotate(0deg)}}
        .ai-avatar-particles{position:absolute;inset:-8px;pointer-events:none;overflow:visible}
        .ai-avatar-particle{position:absolute;border-radius:999px;background:linear-gradient(135deg,#8b5cf6 0%,#60a5fa 100%);opacity:0;animation:avatarParticle .52s ease-out forwards;box-shadow:0 0 8px rgba(124,52,232,.26)}
        @keyframes avatarParticle{0%{opacity:0;transform:translate(0,0) scale(.5)}20%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.35)}}
        .ai-panel-backdrop{position:fixed;inset:0;z-index:7999;background:rgba(15,23,42,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:none}
        .ai-panel-backdrop.show{display:block}
        #ai-panel{position:fixed !important;bottom:86px !important;right:28px !important;z-index:8050 !important;width:360px !important;max-height:520px !important;background:linear-gradient(180deg,rgba(255,255,255,.98) 0%,rgba(250,251,255,.98) 100%) !important;border:1px solid rgba(124,52,232,.16) !important;border-radius:18px !important;box-shadow:0 18px 48px rgba(31,41,55,.16),0 4px 18px rgba(124,52,232,.12) !important;display:flex;flex-direction:column !important;overflow:hidden !important;animation:panelIn .2s ease !important;box-sizing:border-box !important}
        #ai-panel.docked{top:0 !important;right:10px !important;bottom:10px !important;left:auto !important;width:calc(var(--xiaowanzi-docked-width,430px) - 20px) !important;height:calc(100vh - 10px) !important;max-height:calc(100vh - 10px) !important;border-radius:0 0 24px 24px !important;animation:none !important;border-left:1px solid rgba(124,52,232,.16) !important;border-right:1px solid rgba(124,52,232,.12) !important;border-top:1px solid rgba(124,52,232,.12) !important;box-shadow:none !important}
        #ai-panel.max{top:50% !important;left:50% !important;right:auto !important;bottom:auto !important;transform:translate(-50%,-50%) !important;width:min(680px,calc(100vw - 24px)) !important;max-width:min(680px,calc(100vw - 24px)) !important;height:min(78vh,760px) !important;max-height:min(78vh,760px) !important}
        @media (max-width:560px){#ai-panel.max{width:calc(100vw - 16px) !important;max-width:calc(100vw - 16px) !important;height:calc(100vh - 16px) !important;max-height:calc(100vh - 16px) !important;border-radius:16px !important}}
        @media (max-width: 768px){
          #ai-fab{display:none !important}
          #ai-panel{
            left:8px !important;
            right:8px !important;
            bottom:calc(84px + env(safe-area-inset-bottom)) !important;
            top:auto !important;
            width:auto !important;
            max-width:none !important;
            max-height:68vh !important;
            border-radius:16px !important;
          }
        }
        body.xiaowanzi-docked #app-shell{padding-right:var(--xiaowanzi-docked-width,430px);transition:padding-right .2s ease;border-radius:0 24px 24px 0;overflow:hidden}
        body.xiaowanzi-docked #app-shell nav.fixed.top-0.z-50.w-full{width:calc(100% - var(--xiaowanzi-docked-width,430px));border-top-right-radius:24px}
        @media (max-width: 980px){
          body.xiaowanzi-docked #app-shell{padding-right:0}
          body.xiaowanzi-docked #app-shell nav.fixed.top-0.z-50.w-full{width:100%}
          #ai-panel.docked{width:min(94vw,420px) !important}
        }
        @keyframes panelIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
        .aip-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(124,52,232,.12);flex-shrink:0;position:relative;background:transparent !important}
        .aip-gem{width:40px !important;height:40px !important;display:flex !important;align-items:center !important;justify-content:center !important;flex-shrink:0 !important}
        .aip-gem #ai-panel-avatar-img{width:40px !important;height:40px !important;object-fit:contain !important;padding:4px !important;border-radius:10px !important;display:block !important}
        .aip-title{font-size:13.5px;font-weight:700;flex:1}
        .aip-status{font-size:10px;color:#059669;font-weight:600}
        .aip-child-row{display:flex;align-items:center;gap:8px;padding:7px 14px;border-bottom:1px solid rgba(124,52,232,.08);background:rgba(250,248,255,.72)}
        .aip-child-chip{display:inline-flex;align-items:center;gap:6px;padding:0;border:0;background:transparent;font-size:11px;font-weight:600;color:#8b93a7}
        .aip-child-chip::before{content:"";width:6px;height:6px;border-radius:999px;background:#22c55e;box-shadow:0 0 0 2px rgba(34,197,94,.12)}
        .aip-child-state{margin-left:auto;color:#a5adbd;font-size:11px;font-weight:600}
        .aip-child-switch{margin-left:auto;border:none;background:transparent;color:#7c3aed;font-size:11px;font-weight:700;cursor:pointer;padding:2px 0}
        .aip-icon-btn{position:absolute;top:50%;transform:translateY(-50%);width:34px !important;height:34px !important;border:none;border-radius:50% !important;background:rgba(124,52,232,.045);color:#6b7280;font-family:'Material Symbols Rounded';font-size:16px;cursor:pointer;transition:all .12s;display:flex;align-items:center;justify-content:center}
        .aip-pin{right:92px}
        .aip-theme{right:132px}
        .aip-enlarge{right:52px}
        .aip-close{right:12px}
        .aip-pin{background:#f1eff8;color:#6b7280}
        .aip-pin.on{background:#ece8f7;color:#4b5563;box-shadow:inset 0 0 0 1px rgba(124,52,232,.12)}
        .aip-icon-btn:hover{background:rgba(124,52,232,.075);color:#1f2937;transform:translateY(-50%) scale(1.1)}
        .aip-msgs{flex:1;overflow-y:auto;padding:12px 12px 10px;display:flex;flex-direction:column;gap:10px;min-height:0;background:transparent}
        .aip-msgs::-webkit-scrollbar{width:3px}
        .aip-msgs::-webkit-scrollbar-thumb{background:rgba(124,52,232,.18);border-radius:3px}
        .aip-msg{max-width:86%;font-size:13px;line-height:1.72;font-weight:500;padding:11px 13px;border-radius:12px;word-break:break-word;white-space:pre-wrap;position:relative}
        .aip-msg.ai{max-width:calc(86% + 10px);background:#fff;color:#1f2937;border:1px solid rgba(124,52,232,.1);border-radius:8px 14px 14px 14px;align-self:flex-start;box-shadow:0 3px 10px rgba(15,23,42,.06)}
        .xw-thinking-row{display:flex;align-items:center;gap:5px;padding:4px 0}
        .xw-tdot{width:7px;height:7px;border-radius:50%;background:#a78bfa;animation:xwTDot 1.4s ease-in-out infinite}
        .xw-tdot:nth-child(2){animation-delay:.2s}
        .xw-tdot:nth-child(3){animation-delay:.4s}
        .xw-tlabel{font-size:12px;color:#a78bfa;font-weight:600;animation:xwTPulse 2s ease-in-out infinite}
        @keyframes xwTDot{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1.2)}}
        @keyframes xwTPulse{0%,100%{opacity:.5}50%{opacity:1}}
        @keyframes thinkingDot{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1.2)}}
        .aip-thinking-label{font-size:11px;color:#a78bfa;font-weight:600;margin-left:6px;animation:thinkingLabelPulse 2s ease-in-out infinite}
        @keyframes thinkingLabelPulse{0%,100%{opacity:.5}50%{opacity:1}}}
        .aip-msg.user{background:#601BEC;color:#fff;border-radius:14px 8px 14px 14px;align-self:flex-end;box-shadow:0 8px 16px rgba(96,27,236,.2)}
        .aip-empty{margin-top:clamp(12px,8vh,96px);padding:8px 8px 18px}
        .aip-empty-title{font-size:clamp(1.35rem,6vw,1.75rem);line-height:1.18;font-weight:800;color:#1f2937;letter-spacing:-.02em}
        .aip-empty-sub{font-size:clamp(.95rem,3.8vw,1.05rem);line-height:1.35;font-weight:700;color:#4b5563;margin-top:2px}
        .aip-empty-suggests{display:flex;flex-direction:column;align-items:flex-start;gap:9px;margin-top:16px;width:100%}
        .aip-empty-btn{display:inline-flex;align-items:center;width:auto;max-width:100%;min-height:38px;padding:8px 14px;border:1px solid rgba(124,52,232,.08);border-radius:999px;text-align:left;background:linear-gradient(180deg,#f3f0ff 0%,#eceff8 100%);color:#253046;font-size:clamp(.86rem,3.4vw,.95rem);line-height:1.28;font-weight:700;box-shadow:0 8px 18px rgba(31,41,55,.06)}
        .aip-empty-btn:hover{background:linear-gradient(180deg,#ede7ff 0%,#e5e8f4 100%);border-color:rgba(124,52,232,.16)}
        .aip-shortcuts{display:flex;align-items:flex-end;gap:8px;padding:8px 12px;border-top:1px solid rgba(124,52,232,.1);flex-shrink:0;background:#fff}
        .aip-shortcuts-list{display:flex;flex-wrap:wrap;gap:5px;flex:1;min-width:0}
        .aip-shortcuts-actions{margin-left:auto;display:none;align-items:center;gap:6px;flex-shrink:0}
        #ai-panel.max .aip-shortcuts-actions{display:flex}
        .aip-temp-history-btn{height:28px;min-width:84px;padding:0 10px;border:1px solid rgba(124,52,232,.12);border-radius:16px;background:#fff;color:#6b7280;font-size:11px;font-weight:600}
        .aip-history-panel{position:absolute;right:12px;bottom:116px;width:220px;max-height:280px;background:#fff;border:1px solid rgba(124,52,232,.16);border-radius:12px;box-shadow:0 14px 28px rgba(15,23,42,.16);overflow:hidden;z-index:8201}
        .aip-history-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(124,52,232,.1);font-size:12px;font-weight:700;color:#374151}
        .aip-history-close{border:none;background:transparent;color:#6b7280;font-family:'Material Symbols Rounded';font-size:16px}
        .aip-history-list{max-height:238px;overflow:auto;padding:8px}
        .aip-history-empty{padding:14px 8px;font-size:11px;color:#94a3b8}
        .aip-history-card{width:100%;text-align:left;border:1px solid rgba(124,52,232,.1);background:#f8f8ff;border-radius:10px;padding:8px 9px;margin-bottom:6px}
        .aip-history-card:last-child{margin-bottom:0}
        .aip-history-card:hover{background:#f1efff;border-color:rgba(124,52,232,.22)}
        .aip-history-card-title{font-size:11px;font-weight:600;color:#374151;line-height:1.35}
        .aip-history-card-sub{margin-top:3px;font-size:10px;color:#94a3b8}
        .aip-history-card-tag{margin-top:3px;font-size:10px;color:#4f46e5}
        .aip-history-panel.home{position:fixed;right:24px;top:92px;bottom:auto;width:min(330px,calc(100vw - 48px));max-height:62vh;border-radius:22px;box-shadow:0 22px 54px rgba(51,45,118,.2)}
        .aip-history-panel.home .aip-history-head{padding:14px 16px;font-size:16px}
        .aip-history-panel.home .aip-history-list{max-height:calc(62vh - 54px);padding:12px}
        .aip-history-panel.home .aip-history-card{border-radius:16px;padding:13px 14px;margin-bottom:10px}
        .aip-history-panel.home .aip-history-card-title{font-size:14px;font-weight:900;color:#1f254b}
        .aip-history-panel.home .aip-history-card-sub,.aip-history-panel.home .aip-history-card-tag{font-size:12px}
        .aip-sc{padding:4px 10px;border:1px solid rgba(124,52,232,.12);border-radius:20px;font-size:11px;background:#faf7ff;color:#6b7280;cursor:pointer;transition:all .1s;white-space:nowrap}
        .aip-sc:hover{border-color:#7C34E8;color:#7C34E8;background:rgba(124,52,232,.08)}
        .aip-input-row{display:flex;align-items:center;gap:8px;padding:10px 12px 12px;border-top:1px solid rgba(124,52,232,.1);flex-shrink:0;background:#fff}
        .aip-input-wrap{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;width:100%}
        .aip-input-shell{position:relative;display:flex;align-items:stretch;flex:1;min-width:0;width:100%}
        .aip-input{flex:1;resize:none;border:1px solid rgba(124,52,232,.18);border-radius:14px;padding:12px 56px 12px 11px;font:inherit;font-size:13px;color:#1f2937;background:#fbfbff;outline:none;min-height:72px;max-height:160px;transition:border-color .15s,box-shadow .15s,background .15s;line-height:1.45}
        .aip-input:focus{border-color:#7C34E8;background:#fff;box-shadow:0 0 0 3px rgba(124,52,232,.12)}
        .aip-input::placeholder{color:#9ca3af}
        .aip-send{position:absolute;right:8px;bottom:8px;width:36px;height:36px;border:none;border-radius:11px;background:#7C34E7;color:#fff;cursor:pointer;flex-shrink:0;align-self:center;font-family:'Material Symbols Rounded';font-size:16px;transition:all .15s;box-shadow:0 8px 16px rgba(124,52,231,.24)}
        .aip-plus{position:absolute;right:48px;bottom:8px;width:36px;height:36px;border:1px solid rgba(124,52,232,.2);border-radius:11px;background:#fff;color:#7C34E8;cursor:pointer;font-family:'Material Symbols Rounded';font-size:17px;z-index:2}
        .aip-plus.on{background:#f4efff;border-color:rgba(124,52,232,.34)}
        .aip-attach-menu{position:absolute;right:0;bottom:52px;z-index:3;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:min(260px,100%);padding:12px;border-radius:18px;background:rgba(246,246,255,.98);box-shadow:0 16px 36px rgba(43,47,96,.16),0 0 0 1px rgba(124,52,232,.12);isolation:isolate}
        .aip-attach-menu::before{content:"";position:absolute;inset:0;z-index:0;border-radius:inherit;background:linear-gradient(180deg,#fff 0%,#f0f2ff 100%);pointer-events:none}
        .aip-attach-action{position:relative;z-index:1;border:0;background:transparent;color:#11143b;font-size:11px;font-weight:850;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0;white-space:nowrap;cursor:pointer}
        .aip-attach-action .ms{width:44px;height:44px;border-radius:15px;background:#fff;box-shadow:0 8px 18px rgba(70,73,132,.1);font-family:'Material Symbols Rounded';font-size:24px;color:#10085f;display:flex;align-items:center;justify-content:center}
        .aip-send:hover{background:#8b4af5;transform:translateY(-1px)}
        .aip-send:disabled{opacity:.4;cursor:not-allowed;transform:none}
        #ai-panel.docked .aip-shortcuts{padding:10px 10px 8px;background:transparent;border-top:none}
        #ai-panel.docked .aip-shortcuts-list{gap:8px}
        #ai-panel.docked .aip-sc{padding:7px 12px;background:#eceff7;border-color:#d7dced;color:#475569;font-size:13px;border-radius:999px}
        #ai-panel.docked .aip-sc:hover{background:#e2e7f5;border-color:#c7d0ea;color:#334155}
        #ai-panel.docked .aip-input-row{padding:8px 10px 10px;background:#f5f6fb;border-top:1px solid #e7e9f5}
        #ai-panel.docked .aip-input-shell{padding:0}
        #ai-panel.docked .aip-input{border:1px solid #cfd7ec;background:#fff;box-shadow:0 1px 0 rgba(255,255,255,.8);border-radius:18px}
        #ai-panel.docked .aip-input:focus{border-color:#7C34E8;box-shadow:0 0 0 3px rgba(124,52,232,.12);background:#fff}
        #ai-panel.docked .aip-share{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:9px 12px;border:1px solid #d9deef;border-radius:16px;background:#f1f3fa;color:#4b5563;font-size:12.5px;font-weight:600}
        #ai-panel.docked .aip-share span{white-space:normal;word-break:break-word;line-height:1.45;flex:1;min-width:0}
        #ai-panel.docked .aip-share-close{border:none;background:transparent;color:#6b7280;font-size:16px;line-height:1;font-family:'Material Symbols Rounded'}
        #ai-panel.docked .aip-head{border-radius:0 0 16px 16px}
        #ai-panel.docked .aip-msg.ai{border-radius:16px}
        #ai-panel.docked .aip-msg.user{border-radius:16px}
        #ai-panel.docked.docked-dark{background:#101317 !important;border-color:#252b33 !important;color:#e5e7eb !important}
        #ai-panel.docked.docked-dark .aip-head{background:#101317 !important;border-bottom:1px solid #252b33 !important}
        #ai-panel.docked.docked-dark .aip-title{color:#f8fafc}
        #ai-panel.docked.docked-dark .aip-status{color:#34d399}
        #ai-panel.docked.docked-dark .aip-icon-btn{background:#1b2129;color:#cbd5e1}
        #ai-panel.docked.docked-dark .aip-icon-btn:hover{background:#232b35;color:#fff}
        #ai-panel.docked.docked-dark .aip-msgs{background:transparent}
        #ai-panel.docked.docked-dark .aip-msg.ai{background:#161b22;border-color:#2c3340;color:#e5e7eb}
        #ai-panel.docked.docked-dark .aip-msg.user{background:#601BEC;color:#fff}
        #ai-panel.docked.docked-dark .aip-empty-title{color:#dbeafe}
        #ai-panel.docked.docked-dark .aip-empty-sub{color:#d1d5db}
        #ai-panel.docked.docked-dark .aip-empty-btn{background:#1d2430;color:#e2e8f0}
        #ai-panel.docked.docked-dark .aip-empty-btn:hover{background:#283142}
        #ai-panel.docked.docked-dark .aip-shortcuts{border-top:1px solid #252b33}
        #ai-panel.docked.docked-dark .aip-sc{background:#1a202a;border-color:#313a49;color:#d1d5db}
        #ai-panel.docked.docked-dark .aip-sc:hover{background:#232a37;border-color:#495162;color:#fff}
        #ai-panel.docked.docked-dark .aip-input-row{background:#101317;border-top:1px solid #252b33}
        #ai-panel.docked.docked-dark .aip-input{background:#0f141b;border-color:#2f3745;color:#e5e7eb}
        #ai-panel.docked.docked-dark .aip-input::placeholder{color:#7b8798}
        #ai-panel.docked.docked-dark .aip-share{background:#161c24;border-color:#2f3745;color:#cbd5e1}
        #ai-panel.docked.docked-dark .aip-share-close{color:#94a3b8}
        .aip-hidden-mask{position:fixed;inset:0;background:rgba(15,23,42,.36);z-index:8400}
        .aip-hidden-sheet{position:fixed;left:0;right:0;bottom:0;z-index:8401;background:#f7f4ff;border-radius:18px 18px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));max-height:78vh;overflow:auto;box-shadow:0 -18px 30px rgba(15,23,42,.2)}
        .aip-sheet-title{font-size:18px;font-weight:800;color:#1f2937;margin-bottom:10px}
        .aip-sheet-actions{display:flex;gap:10px;margin-top:8px}
        .aip-sheet-btn{flex:1;height:44px;border:none;border-radius:12px;background:linear-gradient(135deg,#7C34E8 0%,#7f37ea 100%);color:#fff;font-size:15px;font-weight:700;box-shadow:0 10px 20px rgba(124,52,232,.22)}
        .aip-sheet-btn.light{background:#f3edff;color:#7C34E8;border:1px solid rgba(124,52,232,.22);box-shadow:none}
        .aip-child-card{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e5e7f2;border-radius:12px;padding:10px;margin-bottom:9px}
        .aip-child-card-avatar{width:40px;height:40px;border-radius:999px;background:#e4e7ff;display:flex;align-items:center;justify-content:center;color:#4338ca;font-weight:700}
        .aip-child-card-main{flex:1;min-width:0}
        .aip-child-card-name{font-size:15px;font-weight:700;color:#1f2937}
        .aip-child-card-tag{font-size:11px;color:#6b7280}
        .aip-child-card-btn{border:none;border-radius:999px;background:linear-gradient(135deg,#7C34E8 0%,#7f37ea 100%);color:#fff;padding:7px 14px;font-size:12px;font-weight:700;box-shadow:0 8px 16px rgba(124,52,232,.2)}
        .aip-child-card-btn:disabled{opacity:.55;box-shadow:none}
        .aip-form-row{margin-bottom:10px}
        .aip-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .aip-form-label{font-size:12px;color:#445066;font-weight:800;margin-bottom:6px}
        .aip-form-input{width:100%;height:42px;border:1px solid rgba(17,20,59,.1);border-radius:14px;padding:0 12px;background:#f8fafc;color:#11143b;font-size:13px;font-weight:700;outline:none}
        .aip-form-input:focus{border-color:rgba(111,92,246,.55);background:#fff}
        .aip-tag-grid{display:flex;flex-wrap:wrap;gap:7px}
        .aip-tag-btn{min-height:32px;border:1px solid rgba(17,20,59,.08);background:#f4f6fb;color:#697189;border-radius:999px;padding:0 12px;font-size:12px;font-weight:800}
        .aip-tag-btn.on{border-color:#7c4dff;color:#7C34E8;background:#efe8ff}
        .aip-profile-select{position:relative;width:100%}
        .aip-profile-select-trigger{width:100%;height:42px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid rgba(17,20,59,.1);border-radius:14px;background:#f8fafc;padding:0 11px 0 12px;color:#11143b;font-size:13px;font-weight:800;text-align:left;outline:none}
        .aip-profile-select-trigger.placeholder{color:#8b93a7}
        .aip-profile-select-trigger .ms{font-family:'Material Symbols Rounded';font-size:20px;font-weight:400;color:#64748b;transition:transform .16s ease}
        .aip-profile-select.open .aip-profile-select-trigger{border-color:rgba(124,77,255,.62);background:#fff;box-shadow:0 0 0 3px rgba(124,77,255,.08)}
        .aip-profile-select.open .aip-profile-select-trigger .ms{transform:rotate(180deg);color:#7C34E8}
        .aip-profile-select-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:2;max-height:218px;overflow:auto;border:1px solid rgba(124,77,255,.16);border-radius:16px;background:rgba(255,255,255,.98);box-shadow:0 18px 34px rgba(31,20,71,.14);padding:6px;scrollbar-width:none}
        .aip-profile-select-menu::-webkit-scrollbar{display:none}
        .aip-profile-select-option{width:100%;min-height:38px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:0;border-radius:12px;background:transparent;padding:0 10px;color:#11143b;font-size:13px;font-weight:800;text-align:left}
        .aip-profile-select-option.on{background:#efe8ff;color:#7C34E8}
        .aip-profile-select-option .ms{font-family:'Material Symbols Rounded';font-size:18px;font-weight:400}
        .xw-home{--xw-home-x:0px;position:fixed;inset:0;z-index:8050;background:radial-gradient(circle at 74% 2%,rgba(255,228,236,.9) 0,rgba(255,228,236,0) 34%),radial-gradient(circle at 16% 10%,rgba(211,218,255,.92) 0,rgba(211,218,255,0) 40%),linear-gradient(180deg,#f2f1ff 0%,#e9edff 100%);color:#11143b;display:flex;flex-direction:column;overflow:hidden;transform-origin:50% 100%;animation:xwRealmEnter .86s cubic-bezier(.18,.92,.2,1) both;will-change:transform,opacity,filter;-webkit-transform:translateZ(0)}
        .xw-home::before{content:"";position:absolute;left:50%;bottom:-110px;width:260px;height:260px;border-radius:999px;background:conic-gradient(from 20deg,rgba(124,92,255,0),rgba(124,92,255,.92),rgba(89,201,255,.8),rgba(255,156,220,.76),rgba(124,92,255,0));transform:translateX(-50%) scale(.18);filter:blur(3px);opacity:0;mix-blend-mode:screen;pointer-events:none;animation:xwPortalBurst .9s ease-out both}
        .xw-home::after{content:"";position:absolute;inset:-12% -36%;background:linear-gradient(105deg,transparent 12%,rgba(255,255,255,0) 34%,rgba(255,255,255,.86) 48%,rgba(190,203,255,.42) 54%,rgba(255,255,255,0) 66%,transparent 100%);transform:translateX(-68%) skewX(-14deg);opacity:0;pointer-events:none;animation:xwPageSweep .72s .08s ease-out both}
        .xw-home-top,.xw-home-scroll,.xw-home-inputbar{animation:xwRealmContent .46s .34s ease-out both}
        .xw-home-scroll{animation-delay:.42s}
        .xw-home-inputbar{animation-delay:.5s}
        .xw-home.no-intro,.xw-home.no-intro::before,.xw-home.no-intro::after,.xw-home.no-intro .xw-home-top,.xw-home.no-intro .xw-home-scroll,.xw-home.no-intro .xw-home-inputbar,.xw-home.no-intro .xw-home-brand-avatar,.xw-home.no-intro .xw-home-hello,.xw-home.no-intro .xw-home-hello-star,.xw-home.no-intro .xw-home-greet strong{animation:none!important;opacity:1!important;filter:none!important;clip-path:none!important}
        .xw-home.no-intro{transform:translateX(var(--xw-home-x))!important}
        .xw-home.no-intro::before,.xw-home.no-intro::after{display:none!important}
        .xw-home.no-intro .xw-home-top,.xw-home.no-intro .xw-home-scroll,.xw-home.no-intro .xw-home-inputbar{transform:none!important}
        @keyframes xwRealmEnter{0%{opacity:0;transform:translateX(var(--xw-home-x)) perspective(900px) translateY(74px) rotateX(68deg) rotateY(-7deg) scale(.58);filter:blur(18px) saturate(1.45) brightness(1.18)}28%{opacity:1;transform:translateX(var(--xw-home-x)) perspective(900px) translateY(-18px) rotateX(-10deg) rotateY(3deg) scale(1.045);filter:blur(4px) saturate(1.2) brightness(1.08)}62%{transform:translateX(var(--xw-home-x)) perspective(900px) translateY(5px) rotateX(3deg) rotateY(0) scale(.995);filter:blur(0) saturate(1.05)}100%{opacity:1;transform:translateX(var(--xw-home-x)) perspective(900px) translateY(0) rotateX(0) rotateY(0) scale(1);filter:none}}
        @keyframes xwPortalBurst{0%{opacity:0;transform:translateX(-50%) scale(.12) rotate(0deg)}18%{opacity:.95}72%{opacity:.58;transform:translateX(-50%) scale(2.2) rotate(168deg)}100%{opacity:0;transform:translateX(-50%) scale(3.05) rotate(240deg)}}
        @keyframes xwPageSweep{0%{opacity:0;transform:translateX(-70%) skewX(-16deg)}22%{opacity:1}100%{opacity:0;transform:translateX(74%) skewX(-16deg)}}
        @keyframes xwRealmContent{from{opacity:0;transform:translateY(18px) scale(.985);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}
        @keyframes xwBrandAvatarSwap{0%{opacity:0;transform:translate(-7px,1px) scale(.72) rotate(-10deg);filter:blur(5px) drop-shadow(0 5px 10px rgba(92,75,190,.14))}58%{opacity:1;transform:translate(1px,1px) scale(1.12) rotate(4deg);filter:blur(0) drop-shadow(0 7px 14px rgba(92,75,190,.2))}100%{opacity:1;transform:translate(-4px,1px) scale(1) rotate(0);filter:drop-shadow(0 5px 10px rgba(92,75,190,.14))}}
        @keyframes xwHomeHelloIn{0%{opacity:0;transform:translateY(10px) scale(.94);filter:blur(7px)}70%{opacity:1;transform:translateY(-2px) scale(1.03);filter:blur(0)}100%{opacity:1;transform:none;filter:none}}
        @keyframes xwHomeTitleReveal{from{clip-path:inset(0 100% 0 0);filter:blur(3px)}to{clip-path:inset(0 0 0 0);filter:none}}
        @keyframes xwHomeStarPop{0%{opacity:0;transform:scale(.45) rotate(-24deg);filter:blur(4px) drop-shadow(0 7px 12px rgba(92,75,190,.16))}58%{opacity:1;transform:scale(1.18) rotate(8deg);filter:blur(0) drop-shadow(0 9px 15px rgba(92,75,190,.2))}100%{opacity:1;transform:scale(1) rotate(0);filter:drop-shadow(0 7px 12px rgba(92,75,190,.16))}}
        @keyframes xwHomeStarTwinkle{0%,100%{transform:scale(1);box-shadow:0 0 0 rgba(124,77,255,0)}50%{transform:scale(1.08);box-shadow:0 0 18px rgba(124,77,255,.22)}}
        .xw-home-top{position:relative;z-index:30;height:56px;padding:env(safe-area-inset-top) 12px 0;display:flex;align-items:center;gap:7px;flex-shrink:0;background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
        html.xf-mp-webview .xw-home{background:#f2f1ff!important;padding-top:var(--xf-native-webview-shift,0px)!important;overflow:visible!important;transform:none!important;-webkit-transform:none!important;animation:none!important;will-change:auto!important}
        html.xf-mp-webview .xw-home-top{display:none!important}
        .xw-home-icon{border:0;background:transparent;color:rgba(17,20,59,.78);box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}
        .xw-home .ms,.xw-home-menu,.xw-home-icon,.xw-home-history-exit,.xw-home-history-new .ms,.xw-home-question .ms,.xw-home-browser-close,.xw-home-voice-cue,.xw-home-send,.xw-home-plus,.xw-home-attachment-file,.xw-home-attachment button,.xw-home-attach-action .ms{font-family:'Material Symbols Rounded'!important;font-weight:400;font-style:normal;line-height:1;letter-spacing:normal;text-transform:none;font-feature-settings:'liga' 1;font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;font-synthesis:none;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
        .xw-home-menu{width:38px;height:32px;border:0;background:transparent;box-shadow:none;color:rgba(17,20,59,.82);font-family:'Material Symbols Rounded';font-size:24px;font-weight:300;display:flex;align-items:center;justify-content:center;padding:0;opacity:.9}
        .xw-home-brand-button{width:36px;height:36px;border:0;border-radius:999px;background:transparent;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
        .xw-home-brand-button:focus-visible{outline:2px solid rgba(96,27,236,.38);outline-offset:2px}
        .xw-home-brand-avatar{width:32px;height:32px;object-fit:contain;display:block;filter:drop-shadow(0 5px 10px rgba(92,75,190,.14));transform:translate(-4px,1px);animation:xwBrandAvatarSwap .38s cubic-bezier(.2,.9,.22,1) both}
        .xw-home-spacer{flex:1}
        .xw-home-icon{width:38px;height:32px;border-radius:999px;font-family:'Material Symbols Rounded';font-size:24px;font-weight:300;display:flex;align-items:center;justify-content:center}
        .xw-home-agent-entry{height:38px;border:0;border-radius:999px;background:rgba(91,72,255,.06);box-shadow:none;border:1px solid rgba(124,77,255,.22);color:#4f5878;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 12px 0 9px;font-size:14px;font-weight:750;white-space:nowrap}
        .xw-home-agent-entry-icon{width:29px;height:29px;border-radius:999px;display:block;object-fit:contain;filter:drop-shadow(0 5px 10px rgba(92,75,190,.24));transform:translateY(-1px)}
        .xw-home-more-wrap{position:relative;z-index:40}
        html.xf-mp-webview .xw-home-more-wrap{display:none!important}
        .xw-home-history-mask{position:fixed;inset:0;z-index:8072;background:rgba(15,23,42,.46);display:flex;justify-content:flex-start;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:xwHistoryMaskIn .2s cubic-bezier(.2,.9,.22,1) both}
        .xw-home-history-drawer{position:relative;display:flex;flex-direction:column;width:min(360px,84vw);height:100dvh;box-sizing:border-box;background:#f7f7fb;box-shadow:18px 0 45px rgba(15,23,42,.2);padding:calc(20px + env(safe-area-inset-top)) 18px max(24px,calc(18px + env(safe-area-inset-bottom)));overflow:hidden;animation:xwHistoryDrawerIn .2s cubic-bezier(.2,.9,.22,1) both}
        .xw-home-history-drawer-head{height:46px;display:flex;align-items:center;justify-content:center;margin-bottom:18px}
        .xw-home-history-new{height:42px;width:min(280px,100%);min-width:0;border:0;border-radius:999px;background:#ededf0;color:#303445;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 14px;font-size:15px;font-weight:900;white-space:nowrap}
        .xw-home-history-new .ms{font-family:'Material Symbols Rounded';font-size:22px;font-weight:300;color:#11143b}
        .xw-home-history-drawer-title{display:block;margin:0 0 16px 6px;font-size:22px;font-weight:1000;color:#11143b}
        .xw-home-history-list{display:flex;flex:1;min-height:0;flex-direction:column;gap:10px;overflow:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:62px}
        .xw-home-history-list::-webkit-scrollbar{display:none}
        .xw-home-history-list .aip-history-card{margin-bottom:0;background:#fff;border-color:rgba(124,77,255,.12);border-radius:16px;padding:13px 14px}
        .xw-home-history-list .aip-history-card-title{font-size:14px;font-weight:900;color:#1f254b}
        .xw-home-history-list .aip-history-card-sub,.xw-home-history-list .aip-history-card-tag{font-size:12px}
        .xw-home-history-list .aip-history-empty{padding:24px 8px;text-align:center}
        .xw-home-history-exit{width:44px;height:44px;border:0;border-radius:50%;background:#601BEC;box-shadow:0 14px 30px rgba(96,27,236,.28);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
        .xw-home-history-exit-dock{position:absolute;right:18px;bottom:calc(22px + env(safe-area-inset-bottom));z-index:3}
        @keyframes xwHistoryMaskIn{from{opacity:0}to{opacity:1}}
        @keyframes xwHistoryDrawerIn{from{opacity:.72;transform:translateX(-100%)}to{opacity:1;transform:none}}
        @keyframes xwMoreIn{from{opacity:0;transform:translateY(-6px) scale(.96)}to{opacity:1;transform:none}}
        .xw-home-scroll{position:relative;z-index:1;flex:1;min-height:0;overflow:auto;padding:6px 15px 113px;-webkit-overflow-scrolling:touch}
        .xw-home-hero{position:relative;min-height:168px;display:grid;grid-template-columns:132px 1fr;align-items:center;gap:20px;margin:2px 0 8px}
        .xw-home-avatar-wrap{position:relative;width:132px;height:132px;filter:drop-shadow(0 16px 24px rgba(92,75,190,.2))}
        .xw-home-avatar{width:132px;height:132px;object-fit:contain;display:block}
        .xw-home-greet{font-size:24px;font-weight:1000;line-height:1.2;color:#1a1b49;letter-spacing:0}
        .xw-home-hello{display:flex;align-items:center;gap:8px;width:max-content;max-width:100%;margin-bottom:8px;color:#151842;font-size:24px;font-weight:1000;letter-spacing:0;animation:xwHomeHelloIn .38s .58s cubic-bezier(.2,.9,.22,1) both}
        .xw-home-hello-star{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,.78);color:#7c4dff;font-size:19px;filter:drop-shadow(0 7px 12px rgba(92,75,190,.16));animation:xwHomeStarPop .48s .74s cubic-bezier(.18,.92,.2,1) both,xwHomeStarTwinkle 1.8s 1.35s ease-in-out infinite}
        .xw-home-greet strong{display:block;color:#4f46e5;font-size:27px;margin-top:0;white-space:normal;max-width:100%;clip-path:inset(0 100% 0 0);animation:xwHomeTitleReveal .9s .86s steps(13,end) both}
        .xw-home-card{border:1px solid rgba(255,255,255,.86);background:rgba(255,255,255,.54);box-shadow:0 18px 38px rgba(70,73,132,.08);border-radius:30px;padding:11px 10px;margin:0 0 18px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
        .xw-home-card-title{display:flex;align-items:center;gap:10px;font-size:21px;font-weight:1000;margin-bottom:16px}
        .xw-home-card-title::before{content:"";width:7px;height:28px;border-radius:999px;background:linear-gradient(180deg,#7c5cff,#6f8cff)}
        .xw-home-card-title-text{flex:1}
        .xw-home-list{display:flex;flex-direction:column;gap:14px}
        .xw-home-question{width:100%;min-height:68px;border:0;border-radius:22px;background:rgba(255,255,255,.94);display:grid;grid-template-columns:38px 1fr 26px;align-items:center;gap:12px;padding:0 15px;text-align:left;color:#11143b;box-shadow:0 8px 18px rgba(72,75,132,.06);font-size:16px;font-weight:900;white-space:nowrap;overflow:hidden}
        .xw-home-question b{width:38px;height:38px;background:transparent;color:#7C34E8;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:none}
        .xw-home-question .ms{font-family:'Material Symbols Rounded';font-size:22px;color:#b8bfd9;flex-shrink:0}.xw-home-question span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .xw-home-answer-list{display:flex;flex-direction:column;gap:12px;margin-top:16px}
        .xw-home-msg{max-width:86%;border-radius:20px;padding:15px 17px;font-size:14.5px;font-weight:520;line-height:1.86;white-space:pre-wrap;word-break:break-word;position:relative}
        .xw-home-msg.ai{max-width:calc(86% + 10px);align-self:flex-start;background:rgba(255,255,255,.9);border:1px solid rgba(122,103,238,.1);box-shadow:0 8px 18px rgba(72,75,132,.06);padding:9px 9px}
        .xw-home-msg.user{align-self:flex-end;background:#601BEC;color:#fff;box-shadow:0 12px 24px rgba(96,27,236,.22)}
        .xw-msg-link{color:#5e17eb;font-weight:950;text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:3px;cursor:pointer}
        .xw-msg-link:hover{color:#7c34e8}
        .xw-msg-flow{display:block;white-space:normal}
        .xw-msg-block{display:block}
        .xw-msg-block + .xw-msg-block{margin-top:14px}
        .xw-msg-line{display:block;line-height:1.86}
        .xw-msg-line.numbered{margin-top:0}
        .xw-msg-block .xw-msg-line:first-child{margin-top:0}
        .xw-home-thinking{align-self:flex-start;display:flex;align-items:center;max-width:92%;border-radius:20px;padding:14px 16px;background:rgba(255,255,255,.9);border:1px solid rgba(122,103,238,.1);box-shadow:0 8px 18px rgba(72,75,132,.06)}
        .xw-home-thinking .xw-thinking-dots{padding:0;min-height:28px}
        .xw-thinking-dots{display:flex;align-items:center;gap:4px;padding:8px 12px;border-radius:20px;background:transparent;width:fit-content;min-height:48px}
        .xw-thinking-dots .dot{width:8px;height:8px;border-radius:50%;background:#a78bfa;animation:thinkingDot 1.4s ease-in-out infinite}
        .xw-thinking-dots .dot:nth-child(2){animation-delay:.2s}
        .xw-thinking-dots .dot:nth-child(3){animation-delay:.4s}
        .xw-thinking-label{font-size:12px;color:#a78bfa;font-weight:600;margin-left:6px;animation:thinkingLabelPulse 2s ease-in-out infinite}
        .xw-home-history-chat{display:flex;flex-direction:column;gap:12px;padding-top:14px}
        .xw-home-history-chat .xw-home-msg{max-width:86%}
        .xw-home-history-chat .xw-home-msg.ai{max-width:calc(86% + 10px)}
        .xw-home-optional{display:flex;align-items:center;justify-content:center;gap:8px;color:#7d86a5;font-size:13px;font-weight:850;margin:0 0 18px;padding:0 2px;text-align:center}
        .xw-home-optional button{min-height:32px;border:0;border-radius:0;background:transparent;box-shadow:none;color:#5b48ff;font-weight:950;padding:0 2px}
        .xw-home-bottom-dock{position:fixed;left:0;right:0;bottom:-36px;height:calc(115px + env(safe-area-inset-bottom));z-index:8062;background:#e8ecff;box-shadow:0 -18px 58px rgba(122,144,255,.1);overflow:visible;pointer-events:none;transform:translateZ(0)}
        .xw-home-bottom-dock::before{content:"";position:absolute;left:0;right:0;top:-30px;height:30px;background:linear-gradient(180deg,rgba(232,236,255,0) 0%,rgba(232,236,255,.05) 18%,rgba(232,236,255,.16) 36%,rgba(232,236,255,.34) 54%,rgba(232,236,255,.62) 74%,#e8ecff 100%);pointer-events:none}
        .xw-home-inputbar:focus-within~.xw-home-bottom-dock, .xw-home-bottom-dock:has(+ .xw-home-inputbar:focus-within){height:calc(115px + env(safe-area-inset-bottom))}
        .xw-home-bottom-dock.menu-open{bottom:-42px;height:calc(253px + env(safe-area-inset-bottom));z-index:8062;background:#e8ecff;box-shadow:0 -22px 64px rgba(122,144,255,.1)}
        .xw-home-bottom-dock.menu-open::before{top:-30px;height:30px;background:linear-gradient(180deg,rgba(232,236,255,0) 0%,rgba(232,236,255,.05) 18%,rgba(232,236,255,.16) 36%,rgba(232,236,255,.34) 54%,rgba(232,236,255,.62) 74%,#e8ecff 100%)}
        .xw-home-inputbar{position:fixed;left:30px;right:30px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:8063;display:flex;align-items:center;gap:10px;transition:bottom .2s cubic-bezier(.2,.9,.22,1);isolation:isolate}
        .xw-home-inputbar>*{position:relative;z-index:1}
        .xw-home-inputbar.menu-open{bottom:calc(150px + env(safe-area-inset-bottom));z-index:8065}
        .xw-home-inputbar.menu-open::before{content:"";position:absolute;left:-24px;right:-24px;top:0;height:70px;z-index:-1;border-radius:999px;background:radial-gradient(ellipse at center,rgba(91,72,255,.3) 0%,rgba(148,163,255,.2) 46%,rgba(232,236,255,0) 82%);filter:blur(22px);pointer-events:none}
        .xw-home-browser-backdrop{position:fixed;inset:0;z-index:8066;background:rgba(18,22,52,.26);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:xwBrowserIn .18s ease-out both}
        .xw-home-browser{position:fixed;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top));bottom:calc(10px + env(safe-area-inset-bottom));z-index:8067;border-radius:28px;background:#fff;box-shadow:0 28px 70px rgba(26,28,82,.28);overflow:hidden;display:flex;flex-direction:column;animation:xwBrowserIn .2s cubic-bezier(.2,.9,.22,1) both}
        .xw-home-browser-head{height:52px;flex:0 0 52px;display:grid;grid-template-columns:56px 1fr 56px;align-items:center;border-bottom:1px solid rgba(15,23,42,.08);background:rgba(255,255,255,.96);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
        .xw-home-browser-close{width:40px;height:40px;margin-left:8px;border:0;border-radius:999px;background:#f3f4fb;color:#11143b;font-family:'Material Symbols Rounded';font-size:22px;display:flex;align-items:center;justify-content:center}
        .xw-home-browser-title{text-align:center;color:#11143b;font-size:15px;font-weight:950;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .xw-home-browser-mark{width:28px;height:28px;margin-right:14px;justify-self:end;object-fit:contain}
        .xw-home-browser iframe{width:100%;height:100%;border:0;display:block;background:#fff;flex:1}
        @keyframes xwBrowserIn{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}
        .xw-home-plus{width:52px;height:52px;flex:0 0 52px;border:0;border-radius:999px;background:rgba(255,255,255,.94);color:#11143b;font-family:'Material Symbols Rounded';font-size:29px;line-height:1;box-shadow:0 10px 26px rgba(70,73,132,.1);display:flex;align-items:center;justify-content:center;padding:0}
        .xw-home-plus.on{background:#fff;color:#5b48ff;box-shadow:0 14px 30px rgba(91,72,255,.18)}
        .xw-home-input-shell{position:relative;flex:1;min-width:0;display:flex;align-items:center}
        .xw-home-input-shell.multiline{align-items:flex-end}
        .xw-home-input-shell.voice-active .xw-home-input{box-shadow:0 0 0 3px rgba(91,72,255,.14),0 12px 30px rgba(91,72,255,.18);transform:scale(1.012)}
        .xw-home-input{width:100%;height:58px;min-height:58px;max-height:104px;resize:none;border:0;border-radius:999px;background:rgba(255,255,255,.96);box-shadow:0 10px 26px rgba(70,73,132,.12);padding:0 56px 0 60px;color:#11143b;font-size:15px;font-weight:760;line-height:58px;outline:0;overflow:hidden;transition:box-shadow .18s ease,transform .18s ease}
        .xw-home-input-shell.multiline .xw-home-input{border-radius:28px;min-height:76px;max-height:132px;padding:15px 58px 15px 58px;line-height:1.42;overflow-y:auto;scrollbar-width:none}
        .xw-home-input-shell.multiline .xw-home-input::-webkit-scrollbar{display:none}
        .xw-home-inputbar.menu-open .xw-home-input{box-shadow:0 18px 38px rgba(70,73,132,.2),0 28px 58px rgba(91,72,255,.18)}
        .xw-home-inputbar.menu-open .xw-home-plus.on{box-shadow:0 20px 42px rgba(91,72,255,.24),0 28px 58px rgba(70,73,132,.16)}
        .xw-home-input::placeholder{color:#a6aec4}
        .xw-home-voice-cue{position:absolute;left:7px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:999px;background:#fff;color:#11143b;font-family:'Material Symbols Rounded';font-size:25px;line-height:1;box-shadow:0 5px 14px rgba(70,73,132,.08);display:flex;align-items:center;justify-content:center;padding:0;z-index:2}
        .xw-home-input-shell.multiline .xw-home-voice-cue{top:auto;bottom:7px;transform:none}
        .xw-home-voice-cue.listening{color:#fff;background:linear-gradient(135deg,#5b48ff,#7a45f4);animation:xwVoicePulse .8s ease-in-out infinite}
        .xw-home-voice-cue.arming{color:#5b48ff;background:#f2efff}
        @keyframes xwVoicePulse{0%,100%{transform:translateY(-50%) scale(1)}50%{transform:translateY(-50%) scale(1.08)}}
        .xw-home-send{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:46px;height:46px;border:0;border-radius:999px;background:linear-gradient(135deg,#5b48ff,#7a45f4);color:#fff;font-family:'Material Symbols Rounded';font-size:22px;line-height:1;box-shadow:0 8px 18px rgba(91,72,255,.25);display:flex;align-items:center;justify-content:center;padding:0}
        .xw-home-input-shell.multiline .xw-home-send{top:auto;bottom:6px;transform:none}
        .xw-home-send:disabled{opacity:.42}
        .xw-home-attachment{position:absolute;left:8px;right:8px;bottom:66px;display:flex;align-items:center;gap:8px;min-height:42px;border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 10px 24px rgba(70,73,132,.12);padding:6px 10px;color:#6b7280;font-size:12px;font-weight:800}
        .xw-home-attachment img{width:30px;height:30px;border-radius:10px;object-fit:cover}
        .xw-home-attachment-file{width:30px;height:30px;border-radius:10px;background:#f1efff;color:#1b1464;font-family:'Material Symbols Rounded';font-size:19px;display:flex;align-items:center;justify-content:center}
        .xw-home-attachment button{margin-left:auto;border:0;background:transparent;color:#94a3b8;font-family:'Material Symbols Rounded';font-size:18px}
        .xw-home-attach-menu{position:fixed;left:30px;right:30px;bottom:calc(24px + env(safe-area-inset-bottom));z-index:8064;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;isolation:isolate;animation:xwAttachIn .18s cubic-bezier(.2,.9,.22,1) both}
        .xw-home-attach-menu::before{content:"";position:fixed;left:0;right:0;bottom:-42px;height:calc(192px + env(safe-area-inset-bottom));z-index:-2;background:linear-gradient(180deg,rgba(232,236,255,.78) 0%,rgba(232,236,255,.94) 16%,#e8ecff 34%,#e8ecff 100%);pointer-events:none}
        .xw-home-attach-menu::after{content:"";position:absolute;left:-18px;right:-18px;top:-42px;bottom:-20px;z-index:0;border-radius:32px;background:radial-gradient(ellipse at center,rgba(91,72,255,.2) 0%,rgba(148,163,255,.18) 42%,rgba(232,236,255,0) 78%);filter:blur(18px);pointer-events:none}
        .xw-home-attach-action{position:relative;z-index:1;border:0;background:transparent;color:#11143b;font-size:13px;font-weight:850;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;white-space:nowrap}
        .xw-home-attach-action .ms{width:62px;height:62px;border-radius:22px;background:rgba(255,255,255,.92);box-shadow:0 10px 24px rgba(70,73,132,.1);font-family:'Material Symbols Rounded';font-size:30px;color:#10085f;display:flex;align-items:center;justify-content:center}
        @keyframes xwAttachIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @media (min-width:769px){.xw-home{--xw-home-x:-50%;left:50%;right:auto;width:min(430px,100vw)}.xw-home-inputbar{left:calc(50% - min(430px,100vw)/2 + 24px);right:calc(50% - min(430px,100vw)/2 + 24px)}.xw-home-attach-menu{left:calc(50% - min(430px,100vw)/2 + 24px);right:calc(50% - min(430px,100vw)/2 + 24px)}}
        @media (max-width:380px){.xw-home-scroll{padding-left:11px;padding-right:11px}.xw-home-hero{grid-template-columns:112px 1fr}.xw-home-avatar-wrap,.xw-home-avatar{width:112px;height:112px}.xw-home-greet{font-size:24px}.xw-home-hello{font-size:24px;margin-bottom:7px}.xw-home-hello-star{width:25px;height:25px;font-size:17px}.xw-home-greet strong{font-size:27px}.xw-home-inputbar{left:22px;right:22px}.xw-home-attach-menu{left:22px;right:22px;gap:12px}.xw-home-attach-action .ms{width:58px;height:58px}}
        @media (prefers-reduced-motion:reduce){.xw-home,.xw-home::before,.xw-home::after,.xw-home-top,.xw-home-scroll,.xw-home-inputbar,.xw-home-hello,.xw-home-hello-star,.xw-home-greet strong{animation:none!important;opacity:1!important;filter:none!important;clip-path:none!important}.xw-home{transform:translateX(var(--xw-home-x))!important}.xw-home-top,.xw-home-scroll,.xw-home-inputbar{transform:none!important}}
        /* ── 分享按钮 ── */
        .xw-share-btn{display:flex;align-items:center;justify-content:center;margin-top:2px;width:32px;height:32px;min-width:32px;min-height:32px;padding:0;border-radius:50%;border:none;background:#f3f0ff;color:#7C34E8;font-size:14px;cursor:pointer;opacity:0;pointer-events:none;transform:scale(.88);transition:opacity .15s,transform .15s,background .15s,color .15s;box-shadow:0 1px 4px rgba(124,52,232,0.1);overflow:hidden;flex-shrink:0;line-height:1}
        .xw-home-msg.ai:hover + .xw-share-btn,.xw-home-msg.ai:focus-within + .xw-share-btn,.aip-msg.ai:hover + .xw-share-btn,.aip-msg.ai:focus-within + .xw-share-btn,.xw-share-btn.xw-share-visible,.xw-share-btn:hover,.xw-share-btn:focus-visible{opacity:1;pointer-events:auto;transform:scale(1)}
        .xw-share-btn:hover,.xw-share-btn:focus-visible{background:#7C34E8;color:#fff}
        /* ── 分享浮动菜单（三按钮） ── */
        .xw-share-menu-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9400}
        .xw-share-menu{position:fixed;z-index:9500;display:flex;gap:10px;animation:xwShareIn .2s ease}
        .xw-share-ch-btn{width:44px;height:44px;border-radius:50%;border:none;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.08);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;font-family:'Material Symbols Rounded';color:#4b5563;transition:background .15s,color .15s}
        .xw-share-ch-btn:hover:not(:disabled){background:#f3e8ff;color:#7C34E8}
        .xw-share-ch-btn:disabled{opacity:0.4;cursor:not-allowed}
        /* ── 分享选择模式 ── */
        .xw-share-select-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;z-index:8049;background:transparent;pointer-events:auto;touch-action:none}
        .xw-share-select-bar{position:fixed;bottom:0;left:0;right:0;z-index:9500;background:#fff;border-radius:24px 24px 0 0;padding:16px 20px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -4px 24px rgba(0,0,0,0.1);animation:xwSlideUp .25s ease;max-height:55vh;overflow-y:auto}
        .xw-share-select-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        .xw-share-cancel-btn{border:none;background:transparent;color:#7C34E8;font-size:15px;font-weight:600;cursor:pointer;padding:4px 12px}
        .xw-share-select-header span{font-size:17px;font-weight:600;color:#1e293b}
        .xw-share-select-channels{display:flex;flex-direction:column;gap:12px}
        .xw-share-count{font-size:13px;color:#6b7280}
        .xw-share-channel-btns{display:flex;gap:12px;overflow-x:auto;padding-bottom:4px}
        .xw-share-channel{display:flex;flex-direction:column;align-items:center;gap:10px;min-width:90px;border:none;background:none;cursor:pointer;padding:16px 12px;border-radius:16px;transition:background .15s,transform .15s;flex-shrink:0}
        .xw-share-channel:hover:not(:disabled){background:#f5f3ff;transform:translateY(-2px)}
        .xw-share-channel:disabled{opacity:0.35}
        .xw-share-ch-icon{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background .15s,box-shadow .15s,transform .15s}
        .xw-share-ch-icon img{display:block;width:30px;height:30px}
        .xw-share-channel:first-child .xw-share-ch-icon,.xw-share-channel:nth-child(2) .xw-share-ch-icon,.xw-share-channel:nth-child(3) .xw-share-ch-icon{background:linear-gradient(180deg,#fbf9ff 0%,#f0eaff 100%);color:#7C34E8;box-shadow:0 3px 8px rgba(124,52,232,0.08)}
        .xw-share-channel:hover:not(:disabled) .xw-share-ch-icon{box-shadow:0 5px 12px rgba(124,52,232,0.12);transform:scale(.98)}
        .wechat-icon{background:#07C160}
        .image-icon{background:#8B5CF6}
        .link-icon{background:#3B82F6}
        .xw-share-channel span:last-child{font-size:12px;color:#4b5563;white-space:nowrap;margin-top:2px}
        .xw-share-privacy{text-align:center;font-size:11px;color:#9ca3af;margin-top:8px}
        /* 勾选框 */
        .share-selecting{position:relative}
        .share-selecting.xw-home-msg,.share-selecting.aip-msg{border:2px solid transparent;border-radius:16px;transition:border-color .15s}
        .share-selecting.xw-home-msg.msg-selected,.share-selecting.aip-msg.msg-selected{border-color:#7C34E8}
        .xw-home-scroll.share-mode{padding-bottom:0;flex:none;height:auto;max-height:calc(100vh - 220px);overflow-y:auto}
        .aip-msgs.share-mode{padding-bottom:0;flex:none;height:auto;max-height:calc(100vh - 220px);overflow-y:auto}
        .share-selecting .xw-share-check-btn{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;border:2px solid #d1d5db;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-family:'Material Symbols Rounded';color:#fff;z-index:10;transition:border-color .15s,background .15s}
        .share-selecting .xw-share-check-btn.checked{border-color:#7C34E8;background:#7C34E8}
        @keyframes xwSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        /* ── 分享卡片预览 ── */
        .xw-share-card-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9600;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;animation:xwShareIn .2s ease}
        .xw-share-card-dialog{background:#fff;border-radius:20px;max-width:90vw;max-height:85vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2)}
        .xw-share-card-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #f1f3fa;color:#1e293b;font-size:16px;font-weight:600}
        .xw-share-card-close{border:none;background:transparent;color:#6b7280;font-size:22px;cursor:pointer;font-family:'Material Symbols Rounded'}
        .xw-share-card-body{overflow-y:auto;max-height:85vh;padding:16px 20px;display:block}
        .xw-share-card-img{max-width:100%;width:100%;height:auto;display:block;border-radius:12px}
        .xw-share-card-actions{padding:16px 20px;display:flex;justify-content:center}
        .xw-share-card-dl{display:inline-flex;align-items:center;justify-content:center;padding:12px 32px;border-radius:24px;background:#7C34E8;color:#fff;font-size:15px;font-weight:600;text-decoration:none;transition:background .15s}
        .xw-share-card-dl:hover{background:#5b21b6}
        /* ── Toast ── */
        .xw-share-toast{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;padding:12px 28px;border-radius:12px;background:rgba(0,0,0,0.75);color:#fff;font-size:14px;font-weight:500;pointer-events:none;animation:xwToast 2s ease forwards}
        @keyframes xwToast{0%{opacity:0;transform:translate(-50%,-50%) scale(0.9)}10%{opacity:1;transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0}}
      `}</style>
      <div className={`ai-panel-backdrop${open && maximized ? " show" : ""}`} onClick={() => setMaximized(false)} />
      {open && homeActive ? (
        <div key={`xw-home-${homePortalKey}`} className={`xw-home${skipHomeIntroOnMount ? " no-intro" : ""}${isDocked ? " docked" : ""}`} onClick={shareSelectionMode ? dismissShareSelectionBackdropEvent : undefined} onTouchStart={handleHomeSwipeStart} onTouchEnd={handleHomeSwipeEnd}>
          {renderHomeTop()}
          {homeHistoryDrawerOpen ? (
            <div className="xw-home-history-mask" onClick={() => setHomeHistoryDrawerOpen(false)}>
                <div className="xw-home-history-drawer" onClick={(event) => event.stopPropagation()}>
                <div className="xw-home-history-drawer-head">
                  <button className="xw-home-history-new" type="button" onClick={openManualNewConversation}>
                    <span className="ms">add</span>
                    <span>新对话</span>
                  </button>
                </div>
                <span className="xw-home-history-drawer-title">历史会话</span>
                <div className="xw-home-history-list">
                  {buildHistoryCards(messages).length ? (
                    buildHistoryCards(messages).map((card) => (
                      <button key={card.id} className="aip-history-card" type="button" onClick={() => openHistoryCard(card)}>
                        <div className="aip-history-card-title">{card.title}</div>
                        <div className="aip-history-card-sub">{card.sub}</div>
                        {card.childTag ? <div className="aip-history-card-tag">{card.childTag}</div> : null}
                      </button>
                    ))
                  ) : (
                    <div className="aip-history-empty">暂无历史存档</div>
                  )}
                </div>
                <button
                  className="xw-home-history-exit xw-home-history-exit-dock"
                  type="button"
                  aria-label="退出小玩子超能模式"
                  onClick={(event) => {
                    event.stopPropagation();
                    closePanel();
                  }}
                >
                  logout
                </button>
              </div>
            </div>
          ) : null}
          <div className={`xw-home-scroll${shareSelectionMode ? " share-mode" : ""}`} ref={msgContainerRef} onClick={(e) => shareSelectionMode && e.stopPropagation()}>
            {homeViewingHistory ? (
              <div className="xw-home-history-chat">
                {visibleMessages.filter((message) => !isReadReceiptMessage(message.content)).map((message, idx) => {
                  if (message.content === "__THINKING__") {
                    return (
                      <div key={`history-${MESSAGE_LAYOUT_VERSION}-${idx}-${message.ts || ""}`} className="xw-home-thinking">
                        {renderDisplayMessage(message, xiaowanziMentionLinks, openXiaowanziMentionLink)}
                      </div>
                    );
                  }
                  return (
                    <React.Fragment key={`history-${MESSAGE_LAYOUT_VERSION}-${idx}-${message.ts || ""}`}>
                    <div className={`xw-home-msg ${message.role === "assistant" ? "ai" : "user"}${shareSelectionMode ? ` share-selecting${selectedMessagesForShare.has(message.ts || "") ? " msg-selected" : ""}` : ""}`}
                    onMouseEnter={() => revealShareButtonForMessage(message)}
                    onFocus={() => revealShareButtonForMessage(message)}
                    onClick={() => shareSelectionMode ? toggleSelectMsg(message.ts || "") : revealShareButtonForMessage(message)}>
                    {shareSelectionMode && (
                      <button className={`xw-share-check-btn ${selectedMessagesForShare.has(message.ts || "") ? "checked" : ""}`}
                        type="button" onClick={(e) => { e.stopPropagation(); toggleSelectMsg(message.ts || ""); }}>
                        {selectedMessagesForShare.has(message.ts || "") ? "check" : ""}
                      </button>
                    )}
                    {renderDisplayMessage(message, xiaowanziMentionLinks, openXiaowanziMentionLink)}
                  </div>
                  {isShareableAssistantMessage(message) && !isReplying ? (
                    <button className={`xw-share-btn ${shareRevealMessageId === (message.ts || "") ? "xw-share-visible" : ""}`.trim()} type="button" aria-label="分享回答" onFocus={() => revealShareButtonForMessage(message)} onClick={(e) => toggleShareMenu(e, message.ts || "")}><span className="ms">share</span></button>
                  ) : null}
                  </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="xw-home-hero">
                  <div className="xw-home-avatar-wrap" aria-hidden="true">
                    <img className="xw-home-avatar" src="/assets/wel-avatar/optimized/no-hat.webp" alt="" draggable={false} loading="eager" decoding="async" />
                  </div>
                  <div className="xw-home-greet">
                    <div className="xw-home-hello">哈喽 <span className="xw-home-hello-star" aria-hidden="true">✦</span></div>
                    <strong>想聊什么，直接问小玩子</strong>
                  </div>
                </div>
                <div className="xw-home-card">
                  <div className="xw-home-card-title">
                    <span className="xw-home-card-title-text">可以这样问</span>
                  </div>
                  <div className="xw-home-list">
                    {effectiveHomePrompts.map((item) => (
                      <button key={item.prompt} className="xw-home-question" type="button" onClick={() => {
                        // 查找是否已有匹配的对话
                        const msgIndex = visibleMessages.findIndex(
                          (m) => m.role === "user" && m.content.trim() === item.prompt.trim()
                        );
                        if (msgIndex >= 0) {
                          // 已存在 → 滚动到对应回答位置
                          const target = msgContainerRef.current?.querySelector(`[data-msg-index="${msgIndex}"]`) as HTMLElement | null;
                          if (target) {
                            target.scrollIntoView({ behavior: "smooth", block: "center" });
                            // 高亮一下
                            target.style.transition = "box-shadow 0.6s";
                            target.style.boxShadow = "0 0 0 3px rgba(124,52,232,0.3), 0 4px 16px rgba(124,52,232,0.2)";
                            setTimeout(() => {
                              target.style.boxShadow = "";
                              target.style.transition = "";
                            }, 1500);
                          }
                        } else {
                          // 不存在 → 发送问题
                          void sendMessage(item.prompt);
                        }
                      }}>
                        <b>#</b>
                        <span>{item.label}</span>
                        <span className="ms">arrow_forward</span>
                      </button>
                    ))}
                  </div>
                  {homeAnswerMessages.length ? (
                    <div className="xw-home-answer-list" onClick={(e) => shareSelectionMode && e.stopPropagation()}>
                      {homeAnswerMessages.map((message, idx) => {
                        if (message.content === "__THINKING__") {
                          return (
                            <div key={`home-${MESSAGE_LAYOUT_VERSION}-${idx}-${message.ts || ""}`} className="xw-home-thinking">
                              {renderDisplayMessage(message, xiaowanziMentionLinks, openXiaowanziMentionLink)}
                            </div>
                          );
                        }
                        return (
                          <React.Fragment key={`home-${MESSAGE_LAYOUT_VERSION}-${idx}-${message.ts || ""}`}>
                          <div className={`xw-home-msg ${message.role === "assistant" ? "ai" : "user"}${shareSelectionMode ? ` share-selecting${selectedMessagesForShare.has(message.ts || "") ? " msg-selected" : ""}` : ""}`}
                          onMouseEnter={() => revealShareButtonForMessage(message)}
                          onFocus={() => revealShareButtonForMessage(message)}
                          onClick={() => shareSelectionMode ? toggleSelectMsg(message.ts || "") : revealShareButtonForMessage(message)}>
                          {shareSelectionMode && (
                            <button className={`xw-share-check-btn ${selectedMessagesForShare.has(message.ts || "") ? "checked" : ""}`}
                              type="button" onClick={(e) => { e.stopPropagation(); toggleSelectMsg(message.ts || ""); }}>
                              {selectedMessagesForShare.has(message.ts || "") ? "check" : ""}
                            </button>
                          )}
                          {renderDisplayMessage(message, xiaowanziMentionLinks, openXiaowanziMentionLink)}
                        </div>
                        {isShareableAssistantMessage(message) && !isReplying ? (
                          <button className={`xw-share-btn ${shareRevealMessageId === (message.ts || "") ? "xw-share-visible" : ""}`.trim()} type="button" aria-label="分享回答" onFocus={() => revealShareButtonForMessage(message)} onClick={(e) => toggleShareMenu(e, message.ts || "")}><span className="ms">share</span></button>
                        ) : null}
                        </React.Fragment>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="xw-home-optional">
                  <span>{isChildBound && activeChild ? `已关联 ${activeChild.displayName} 档案，可获得更贴合的建议` : "可选：关联孩子档案后，回答会更个性化"}</span>
                  <button type="button" onClick={openHiddenEntry}>{isChildBound ? "切换" : "关联"}</button>
                </div>
              </>
            )}
          </div>
          <div className={`xw-home-inputbar${attachmentMenuOpen ? " menu-open" : ""}`} ref={homeInputbarRef}>
            <div className={`xw-home-input-shell${homeComposerExpanded ? " multiline" : ""}${voiceListening || voiceHolding ? " voice-active" : ""}`}>
              {uploadedImage ? (
                <div className="xw-home-attachment">
                  {uploadedImage.kind === "file" ? <span className="xw-home-attachment-file">description</span> : <img src={uploadedImage.dataUrl} alt="已上传图片" />}
                  <span>{uploadedImage.name}</span>
                  <button type="button" aria-label="移除图片" onClick={() => setUploadedImage(null)}>close</button>
                </div>
              ) : null}
              <button
                className={`xw-home-voice-cue${voiceListening ? " listening" : voiceHolding ? " arming" : ""}`}
                type="button"
                aria-label="长按输入框语音输入"
                onClick={toggleVoiceInput}
              >
                {voiceListening ? "graphic_eq" : "record_voice_over"}
              </button>
              <textarea
                ref={inputRef}
                className="xw-home-input"
                rows={1}
                placeholder={voiceListening ? "正在听你说..." : "对话内容已开启隐私保护"}
                value={input}
                onChange={onInputChange}
                onKeyDown={onInputKeyDown}
                onPointerDown={startInputVoicePress}
                onPointerUp={endInputVoicePress}
                onPointerCancel={endInputVoicePress}
                onPointerLeave={endInputVoicePress}
                  />
                  <button className="xw-home-send" type="button" onClick={() => sending ? stopXiaowanziResponse() : void sendMessage()} disabled={!sending && !input.trim() && !uploadedImage}>
                    {sending ? "stop" : "send"}
                  </button>
            </div>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onImagePicked} />
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onImagePicked} />
            <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={onFilePicked} />
            <button className={`xw-home-plus${attachmentMenuOpen ? " on" : ""}`} type="button" aria-label="添加附件" onClick={() => { if (shouldBlockXiaowanziForAuth()) return; setAttachmentMenuOpen((value) => !value); }}>
              {attachmentMenuOpen ? "close" : "add"}
            </button>
          </div>
          <div className={`xw-home-bottom-dock${attachmentMenuOpen ? " menu-open" : ""}`} aria-hidden="true" />
          {attachmentMenuOpen ? (
            <div className="xw-home-attach-menu" ref={homeAttachMenuRef}>
              <button className="xw-home-attach-action" type="button" onClick={() => { if (shouldBlockXiaowanziForAuth()) return; cameraInputRef.current?.click(); }}>
                <span className="ms">photo_camera</span>
                <span>拍照</span>
              </button>
              <button className="xw-home-attach-action" type="button" onClick={() => { if (shouldBlockXiaowanziForAuth()) return; imageInputRef.current?.click(); }}>
                <span className="ms">image</span>
                <span>上传图片</span>
              </button>
              <button className="xw-home-attach-action" type="button" onClick={() => { if (shouldBlockXiaowanziForAuth()) return; fileInputRef.current?.click(); }}>
                <span className="ms">upload_file</span>
                <span>上传文件</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : open ? (
        <div
          id="ai-panel"
          className={`${maximized ? "max" : ""}${!maximized && pinned ? " docked" : ""}${isDocked && dockedDark ? " docked-dark" : ""}`.trim()}
          style={getFloatingPanelStyle()}
        >
          <div className="aip-head">
            <div className="aip-gem">
              <div className={`ai-avatar-wrapper ${avatarFxClassName}`.trim()}>
                <img id="ai-panel-avatar-img" src={displayAvatar} alt="" draggable={false} loading="eager" decoding="async" onError={onAvatarError} />
                <div className="ai-avatar-particles" aria-hidden="true">
                  {avatarParticles.map((particle) => (
                    <span
                      key={`panel-${particle.id}`}
                      className="ai-avatar-particle"
                      style={
                        {
                          left: `${particle.x}%`,
                          top: `${particle.y}%`,
                          width: `${particle.size}px`,
                          height: `${particle.size}px`,
                          animationDelay: `${particle.delay}ms`,
                          "--dx": `${particle.dx}px`,
                          "--dy": `${particle.dy}px`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="aip-title">小玩子</div>
              <div className="aip-status">{statusText}</div>
            </div>
            <button
              className={`aip-icon-btn aip-pin${pinned ? " on" : ""}`}
              type="button"
              title={pinned ? "弹出对话框" : "固定到侧边栏"}
              aria-label={pinned ? "弹出对话框" : "固定到侧边栏"}
              onClick={() => {
                if (maximized) {
                  setMaximized(false);
                }
                setPinned((value) => !value);
              }}
            >
              {pinned ? "dock_to_right" : "dock_to_right"}
            </button>
            {isDocked ? (
              <button
                className="aip-icon-btn aip-theme"
                type="button"
                title={dockedDark ? "切换亮色" : "切换深色"}
                aria-label={dockedDark ? "切换亮色" : "切换深色"}
                onClick={() => setDockedDark((v) => !v)}
              >
                {dockedDark ? "light_mode" : "dark_mode"}
              </button>
            ) : null}
            <button className="aip-icon-btn aip-enlarge" type="button" onClick={() => setMaximized((value) => !value)}>
              {maximized ? "close_fullscreen" : "open_in_full"}
            </button>
            <button
              className="aip-icon-btn aip-close"
              type="button"
              onClick={() => {
                setOpen(false);
                if (isDocked) setPinned(false);
              }}
            >
              close
            </button>
          </div>
          <div className="aip-child-row">
            <span className="aip-child-chip">{isChildBound && activeChild ? `为 ${activeChild.displayName} 咨询` : "未绑定孩子档案"}</span>
            {canSwitchChild ? (
              <button className="aip-child-switch" type="button" onClick={openHiddenEntry}>
                {isChildBound ? "切换" : "去绑定"}
              </button>
            ) : (
              <span className="aip-child-state">已绑定</span>
            )}
          </div>
          <div className={`aip-msgs${shareSelectionMode ? " share-mode" : ""}`} ref={msgContainerRef} onClick={(e) => shareSelectionMode && e.stopPropagation()}>
            {visibleMessages.map((message, idx) => {
              if (message.content === "__THINKING__") {
                return (
                  <div
                    key={`${idx}-${message.ts || ""}`}
                    className="xw-thinking-row"
                    ref={idx === visibleMessages.length - 1 ? latestMsgRef : null}
                  >
                    <span className="xw-tdot" />
                    <span className="xw-tdot" />
                    <span className="xw-tdot" />
                    <span className="xw-tlabel">小玩子思考中</span>
                  </div>
                );
              }
              return (
                <React.Fragment key={`${MESSAGE_LAYOUT_VERSION}-${idx}-${message.ts || ""}`}>
                  <div
                  className={`aip-msg ${message.role === "assistant" ? "ai" : "user"}${shareSelectionMode ? ` share-selecting${selectedMessagesForShare.has(message.ts || "") ? " msg-selected" : ""}` : ""}`}
                  onMouseEnter={() => revealShareButtonForMessage(message)}
                  onFocus={() => revealShareButtonForMessage(message)}
                  onClick={() => shareSelectionMode ? toggleSelectMsg(message.ts || "") : revealShareButtonForMessage(message)}
                  ref={idx === visibleMessages.length - 1 ? latestMsgRef : null}
                  data-msg-index={idx}
                >
                  {shareSelectionMode && (
                    <button className={`xw-share-check-btn ${selectedMessagesForShare.has(message.ts || "") ? "checked" : ""}`}
                      type="button" onClick={(e) => { e.stopPropagation(); toggleSelectMsg(message.ts || ""); }}>
                      {selectedMessagesForShare.has(message.ts || "") ? "check" : ""}
                    </button>
                  )}
                  {renderDisplayMessage(message, xiaowanziMentionLinks, openXiaowanziMentionLink)}
                  {message.role === "assistant" && isChildBound && activeChild ? (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
                      根据{activeChild.displayName}档案进行个性化回复
                    </div>
                  ) : null}
                </div>
                {isShareableAssistantMessage(message) && !isReplying ? (
                  <button className={`xw-share-btn ${shareRevealMessageId === (message.ts || "") ? "xw-share-visible" : ""}`.trim()} type="button" aria-label="分享回答" onFocus={() => revealShareButtonForMessage(message)} onClick={(e) => toggleShareMenu(e, message.ts || "")}><span className="ms">share</span></button>
                ) : null}
                </React.Fragment>
              );
            })}
            {isDockedEmpty ? (
              <div className="aip-empty">
                <div className="aip-empty-title">{currentUserName ? `${currentUserName},你好` : "你好"}</div>
                <div className="aip-empty-sub">今天需要我做些什么?</div>
                <div className="aip-empty-suggests">
                  {(isChildBound ? childShortcutItems : shortcutItems).slice(0, 3).map((item) => (
                    <button key={`empty-${item.label}`} className="aip-empty-btn" type="button" onClick={() => void sendMessage(item.prompt)}>
                      {item.prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {!isDockedEmpty ? (
            <div className="aip-shortcuts">
              <div className="aip-shortcuts-list">
                {(isChildBound ? childShortcutItems : shortcutItems).map((item) => (
                  <button key={item.label} className="aip-sc" type="button" onClick={() => void sendMessage(item.prompt)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="aip-shortcuts-actions">
                <button className="aip-temp-history-btn" type="button" onClick={() => void onHistoryClick()}>历史会话</button>
              </div>
            </div>
          ) : null}
          {historyPanelOpen ? (
            <div className="aip-history-panel">
              <div className="aip-history-head">
                <span>历史会话</span>
                <button className="aip-history-close" type="button" onClick={() => setHistoryPanelOpen(false)}>close</button>
              </div>
              <div className="aip-history-list">
                {buildHistoryCards(messages).length ? (
                  buildHistoryCards(messages).map((card) => (
                    <button key={card.id} className="aip-history-card" type="button" onClick={() => openHistoryCard(card)}>
                      <div className="aip-history-card-title">{card.title}</div>
                      <div className="aip-history-card-sub">{card.sub}</div>
                      {card.childTag ? <div className="aip-history-card-tag">{card.childTag}</div> : null}
                    </button>
                  ))
                ) : (
                  <div className="aip-history-empty">暂无历史存档</div>
                )}
              </div>
            </div>
          ) : null}
          <div className="aip-input-row" ref={panelInputbarRef}>
            <div className="aip-input-wrap">
              {isDocked && shareVisible ? (
                <div className="aip-share">
                  <span>正在阅读"{getDockedShareLabel(pageContext.summary)}"页面上下文</span>
                  <button className="aip-share-close" type="button" aria-label="关闭共享提示" onClick={() => setShareVisible(false)}>close</button>
                </div>
              ) : null}
              <div className="aip-input-shell">
                <textarea
                  ref={inputRef}
                  className="aip-input"
                  rows={1}
                  placeholder={isChildBound ? "请描述孩子当前情况，我会基于档案给建议..." : "请先选择孩子档案后提问"}
                  value={input}
                  onChange={onInputChange}
                  onKeyDown={onInputKeyDown}
                />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onImagePicked} />
                <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onImagePicked} />
                <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={onFilePicked} />
                {attachmentMenuOpen ? (
                  <div className="aip-attach-menu" ref={panelAttachMenuRef}>
                    <button className="aip-attach-action" type="button" onClick={() => { if (shouldBlockXiaowanziForAuth()) return; cameraInputRef.current?.click(); }}>
                      <span className="ms">photo_camera</span>
                      <span>拍照</span>
                    </button>
                    <button className="aip-attach-action" type="button" onClick={() => { if (shouldBlockXiaowanziForAuth()) return; imageInputRef.current?.click(); }}>
                      <span className="ms">image</span>
                      <span>上传图片</span>
                    </button>
                    <button className="aip-attach-action" type="button" onClick={() => { if (shouldBlockXiaowanziForAuth()) return; fileInputRef.current?.click(); }}>
                      <span className="ms">upload_file</span>
                      <span>上传文件</span>
                    </button>
                  </div>
                ) : null}
                <button
                  className={`aip-plus${attachmentMenuOpen ? " on" : ""}`}
                  type="button"
	                  aria-label="添加"
	                  onClick={() => {
	                    if (shouldBlockXiaowanziForAuth()) return;
	                    if (childProfiles.length === 0) {
	                      setStatusText("● 请先去绑定孩子档案");
	                      openHiddenEntry();
	                      return;
	                    }
	                    setStatusText(
	                      childProfiles.length === 1 && activeChild
	                        ? `● 当前问题会围绕 ${activeChild.displayName} 回答`
	                        : "● 请使用上方“切换”选择咨询人",
	                    );
	                    setAttachmentMenuOpen((value) => !value);
	                  }}
	                >
                  {attachmentMenuOpen ? "close" : "add"}
                    </button>
                    <button className="aip-send" type="button" onClick={() => sending ? stopXiaowanziResponse() : void sendMessage()} disabled={!sending && !isChildBound}>
                      {sending ? "stop" : "send"}
                    </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {open && homeActive && homeBrowsingOpen && homeBrowseTarget ? (
        <>
          <div className="xw-home-browser-backdrop" />
          <div className="xw-home-browser" role="dialog" aria-label={`${homeBrowseTarget.label}浏览页`}>
            <div className="xw-home-browser-head">
              <button className="xw-home-browser-close" type="button" aria-label="关闭浏览页" onClick={() => setHomeBrowsingOpen(false)}>
                close
              </button>
              <div className="xw-home-browser-title">{homeBrowseTarget.label}</div>
              <img className="xw-home-browser-mark" src={displayAvatar} alt="" draggable={false} loading="eager" decoding="async" onError={onAvatarError} />
            </div>
            <iframe title={homeBrowseTarget.label} src={buildHomeBrowseSrc(homeBrowseTarget.path)} />
          </div>
        </>
      ) : null}
      {hiddenEntryOpen ? (
        <>
          <div className="aip-hidden-mask" onClick={() => setHiddenEntryOpen(false)} />
          <div className="aip-hidden-sheet">
            <div className="aip-sheet-title">选择咨询人</div>
            {childProfiles.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 10 }}>暂无孩子档案，请先从侧边栏新增。</div>
            ) : (
              childProfiles
                .slice()
                .sort((a, b) => (a.id === chatContext?.childProfileId ? -1 : b.id === chatContext?.childProfileId ? 1 : 0))
                .map((item) => (
                  <div key={item.id} className="aip-child-card">
                    <div className="aip-child-card-avatar">{item.displayName.slice(0, 1) || "孩"}</div>
                    <div className="aip-child-card-main">
                      <div className="aip-child-card-name">{item.displayName}</div>
                      <div className="aip-child-card-tag">{item.relation} · {item.grade || "未填年级"}</div>
                    </div>
                    <button
                      className="aip-child-card-btn"
                      type="button"
                      onClick={() => bindChildProfile(item)}
                    >
                      {item.id === chatContext?.childProfileId ? "已选择" : "选择"}
                    </button>
                  </div>
                ))
            )}
            <div className="aip-sheet-actions">
              <button className="aip-sheet-btn light" type="button" onClick={() => setHiddenEntryOpen(false)}>取消</button>
              <button className="aip-sheet-btn" type="button" onClick={openSidebarChildCreate}>新增孩子</button>
            </div>
          </div>
        </>
      ) : null}
      {!standalone && !hideLauncher ? (
        <button
          id="ai-fab"
          title="小玩子"
          onClick={onFabClick}
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          onPointerCancel={onFabPointerUp}
          style={{ left: fabPosition.left, top: fabPosition.top, right: "auto", bottom: "auto" }}
          type="button"
        >
          <div id="ai-avatar-wrapper" className={`ai-avatar-wrapper ${avatarFxClassName}`.trim()}>
            <img id="ai-avatar-img" src={displayAvatar} alt="" draggable={false} loading="eager" decoding="async" onError={onAvatarError} />
            <div id="ai-avatar-particles" className="ai-avatar-particles" aria-hidden="true">
              {avatarParticles.map((particle) => (
                <span
                  key={particle.id}
                  className="ai-avatar-particle"
                  style={
                    {
                      left: `${particle.x}%`,
                      top: `${particle.y}%`,
                      width: `${particle.size}px`,
                      height: `${particle.size}px`,
                      animationDelay: `${particle.delay}ms`,
                      "--dx": `${particle.dx}px`,
                      "--dy": `${particle.dy}px`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          </div>
        </button>
      ) : null}
      {/* ── 分享选择模式底部栏 ── */}
      {shareSelectionMode ? (
        <>
          <div className="xw-share-select-backdrop" onClick={dismissShareSelectionBackdropEvent} />
          <div className="xw-share-select-bar">
            <div className="xw-share-select-header">
              <span>选择对话</span>
              <button className="xw-share-cancel-btn" type="button" onClick={exitShareSelectionMode}>取消</button>
            </div>
            <div className="xw-share-select-channels">
              <span className="xw-share-count">将{selectedMessagesForShare.size > 0 ? Math.ceil(selectedMessagesForShare.size / 2) : 0}轮对话分享至</span>
              <div className="xw-share-channel-btns">
                <button className="xw-share-channel" type="button" onClick={() => setShareToastMsg("即将上线")}>
                  <span className="xw-share-ch-icon" aria-hidden="true"><img src="/assets/xiaowanzi-icons/share-wechat-friend.svg" alt="" draggable={false} /></span>
                  <span>微信好友</span>
                </button>
                <button className="xw-share-channel" type="button" disabled={shareGenerating || selectedMessagesForShare.size === 0} onClick={async () => {
                  if (selectedMessagesForShare.size === 0) return;
                  const sorted = visibleMessages.filter((m) => selectedMessagesForShare.has(m.ts || ""));
                  const firstUser = sorted.find((m) => m.role === "user");
                  await generateShareCard(firstUser ?? sorted[0], sorted);
                }}>
                  <span className="xw-share-ch-icon" aria-hidden="true"><img src="/assets/xiaowanzi-icons/share-image-card.svg" alt="" draggable={false} /></span>
                  <span>{shareGenerating ? "生成中..." : "生成图片"}</span>
                </button>
                <button className="xw-share-channel" type="button" disabled={selectedMessagesForShare.size === 0} onClick={() => {
                  const sorted = visibleMessages.filter((m) => selectedMessagesForShare.has(m.ts || ""));
                  const text = sorted.map((m) => `${m.role === "user" ? "👤" : "🤖"} ${m.content}`).join("\n\n");
                  navigator.clipboard.writeText(text).then(() => { setShareToastMsg("已复制到剪贴板"); setTimeout(() => setShareToastMsg(""), 2000); });
                }}>
                  <span className="xw-share-ch-icon" aria-hidden="true"><img src="/assets/xiaowanzi-icons/share-copy-content.svg" alt="" draggable={false} /></span>
                  <span>复制内容</span>
                </button>
              </div>
            </div>
            <div className="xw-share-privacy">⚙️ 分享内容已开启隐私保护</div>
          </div>
        </>
      ) : null}
      {/* ── 分享卡片预览弹窗 ── */}
      {shareCardUrl ? (
        <div className="xw-share-card-overlay" onClick={clearShareCardUrl}>
          <div className="xw-share-card-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="xw-share-card-head">
              <span>分享卡片预览</span>
              <button type="button" className="xw-share-card-close" onClick={clearShareCardUrl}>close</button>
            </div>
            <div className="xw-share-card-body">
              <img src={shareCardUrl} alt="分享卡片" className="xw-share-card-img" />
            </div>
            <div className="xw-share-card-actions">
              <a className="xw-share-card-dl" href={shareCardUrl} download="xiaowanzi-share.png">下载图片</a>
            </div>
          </div>
        </div>
      ) : null}
      {/* ── Toast ── */}
      {shareToastMsg ? <div className="xw-share-toast">{shareToastMsg}</div> : null}
      {/* ── 隐藏 Canvas ── */}
      <canvas ref={shareCanvasRef} style={{ display: "none" }} width={600} height={100} />
    </>
  );
};

export default XiaowanziWidget;
