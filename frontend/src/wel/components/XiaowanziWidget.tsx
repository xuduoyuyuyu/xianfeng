import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiUrl } from "../../lib/api";
import { Program, publicApi, PublicGuestDetail, PublicGuest } from "../../services/api";
import {
  advanceAvatarState,
  clampFabPosition,
  FAB_SIZE,
  getAvatarSrc,
  getDefaultFabPosition,
} from "./XiaowanziWidget.logic";

type Msg = { role: "user" | "assistant"; content: string; ts?: string };
type HistorySessionCard = { id: string; title: string; sub: string; targetIndex: number };
type ShortcutItem = { label: string; prompt: string };
type PageContextPayload = {
  summary: string;
  readReceipt: string;
  shortcuts: ShortcutItem[];
};

function normalizeShortcutPrompt(prompt: string): string {
  return String(prompt || "")
    .replace(/《[^》]+》/g, "")
    .replace(/基于[^，。；:：]*[，。；:：]\s*/g, "")
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
function isReadReceiptMessage(content: string): boolean {
  const text = String(content || "").trim();
  if (!text) return false;
  const hasReadPrefix =
    text.includes("我已读取") ||
    text.includes("已读取当前") ||
    text.includes("已进入当前页面") ||
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

function getAuthHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getSessionToken(): string {
  return (localStorage.getItem("token") || localStorage.getItem("wel_tok") || "").trim();
}

const DEFAULT_MESSAGE = { role: "assistant" as const, content: "你好，我是小玩子 ✨", ts: new Date().toISOString() };
const AVATAR_FADE_DURATION_MS = 300;
const AVATAR_EFFECT_DURATION_MS = 500;
const AVATAR_FALLBACK_SRC = "/assets/logo.png";
const LEGACY_AVATAR_INDEX_KEY = "wel_avatar_index";
const LEGACY_AVATAR_CLICK_COUNT_KEY = "wel_avatar_click_count";
const GLOBAL_HISTORY_CACHE_KEY = "xiaowanzi_global_history_v1";
const GLOBAL_DOCKED_PREF_KEY = "xiaowanzi_global_docked_v1";
const GLOBAL_DOCKED_THEME_KEY = "xiaowanzi_global_docked_theme_v1";
const PANEL_WIDTH = 360;
const DOCKED_WIDTH = 430;
const DOCKED_TOP_OFFSET = 0;
const PANEL_MAX_HEIGHT = 520;
const PANEL_GAP = 14;
const AI_RESPONSE_RULES = [
  "只基于当前页面已经明确展示或已确认读取到的信息回答。",
  "如果信息不足，直接明确说明“当前页面未显示这部分信息”，不要使用“可能、也许、大概、推测、估计”这类词。",
  "不要根据标题、常见风格或经验补全未展示的事实。",
  "优先给出确定内容、已确认事实、可执行下一步。",
  "语气要直接、确认、简洁，不绕弯。",
].join("\n");

function loadCachedGlobalHistory(): Msg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GLOBAL_HISTORY_CACHE_KEY) || "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): Msg => ({
        role: item?.role === "user" ? "user" : "assistant",
        content: String(item?.content || "").trim(),
        ts: item?.ts ? String(item.ts) : undefined,
      }))
      .filter((item) => item.content);
  } catch (_error) {
    return [];
  }
}

function saveCachedGlobalHistory(items: Msg[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GLOBAL_HISTORY_CACHE_KEY, JSON.stringify((items || []).slice(-120)));
  } catch (_error) {}
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
    summary: `当前页面是节目列表页，已读取 ${programs.length} 个节目。优先节目包括：${topPrograms.join("、") || "暂无节目"}。`,
    readReceipt: `已读取当前节目列表：共 ${programs.length} 个节目。你可以继续问我：先看哪几期、不同主题怎么选、某一页节目适合什么问题。`,
    shortcuts: [
      { label: "🎙 先看哪期", prompt: "帮我挑 3 期最值得先听的节目" },
      { label: "🧭 主题筛选", prompt: "按主题帮我快速分类" },
      { label: "👪 适合谁听", prompt: "分别适合哪些家长问题" },
      { label: "📚 节目地图", prompt: "给我一个收听顺序建议" },
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
    summary: `当前页面是节目详情页。节目标题：${program.title}。简介：${program.description || "暂无简介"}。${tags ? `标签：${tags}。` : ""}${guests ? `嘉宾：${guests}。` : ""}`,
    readReceipt: `已读取《${program.title}》页面内容。你可以继续问我：本期核心观点、嘉宾视角、词典概念、延伸阅读或适合你的收听重点。`,
    shortcuts: [
      { label: "🧠 本期总结", prompt: "请总结这一期的核心观点" },
      { label: "👥 嘉宾观点", prompt: "请整理这期内容里的嘉宾观点与分工" },
      { label: "📖 词典概念", prompt: "请提炼值得关注的概念词条" },
      { label: "🧭 我该怎么听", prompt: "如果我是家长，这一期应重点关注什么" },
    ],
  };
}

function buildExpertsListContext(guests: PublicGuest[], keyword: string): PageContextPayload {
  const topGuests = guests.slice(0, 4).map((item) => item.name).filter(Boolean);
  return {
    summary: `当前页面是先疯智库列表页，已读取 ${guests.length} 位嘉宾。当前搜索词：${keyword || "无"}。当前可见嘉宾包括：${topGuests.join("、") || "暂无嘉宾"}。`,
    readReceipt: `已读取当前智库列表：共 ${guests.length} 位嘉宾。你可以继续问我：先看谁、如何按背景筛选、哪位嘉宾更适合你的问题。`,
    shortcuts: [
      { label: "👀 先看谁", prompt: "帮我先挑最值得看的嘉宾" },
      { label: "🧭 如何筛选", prompt: "按嘉宾背景给我一个筛选方法" },
      { label: "📚 看什么资料", prompt: "先看哪类公开资料最有效" },
      { label: "🎙 关联节目", prompt: "先从哪些关联节目入手更好" },
    ],
  };
}

function buildExpertDetailContext(guest: PublicGuestDetail): PageContextPayload {
  const relatedPrograms = guest.relatedPrograms.slice(0, 3).map((item) => item.title).filter(Boolean);
  return {
    summary: `当前页面是嘉宾详情页。嘉宾：${guest.name}，身份：${guest.title || "节目嘉宾"}。简介：${guest.bio || "暂无简介"}。社交媒体 ${guest.socialProfiles?.length || 0} 项，公开成果 ${guest.publications?.length || guest.profileReferences?.length || 0} 项，关联节目 ${guest.relatedPrograms.length} 项。`,
    readReceipt: `已读取《${guest.name}》嘉宾资料。你可以继续问我：这位嘉宾的专业背景、先看哪条公开资料、先听哪期关联节目、是否适合你的问题。`,
    shortcuts: [
      { label: "👤 人物背景", prompt: "请概括这位嘉宾的专业背景和核心视角" },
      { label: "📚 先看资料", prompt: "推荐我先看哪条公开资料" },
      { label: "🎙 关联节目", prompt: "推荐我先听哪期关联节目" },
      { label: "🧭 是否适合我", prompt: "判断这位嘉宾更适合解决哪类家长问题" },
    ],
  };
}

function getDockedShareLabel(summary: string): string {
  const text = String(summary || "").trim();
  if (!text) return "当前页面";
  const titleMatch = text.match(/节目标题：([^。]+)。?/);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  const guestMatch = text.match(/嘉宾：([^，。]+)[，。]?/);
  if (guestMatch?.[1]) return guestMatch[1].trim();
  if (text.includes("节目列表页")) return "节目列表";
  if (text.includes("先疯智库列表页")) return "先疯智库";
  if (text.includes("嘉宾详情页")) return "嘉宾详情";
  return "当前页面";
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

const XiaowanziWidget: React.FC = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(GLOBAL_DOCKED_PREF_KEY) === "1";
    } catch (_error) {
      return false;
    }
  });
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
  const [messages, setMessages] = useState<Msg[]>([DEFAULT_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("● 随时可用");
  const [shareVisible, setShareVisible] = useState(true);
  const [hasHistoryMessages, setHasHistoryMessages] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [fabPosition, setFabPosition] = useState(() =>
    typeof window === "undefined" ? { left: 0, top: 0 } : getDefaultFabPosition(window.innerWidth, window.innerHeight),
  );
  const [avatarState, setAvatarState] = useState(loadPersistedAvatarState);
  const [displayAvatar, setDisplayAvatar] = useState<string>(() => getAvatarSrc(loadPersistedAvatarState().avatarIndex));
  const [avatarFxClassName, setAvatarFxClassName] = useState("");
  const [avatarParticles, setAvatarParticles] = useState<AvatarParticle[]>([]);
  const [pageContext, setPageContext] = useState<PageContextPayload>({
    summary: "",
    readReceipt: DEFAULT_MESSAGE.content,
    shortcuts: DEFAULT_SHORTCUTS,
  });
  const msgContainerRef = useRef<HTMLDivElement | null>(null);
  const latestMsgRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const dragRef = useRef({ active: false, moved: false, offsetX: 0, offsetY: 0, pointerId: -1 });
  const avatarTimersRef = useRef<number[]>([]);
  const shortcutItems = (pageContext.shortcuts.length ? pageContext.shortcuts : DEFAULT_SHORTCUTS).map((item) => ({
    ...item,
    prompt: normalizeShortcutPrompt(item.prompt),
  }));
  const avatar = getAvatarSrc(avatarState.avatarIndex);
  const isDocked = pinned && !maximized;
  const isDockedEmpty = isDocked && !hasHistoryMessages && messages.length <= 1;
  const visibleMessages = isDocked ? messages.filter((message) => !isReadReceiptMessage(message.content)) : messages;
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

  function clearAvatarTimers() {
    avatarTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    avatarTimersRef.current = [];
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

  useEffect(() => {
    let alive = true;

    async function loadContext() {
      try {
        if (pathname === "/programs") {
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

        setPageContext({
          summary: `当前页面路径：${pathname}`,
          readReceipt: "已读取当前页面。你可以继续告诉我你想解决的具体问题。",
          shortcuts: DEFAULT_SHORTCUTS,
        });
      } catch (_error) {
        if (!alive) return;
        setPageContext({
          summary: `当前页面路径：${pathname}`,
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
    };
  }, []);

  useEffect(() => {
    if (!open || hasHistoryMessages) return;
    setMessages([{ role: "assistant", content: pageContext.readReceipt || DEFAULT_MESSAGE.content, ts: new Date().toISOString() }]);
  }, [open, hasHistoryMessages, pageContext.readReceipt]);

  async function ensureBotReady() {
    const token = getSessionToken();
    if (!token) {
      setStatusText("● 请先登录账号");
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
        setStatusText("● 登录已失效，请重新登录");
      } else if (createRes.status === 403) {
        setStatusText("● 当前账号暂无小玩子权限");
      } else {
        setStatusText("● AI 服务暂不可用");
      }
      return false;
    }

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
      const filtered = (data as Msg[]).filter((m) => !isReadReceiptMessage(m.content));
      setHasHistoryMessages(filtered.length > 0);
      setMessages(filtered.length ? filtered : [DEFAULT_MESSAGE]);
      if (filtered.length) saveCachedGlobalHistory(filtered);
      return;
    }
    setHasHistoryMessages(false);
    setMessages([DEFAULT_MESSAGE]);
  }

  useEffect(() => {
    if (!open) return;
    const cached = loadCachedGlobalHistory();
    if (cached.length) {
      setHasHistoryMessages(true);
      setMessages(cached);
    }
    void (async () => {
      const ok = await ensureBotReady();
      if (ok) await reloadHistory();
    })();
  }, [open]);

  async function onHistoryClick() {
    const token = getSessionToken();
    if (!token) {
      setStatusText("● 请先登录账号");
      return;
    }
    await reloadHistory();
    setHistoryPanelOpen((v) => !v);
    setStatusText("● 已加载历史会话");
  }

  function buildHistoryCards(items: Msg[]): HistorySessionCard[] {
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

  useEffect(() => {
    if (!open) return;
    const container = msgContainerRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      if (hasHistoryMessages && latestMsgRef.current) {
        const top = latestMsgRef.current.offsetTop - container.offsetTop;
        container.scrollTo({ top: Math.max(0, top) });
      } else {
        container.scrollTo({ top: container.scrollHeight });
        inputRef.current?.focus();
      }
    });
  }, [open, messages, hasHistoryMessages]);

  useEffect(() => {
    if (!open) {
      setMaximized(false);
    }
  }, [open]);

  useEffect(() => {
    setShareVisible(true);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(GLOBAL_DOCKED_PREF_KEY, pinned ? "1" : "0");
    } catch (_error) {}
  }, [pinned]);

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

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    const token = getSessionToken();
    if (!token) {
      setStatusText("● 请先登录账号");
      return;
    }

    const contextualContent = pageContext.summary
      ? `[回答规则]\n${AI_RESPONSE_RULES}\n\n[当前页面上下文]\n${pageContext.summary}\n\n[用户问题]\n${content}`
      : `[回答规则]\n${AI_RESPONSE_RULES}\n\n[用户问题]\n${content}`;

    const userMessage: Msg = { role: "user", content, ts: new Date().toISOString() };
    const pendingAssistantMessage: Msg = {
      role: "assistant",
      content: `收到，你想让我处理的是：${content}\n\n我先按当前页面已确认信息帮你整理，马上给你结果。`,
      ts: new Date(Date.now() + 1).toISOString(),
    };

    setSending(true);
    setInput("");
    setHasHistoryMessages(true);
    setMessages((prev) => [...prev, userMessage, pendingAssistantMessage]);
    try {
      const res = await fetch(apiUrl(`/api/v1/tutorbot/${BOT_ID}/messages`), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content: contextualContent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = String(err?.content || err?.detail || "请求失败");
        setMessages((prev) => [
          ...prev.filter((item) => item.ts !== pendingAssistantMessage.ts),
          { role: "assistant", content: msg, ts: new Date().toISOString() },
        ]);
        return;
      }
      await reloadHistory();
      saveCachedGlobalHistory([
        ...messages.filter((m) => !isReadReceiptMessage(m.content)),
        userMessage,
      ]);
    } finally {
      setSending(false);
    }
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function onInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
    event.currentTarget.style.height = "auto";
    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
  }

  function onFabPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (open) return;
    dragRef.current.active = true;
    dragRef.current.moved = false;
    dragRef.current.pointerId = event.pointerId;
    dragRef.current.offsetX = event.clientX - fabPosition.left;
    dragRef.current.offsetY = event.clientY - fabPosition.top;
    event.currentTarget.setPointerCapture(event.pointerId);
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
    }
    setFabPosition(next);
  }

  function onFabPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.active) return;
    try {
      event.currentTarget.releasePointerCapture(dragRef.current.pointerId);
    } catch (_error) {}
    dragRef.current.active = false;
  }

  function onFabClick() {
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

  return (
    <>
      <style>{`
        #ai-fab{position:fixed !important;z-index:8100 !important;width:48px !important;height:48px !important;border-radius:50% !important;background:transparent !important;border:none !important;box-shadow:0 4px 20px rgba(108,39,214,.24) !important;display:flex !important;align-items:center !important;justify-content:center !important;cursor:grab !important;overflow:hidden !important;transition:all .2s !important;caret-color:transparent !important}
        #ai-fab:hover{transform:scale(1.1) !important;box-shadow:0 6px 28px rgba(108,39,214,.24) !important}
        body.xiaowanzi-docked #ai-fab{z-index:7000 !important}
        #ai-fab #ai-avatar-img{width:48px !important;height:48px !important;object-fit:contain !important;padding:6px !important;background:rgba(255,255,255,.92) !important;border-radius:50% !important;display:block !important}
        .ai-avatar-wrapper{position:relative;width:100%;height:100%;overflow:visible;caret-color:transparent !important}
        .ai-avatar-wrapper img{width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-drag:none;transition:all .3s ease}
        .ai-avatar-wrapper.avatar-fade-out img{opacity:0;transform:scale(.82) rotate(-8deg);filter:blur(4px)}
        .ai-avatar-wrapper.avatar-pop-in img{animation:avatarPopIn .4s cubic-bezier(.68,-0.55,.265,1.55) forwards}
        .ai-avatar-wrapper.avatar-glow img{filter:drop-shadow(0 0 14px rgba(108,39,214,.45)) drop-shadow(0 0 22px rgba(129,89,255,.28))}
        @keyframes avatarPopIn{0%{opacity:0;transform:scale(.82) rotate(-8deg)}65%{opacity:1;transform:scale(1.14) rotate(3deg)}100%{opacity:1;transform:scale(1) rotate(0deg)}}
        .ai-avatar-particles{position:absolute;inset:-8px;pointer-events:none;overflow:visible}
        .ai-avatar-particle{position:absolute;border-radius:999px;background:linear-gradient(135deg,#8b5cf6 0%,#60a5fa 100%);opacity:0;animation:avatarParticle .52s ease-out forwards;box-shadow:0 0 8px rgba(108,39,214,.26)}
        @keyframes avatarParticle{0%{opacity:0;transform:translate(0,0) scale(.5)}20%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.35)}}
        .ai-panel-backdrop{position:fixed;inset:0;z-index:7999;background:rgba(15,23,42,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:none}
        .ai-panel-backdrop.show{display:block}
        #ai-panel{position:fixed !important;bottom:86px !important;right:28px !important;z-index:8050 !important;width:360px !important;max-height:520px !important;background:linear-gradient(180deg,rgba(255,255,255,.98) 0%,rgba(250,251,255,.98) 100%) !important;border:1px solid rgba(108,39,214,.16) !important;border-radius:18px !important;box-shadow:0 18px 48px rgba(31,41,55,.16),0 4px 18px rgba(108,39,214,.12) !important;display:flex;flex-direction:column !important;overflow:hidden !important;animation:panelIn .2s ease !important;box-sizing:border-box !important}
        #ai-panel.docked{top:0 !important;right:10px !important;bottom:10px !important;left:auto !important;width:calc(var(--xiaowanzi-docked-width,430px) - 20px) !important;height:calc(100vh - 10px) !important;max-height:calc(100vh - 10px) !important;border-radius:0 0 24px 24px !important;animation:none !important;border-left:1px solid rgba(108,39,214,.16) !important;border-right:1px solid rgba(108,39,214,.12) !important;border-top:1px solid rgba(108,39,214,.12) !important;box-shadow:none !important}
        #ai-panel.max{top:50% !important;left:50% !important;right:auto !important;bottom:auto !important;transform:translate(-50%,-50%) !important;width:min(680px,calc(100vw - 24px)) !important;max-width:min(680px,calc(100vw - 24px)) !important;height:min(78vh,760px) !important;max-height:min(78vh,760px) !important}
        @media (max-width:560px){#ai-panel.max{width:calc(100vw - 16px) !important;max-width:calc(100vw - 16px) !important;height:calc(100vh - 16px) !important;max-height:calc(100vh - 16px) !important;border-radius:16px !important}}
        body.xiaowanzi-docked #app-shell{padding-right:var(--xiaowanzi-docked-width,430px);transition:padding-right .2s ease;border-radius:0 24px 24px 0;overflow:hidden}
        body.xiaowanzi-docked #app-shell nav.fixed.top-0.z-50.w-full{width:calc(100% - var(--xiaowanzi-docked-width,430px));border-top-right-radius:24px}
        @media (max-width: 980px){
          body.xiaowanzi-docked #app-shell{padding-right:0}
          body.xiaowanzi-docked #app-shell nav.fixed.top-0.z-50.w-full{width:100%}
          #ai-panel.docked{width:min(94vw,420px) !important}
        }
        @keyframes panelIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
        .aip-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(108,39,214,.12);flex-shrink:0;position:relative;background:linear-gradient(180deg,rgba(108,39,214,.04) 0%,rgba(108,39,214,0) 100%) !important}
        .aip-gem{width:40px !important;height:40px !important;display:flex !important;align-items:center !important;justify-content:center !important;flex-shrink:0 !important}
        .aip-gem #ai-panel-avatar-img{width:40px !important;height:40px !important;object-fit:contain !important;padding:4px !important;border-radius:10px !important;display:block !important}
        .aip-title{font-size:13.5px;font-weight:700;flex:1}
        .aip-status{font-size:10px;color:#059669;font-weight:600}
        .aip-icon-btn{position:absolute;top:50%;transform:translateY(-50%);width:34px !important;height:34px !important;border:none;border-radius:50% !important;background:rgba(108,39,214,.045);color:#6b7280;font-family:'Material Symbols Rounded';font-size:16px;cursor:pointer;transition:all .12s;display:flex;align-items:center;justify-content:center}
        .aip-pin{right:92px}
        .aip-theme{right:132px}
        .aip-enlarge{right:52px}
        .aip-close{right:12px}
        .aip-pin{background:#f1eff8;color:#6b7280}
        .aip-pin.on{background:#ece8f7;color:#4b5563;box-shadow:inset 0 0 0 1px rgba(108,39,214,.12)}
        .aip-icon-btn:hover{background:rgba(108,39,214,.075);color:#1f2937;transform:translateY(-50%) scale(1.1)}
        .aip-msgs{flex:1;overflow-y:auto;padding:12px 12px 10px;display:flex;flex-direction:column;gap:10px;min-height:0;background:linear-gradient(180deg,rgba(108,39,214,.02) 0%,rgba(108,39,214,0) 35%)}
        .aip-msgs::-webkit-scrollbar{width:3px}
        .aip-msgs::-webkit-scrollbar-thumb{background:rgba(108,39,214,.18);border-radius:3px}
        .aip-msg{max-width:88%;font-size:13px;line-height:1.6;padding:10px 13px;border-radius:12px;word-break:break-word;white-space:pre-wrap}
        .aip-msg.ai{background:#fff;color:#1f2937;border:1px solid rgba(108,39,214,.1);border-radius:8px 14px 14px 14px;align-self:flex-start;box-shadow:0 3px 10px rgba(15,23,42,.06)}
        .aip-msg.user{background:linear-gradient(135deg,#6c27d6 0%,#7f37ea 100%);color:#fff;border-radius:14px 8px 14px 14px;align-self:flex-end;box-shadow:0 8px 16px rgba(108,39,214,.2)}
        .aip-empty{margin-top:auto;padding:8px 8px 16px}
        .aip-empty-title{font-size:28px;line-height:1.18;font-weight:800;color:#1f2937;letter-spacing:-.02em}
        .aip-empty-sub{font-size:16px;line-height:1.28;font-weight:700;color:#4b5563;margin-top:2px}
        .aip-empty-suggests{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-top:18px}
        .aip-empty-btn{display:inline-flex;align-items:center;width:auto;max-width:100%;height:40px;padding:0 14px;border:none;border-radius:999px;text-align:left;background:#eef0f6;color:#2f3848;font-size:15px;font-weight:600}
        .aip-empty-btn:hover{background:#e2e6f2}
        .aip-shortcuts{display:flex;align-items:flex-end;gap:8px;padding:8px 12px;border-top:1px solid rgba(108,39,214,.1);flex-shrink:0;background:#fff}
        .aip-shortcuts-list{display:flex;flex-wrap:wrap;gap:5px;flex:1;min-width:0}
        .aip-shortcuts-actions{margin-left:auto;display:none;align-items:center;gap:6px;flex-shrink:0}
        #ai-panel.max .aip-shortcuts-actions{display:flex}
        .aip-temp-history-btn{height:28px;min-width:84px;padding:0 10px;border:1px solid rgba(108,39,214,.12);border-radius:16px;background:#fff;color:#6b7280;font-size:11px;font-weight:600}
        .aip-history-panel{position:absolute;right:12px;bottom:116px;width:220px;max-height:280px;background:#fff;border:1px solid rgba(108,39,214,.16);border-radius:12px;box-shadow:0 14px 28px rgba(15,23,42,.16);overflow:hidden;z-index:8201}
        .aip-history-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(108,39,214,.1);font-size:12px;font-weight:700;color:#374151}
        .aip-history-close{border:none;background:transparent;color:#6b7280;font-family:'Material Symbols Rounded';font-size:16px}
        .aip-history-list{max-height:238px;overflow:auto;padding:8px}
        .aip-history-empty{padding:14px 8px;font-size:11px;color:#94a3b8}
        .aip-history-card{width:100%;text-align:left;border:1px solid rgba(108,39,214,.1);background:#f8f8ff;border-radius:10px;padding:8px 9px;margin-bottom:6px}
        .aip-history-card:last-child{margin-bottom:0}
        .aip-history-card:hover{background:#f1efff;border-color:rgba(108,39,214,.22)}
        .aip-history-card-title{font-size:11px;font-weight:600;color:#374151;line-height:1.35}
        .aip-history-card-sub{margin-top:3px;font-size:10px;color:#94a3b8}
        .aip-sc{padding:4px 10px;border:1px solid rgba(108,39,214,.12);border-radius:20px;font-size:11px;background:#faf7ff;color:#6b7280;cursor:pointer;transition:all .1s;white-space:nowrap}
        .aip-sc:hover{border-color:#6c27d6;color:#6c27d6;background:rgba(108,39,214,.08)}
        .aip-input-row{display:flex;align-items:center;gap:8px;padding:10px 12px 12px;border-top:1px solid rgba(108,39,214,.1);flex-shrink:0;background:#fff}
        .aip-input-wrap{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;width:100%}
        .aip-input-shell{position:relative;display:flex;align-items:stretch;flex:1;min-width:0;width:100%}
        .aip-input{flex:1;resize:none;border:1px solid rgba(108,39,214,.18);border-radius:14px;padding:12px 56px 12px 11px;font:inherit;font-size:13px;color:#1f2937;background:#fbfbff;outline:none;min-height:72px;max-height:160px;transition:border-color .15s,box-shadow .15s,background .15s;line-height:1.45}
        .aip-input:focus{border-color:#6c27d6;background:#fff;box-shadow:0 0 0 3px rgba(108,39,214,.12)}
        .aip-input::placeholder{color:#9ca3af}
        .aip-send{position:absolute;right:8px;bottom:8px;width:36px;height:36px;border:none;border-radius:11px;background:linear-gradient(135deg,#6c27d6 0%,#7f37ea 100%);color:#fff;cursor:pointer;flex-shrink:0;align-self:center;font-family:'Material Symbols Rounded';font-size:16px;transition:all .15s;box-shadow:0 8px 16px rgba(108,39,214,.24)}
        .aip-send:hover{background:linear-gradient(135deg,#7a35e4 0%,#8d47f5 100%);transform:translateY(-1px)}
        .aip-send:disabled{opacity:.4;cursor:not-allowed;transform:none}
        #ai-panel.docked .aip-shortcuts{padding:10px 10px 8px;background:transparent;border-top:none}
        #ai-panel.docked .aip-shortcuts-list{gap:8px}
        #ai-panel.docked .aip-sc{padding:7px 12px;background:#eceff7;border-color:#d7dced;color:#475569;font-size:13px;border-radius:999px}
        #ai-panel.docked .aip-sc:hover{background:#e2e7f5;border-color:#c7d0ea;color:#334155}
        #ai-panel.docked .aip-input-row{padding:8px 10px 10px;background:#f5f6fb;border-top:1px solid #e7e9f5}
        #ai-panel.docked .aip-input-shell{padding:0}
        #ai-panel.docked .aip-input{border:1px solid #cfd7ec;background:#fff;box-shadow:0 1px 0 rgba(255,255,255,.8);border-radius:18px}
        #ai-panel.docked .aip-input:focus{border-color:#6c27d6;box-shadow:0 0 0 3px rgba(108,39,214,.12);background:#fff}
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
        #ai-panel.docked.docked-dark .aip-msgs{background:linear-gradient(180deg,rgba(255,255,255,.02) 0%,rgba(255,255,255,0) 35%)}
        #ai-panel.docked.docked-dark .aip-msg.ai{background:#161b22;border-color:#2c3340;color:#e5e7eb}
        #ai-panel.docked.docked-dark .aip-msg.user{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff}
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
      `}</style>
      <div className={`ai-panel-backdrop${open && maximized ? " show" : ""}`} onClick={() => setMaximized(false)} />
      {open ? (
        <div
          id="ai-panel"
          className={`${maximized ? "max" : ""}${!maximized && pinned ? " docked" : ""}${isDocked && dockedDark ? " docked-dark" : ""}`.trim()}
          style={getFloatingPanelStyle()}
        >
          <div className="aip-head">
            <div className="aip-gem">
              <div className={`ai-avatar-wrapper ${avatarFxClassName}`.trim()}>
                <img id="ai-panel-avatar-img" src={displayAvatar} alt="" draggable={false} onError={onAvatarError} />
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
          <div className="aip-msgs" ref={msgContainerRef}>
            {visibleMessages.map((message, idx) => (
              <div
                key={`${idx}-${message.ts || ""}`}
                className={`aip-msg ${message.role === "assistant" ? "ai" : "user"}`}
                ref={idx === visibleMessages.length - 1 ? latestMsgRef : null}
                data-msg-index={idx}
              >
                {message.content}
              </div>
            ))}
            {isDockedEmpty ? (
              <div className="aip-empty">
                <div className="aip-empty-title">{currentUserName ? `${currentUserName}，你好` : "你好"}</div>
                <div className="aip-empty-sub">今天需要我做些什么？</div>
                <div className="aip-empty-suggests">
                  {shortcutItems.slice(0, 3).map((item) => (
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
                {shortcutItems.map((item) => (
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
                    <button key={card.id} className="aip-history-card" type="button" onClick={() => jumpToMessage(card.targetIndex)}>
                      <div className="aip-history-card-title">{card.title}</div>
                      <div className="aip-history-card-sub">{card.sub}</div>
                    </button>
                  ))
                ) : (
                  <div className="aip-history-empty">暂无历史存档</div>
                )}
              </div>
            </div>
          ) : null}
          <div className="aip-input-row">
            <div className="aip-input-wrap">
              {isDocked && shareVisible ? (
                <div className="aip-share">
                  <span>正在阅读“{getDockedShareLabel(pageContext.summary)}”页面上下文</span>
                  <button className="aip-share-close" type="button" aria-label="关闭共享提示" onClick={() => setShareVisible(false)}>close</button>
                </div>
              ) : null}
              <div className="aip-input-shell">
                <textarea
                  ref={inputRef}
                  className="aip-input"
                  rows={1}
                  placeholder="问我任何学习问题…"
                  value={input}
                  onChange={onInputChange}
                  onKeyDown={onInputKeyDown}
                />
                <button className="aip-send" type="button" onClick={() => void sendMessage()} disabled={sending}>
                  {sending ? "more_horiz" : "send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
          <img id="ai-avatar-img" src={displayAvatar} alt="" draggable={false} onError={onAvatarError} />
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
    </>
  );
};

export default XiaowanziWidget;
