import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import GuestWishButton from "./GuestWishButton";
import { GuestAgentCitation, GuestAgentMessage, GuestAgentProfile, publicApi } from "../services/api";
import { hasAdminOrUserSession, isProRequiredError, showProUpgradeFromPayload } from "../utils/proGate";
import { isXiaowanziEmbeddedLayer, withXiaowanziLayerParam } from "../utils/xiaowanziLayer";
import {
  GUEST_FALLBACK_AVATAR_DETAIL_IMG_CLASS,
  GUEST_FALLBACK_AVATAR_FRAME_CLASS,
  GUEST_REAL_AVATAR_DETAIL_IMG_CLASS,
  GUEST_REAL_AVATAR_FRAME_CLASS,
  resolveGuestAvatar,
} from "../utils/guestAvatar";

const SOURCE_LABELS: Record<string, string> = {
  guest_profile: "嘉宾档案",
  program_summary: "节目摘要",
  program_transcript: "逐字稿",
  program_quickview: "节目速览",
  program_shownotes: "节目笔记",
  program_deepdive: "深度资料",
  public_material: "公开资料",
};

function isLoggedIn(token?: string | null) {
  return Boolean(token || hasAdminOrUserSession());
}

function openLogin() {
  document.dispatchEvent(
    new CustomEvent("xf-show-login-modal", {
      detail: {
        title: "登录后即可向嘉宾提问",
        description: "登录后可使用嘉宾 AI 分身，并保存你和这位嘉宾的对话历史。",
      },
    })
  );
}

function renderInlineMarkdown(text: string) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-black text-[#1f1835]">{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function normalizeMarkdownText(text: string) {
  return String(text || "")
    .replace(/\s+(\d+\.\s+\*\*)/g, "\n$1")
    .replace(/\s+(-\s+\*\*)/g, "\n$1")
    .replace(/\s+(#{1,3}\s+)/g, "\n$1")
    .trim();
}

function stripInlineCitationSummary(text: string) {
  return String(text || "")
    .replace(/\n+\s*(?:\*\*)?\s*(?:参考(?:来源|资料)|资料来源|引用(?:资料|来源))\s*(?:\*\*)?\s*[:：][\s\S]*$/u, "")
    .replace(/(?:^|\n)\s*如果你对这些对话内容感兴趣，可以收听下方推荐卡片中的真实节目，那里有更完整的讨论。\s*$/u, "")
    .trim();
}

function MarkdownAnswer({ content }: { content: string }) {
  const normalized = normalizeMarkdownText(stripInlineCitationSummary(content));
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (!listItems.length) return;
    const items = listItems;
    listItems = [];
    blocks.push(
      <ol key={`list-${blocks.length}`} className="my-2 list-decimal space-y-2 pl-5">
        {items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 12)}`} className="pl-1 leading-7">
            {renderInlineMarkdown(item.replace(/^\d+\.\s*/, "").replace(/^-\s*/, ""))}
          </li>
        ))}
      </ol>
    );
  };
  lines.forEach((line) => {
    if (/^(\d+\.\s+|-\s+)/.test(line)) {
      listItems.push(line);
      return;
    }
    flushList();
    if (/^#{1,3}\s+/.test(line)) {
      blocks.push(<h4 key={`h-${blocks.length}`} className="mt-3 text-[15px] font-black leading-7 text-[#1f1835]">{renderInlineMarkdown(line.replace(/^#{1,3}\s+/, ""))}</h4>);
      return;
    }
    blocks.push(<p key={`p-${blocks.length}`} className="my-2 leading-7">{renderInlineMarkdown(line)}</p>);
  });
  flushList();
  return <div className="space-y-1 text-left">{blocks}</div>;
}

function citationHref(citation: GuestAgentCitation) {
  if (citation.url) return citation.url;
  if (citation.sourceType.startsWith("program") && citation.sourceId) return `/programs/${encodeURIComponent(citation.sourceId)}`;
  return "";
}

function programRecommendationsFromCitations(citations: GuestAgentCitation[]) {
  const seen = new Set<string>();
  return (Array.isArray(citations) ? citations : [])
    .filter((citation) => citation.sourceType.startsWith("program"))
    .map((citation) => ({
      title: citation.sourceTitle || "未命名节目",
      href: citationHref(citation),
    }))
    .filter((item) => item.href)
    .filter((item) => {
      const key = `${item.href}::${item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function shouldShowProgramRecommendations(citations: GuestAgentCitation[] | undefined, userContent: string, assistantContent: string) {
  const hasProgramCitation = (Array.isArray(citations) ? citations : []).some((citation) => citation.sourceType.startsWith("program"));
  if (!hasProgramCitation) return false;
  const context = `${userContent}\n${stripInlineCitationSummary(assistantContent)}`;
  return /收听|听听|听一下|节目|播客|音频|哪期|哪一集|番外|推荐卡片|下方推荐|《[^》]+》/u.test(context);
}

const ProgramRecommendationCards: React.FC<{ citations: GuestAgentCitation[] }> = ({ citations }) => {
  const programs = programRecommendationsFromCitations(citations);
  if (!programs.length) return null;
  return (
    <div className="mt-3 rounded-[1.25rem] border border-[#e8e0f2] bg-white/80 p-3">
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#5b3fa1]">推荐收听</div>
      <div className="space-y-2">
        {programs.map((program, index) => {
          const body = (
            <div className="flex items-center justify-between rounded-[1.1rem] border border-[#e8e0f2] bg-[#fcfaff] px-4 py-3 transition hover:border-[#b79bff] hover:bg-white">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5b3fa1]">#{index + 1}</div>
                <div className="mt-1 truncate text-base font-black text-[#241a3a]">{program.title}</div>
              </div>
              <span className="material-symbols-outlined shrink-0 text-[#5e17eb]" style={{ fontSize: "13px", lineHeight: "13px" }}>arrow_outward</span>
            </div>
          );
          if (/^https?:\/\//i.test(program.href)) {
            return (
              <a key={`${program.href}-${index}`} href={program.href} target="_blank" rel="noreferrer" className="block">
                {body}
              </a>
            );
          }
          return (
            <Link key={`${program.href}-${index}`} to={withXiaowanziLayerParam(program.href, isXiaowanziEmbeddedLayer())} className="block">
              {body}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

const CitationCard: React.FC<{ citation: GuestAgentCitation; index: number }> = ({ citation, index }) => {
  const href = citationHref(citation);
  const body = (
    <div className="rounded-xl border border-[#e8e0f2] bg-[#fcfaff] px-3 py-2 transition hover:border-[#b79bff] hover:bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#5e17eb]">
            #{index + 1} {SOURCE_LABELS[citation.sourceType] || "来源"}
          </div>
          <div className="mt-0.5 truncate text-xs font-black text-[#241a3a]">{citation.sourceTitle || "未命名来源"}</div>
          {citation.locator ? <div className="mt-0.5 truncate text-[11px] font-bold text-[#8e81b3]">{citation.locator}</div> : null}
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#756b9b]">{citation.text}</p>
        </div>
        {href ? <span className="material-symbols-outlined shrink-0 text-[20px] text-[#5e17eb]">arrow_outward</span> : null}
      </div>
    </div>
  );
  if (!href) return body;
  const external = /^https?:\/\//i.test(href);
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className="block">
      {body}
    </a>
  ) : (
    <Link to={withXiaowanziLayerParam(href, isXiaowanziEmbeddedLayer())} className="block">
      {body}
    </Link>
  );
};

const CitationGroup: React.FC<{ citations: GuestAgentCitation[]; compactMobile?: boolean }> = ({ citations, compactMobile }) => {
  const [expanded, setExpanded] = useState(false);
  const visibleCitations = citations.slice(0, 4);
  const sourceSummary = Array.from(
    new Set(visibleCitations.map((citation) => SOURCE_LABELS[citation.sourceType] || "来源"))
  )
    .slice(0, 3)
    .join(" / ");

  const citationGrid = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {visibleCitations.map((citation, citationIndex) => (
        <CitationCard key={`${citation.sourceId}-${citation.locator}-${citationIndex}`} citation={citation} index={citationIndex} />
      ))}
    </div>
  );

  if (!compactMobile) return <div className="mt-3">{citationGrid}</div>;

  return (
    <>
      <div className="mt-2 md:hidden">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center justify-between rounded-2xl border border-[#e8e0f2] bg-white/90 px-3 py-2 text-left shadow-[0_10px_30px_rgba(80,62,125,0.06)]"
        >
          <div className="min-w-0">
            <div className="text-xs font-black text-[#241a3a]">引用资料 {visibleCitations.length} 条</div>
            {sourceSummary ? <div className="mt-0.5 truncate text-[11px] font-bold text-[#8e81b3]">{sourceSummary}</div> : null}
          </div>
          <span className={`material-symbols-outlined shrink-0 text-[22px] text-[#5e17eb] transition ${expanded ? "rotate-180" : ""}`}>expand_more</span>
        </button>
        {expanded ? <div className="mt-2 space-y-2">{citationGrid}</div> : null}
      </div>
      <div className="mt-3 hidden md:block">{citationGrid}</div>
    </>
  );
};

const GuestAgentChatPanel: React.FC<{
  guestId: string;
  fallbackName?: string;
  fallbackTitle?: string;
  fallbackAvatar?: string;
  fallbackBio?: string;
  programCount?: number;
  socialCount?: number;
  publicationCount?: number;
  mergeProfileHeader?: boolean;
  mobileProfileExtra?: React.ReactNode;
}> = ({
  guestId,
  fallbackName,
  fallbackTitle,
  fallbackAvatar,
  fallbackBio,
  programCount,
  socialCount,
  publicationCount,
  mergeProfileHeader,
  mobileProfileExtra,
}) => {
  const token = useSelector((state: RootState) => state.user.token);
  const [profile, setProfile] = useState<GuestAgentProfile | null>(null);
  const [messages, setMessages] = useState<GuestAgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [uploadedAttachment, setUploadedAttachment] = useState<{ name: string; dataUrl: string; kind?: "image" | "file" } | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceHolding, setVoiceHolding] = useState(false);
  const [compactHeaderVisible, setCompactHeaderVisible] = useState(false);
  const [avatarFallbackActive, setAvatarFallbackActive] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const voicePressTimerRef = useRef<number | null>(null);

  const authed = isLoggedIn(token);
  const agent = profile?.agent;
  const rawProfileAvatar = agent?.avatar || fallbackAvatar || "";
  const { src: profileAvatar, isFallback: isProfileFallbackAvatar } = resolveGuestAvatar(rawProfileAvatar, avatarFallbackActive);
  const suggestedQuestions = useMemo(
    () => (agent?.suggestedQuestions || []).filter(Boolean).slice(0, 3),
    [agent?.suggestedQuestions]
  );

  useEffect(() => {
    setAvatarFallbackActive(false);
  }, [rawProfileAvatar]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    publicApi
      .getGuestAgent(guestId)
      .then((res) => {
        if (!alive) return;
        setProfile(res.data);
      })
      .catch((err: any) => {
        if (!alive) return;
        setError(err?.response?.data?.message || err?.message || "加载嘉宾智能体失败");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [guestId]);

  useEffect(() => {
    if (!authed) {
      setMessages([]);
      return;
    }
    let alive = true;
    publicApi
      .getGuestAgentHistory(guestId)
      .then((res) => {
        if (!alive) return;
        setMessages(Array.isArray(res.data.messages) ? res.data.messages : []);
      })
      .catch(() => {
        if (!alive) return;
        setMessages([]);
      });
    return () => {
      alive = false;
    };
  }, [guestId, authed]);

  useEffect(() => {
    if (!mergeProfileHeader) return;
    const onScroll = () => setCompactHeaderVisible(window.scrollY > 180);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mergeProfileHeader]);

  const sendQuestion = async (question: string) => {
    const clean = question.trim();
    const attachment = uploadedAttachment;
    if (!clean && !attachment) return;
    if (!authed) {
      openLogin();
      return;
    }
    const content = attachment
      ? `${clean || (attachment.kind === "file" ? "请帮我看一下这个文件" : "请帮我看一下这张图片")}\n\n[用户上传${attachment.kind === "file" ? "文件" : "图片"}] ${attachment.name}`
      : clean;
    setSending(true);
    setError("");
    setMessages((prev) => [...prev, { role: "user", content, createdAt: new Date().toISOString() }]);
    setInput("");
    setUploadedAttachment(null);
    setAttachmentMenuOpen(false);
    if (inputRef.current) {
      inputRef.current.style.height = "52px";
      inputRef.current.style.lineHeight = "22px";
    }
    try {
      const res = await publicApi.chatWithGuestAgent(guestId, content);
      const data = res.data;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          citations: data.citations,
          createdAt: new Date().toISOString(),
        },
      ]);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              agent: {
                ...prev.agent,
                suggestedQuestions: data.suggestedQuestions || prev.agent.suggestedQuestions,
              },
            }
          : prev
      );
    } catch (err: any) {
      if (isProRequiredError(err)) {
        showProUpgradeFromPayload(err?.response?.data);
        setMessages((prev) => prev.filter((item) => !(item.role === "user" && item.content === content)));
        return;
      }
      setError(err?.response?.data?.message || err?.message || "嘉宾智能体回答失败");
      setMessages((prev) => prev.filter((item) => !(item.role === "user" && item.content === content)));
    } finally {
      setSending(false);
    }
  };

  const onInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    event.currentTarget.style.height = "52px";
    event.currentTarget.style.lineHeight = "22px";
    if (event.currentTarget.scrollHeight > 52) {
      event.currentTarget.style.lineHeight = "1.38";
      event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 104)}px`;
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("当前浏览器不支持语音输入");
      return;
    }
    if (voiceListening) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onstart = () => {
      setVoiceListening(true);
      setError("");
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
      setError("语音输入失败，请重试");
    };
    recognition.onend = () => {
      setVoiceListening(false);
      setVoiceHolding(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setVoiceListening(false);
    setVoiceHolding(false);
  };

  const toggleVoiceInput = () => {
    if (voiceListening) {
      stopVoiceInput();
      return;
    }
    startVoiceInput();
  };

  const startInputVoicePress = () => {
    if (voicePressTimerRef.current) return;
    setVoiceHolding(true);
    voicePressTimerRef.current = window.setTimeout(() => {
      voicePressTimerRef.current = null;
      setVoiceHolding(false);
      startVoiceInput();
    }, 450);
  };

  const endInputVoicePress = () => {
    if (voicePressTimerRef.current) {
      window.clearTimeout(voicePressTimerRef.current);
      voicePressTimerRef.current = null;
    }
    setVoiceHolding(false);
    if (voiceListening) stopVoiceInput();
  };

  const onImagePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedAttachment({ name: file.name || "拍照上传图片", dataUrl: String(reader.result || ""), kind: "image" });
      setAttachmentMenuOpen(false);
      inputRef.current?.focus();
    };
    reader.onerror = () => setError("图片读取失败，请重试");
    reader.readAsDataURL(file);
  };

  const onFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadedAttachment({ name: file.name || "上传文件", dataUrl: "", kind: "file" });
    setAttachmentMenuOpen(false);
    inputRef.current?.focus();
  };

  const sourceCounts = agent?.sourceCounts || {};
  const sourceTotal = Object.values(sourceCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  const sectionClass = mergeProfileHeader
    ? "border-0 bg-transparent p-0 pb-28 pt-0 shadow-none md:rounded-[2rem] md:border md:border-[#dcd4f0] md:bg-[linear-gradient(135deg,_#f4f1fd_0%,_#fff_58%,_#eef3ff_100%)] md:p-8 md:pb-8 md:pt-8 md:shadow-[0_24px_80px_rgba(80,62,125,0.08)]"
    : "rounded-[2rem] border border-[#dcd4f0] bg-[linear-gradient(135deg,_#f4f1fd_0%,_#fff_58%,_#eef3ff_100%)] p-5 shadow-[0_24px_80px_rgba(80,62,125,0.08)] sm:p-8";
  const profileCardClass = mergeProfileHeader
    ? "rounded-[1.8rem] border border-white/80 bg-white/95 px-6 pb-6 pt-4 shadow-[0_18px_60px_rgba(55,70,130,0.12)] md:rounded-[1.6rem] md:bg-white/80 md:p-5 md:shadow-none"
    : "rounded-[1.6rem] border border-white/80 bg-white/80 p-5";
  const chatCardClass = mergeProfileHeader
    ? "flex min-h-0 flex-col rounded-[1.6rem] border border-white/80 bg-white/90 p-4 sm:p-5 md:min-h-[520px]"
    : "flex min-h-[520px] flex-col rounded-[1.6rem] border border-white/80 bg-white/90 p-4 sm:p-5";

  return (
    <section className={sectionClass}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[330px,1fr] lg:gap-5">
        <div className={profileCardClass}>
          <div className={mergeProfileHeader ? "text-center" : ""}>
            <div className={`${mergeProfileHeader ? "hidden md:inline-flex" : "inline-flex"} rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]`}>
              {mergeProfileHeader ? "Guest Profile" : "Guest Agent"}
            </div>
          </div>
          <div className={mergeProfileHeader ? "mt-3 flex flex-col items-center text-center" : "mt-5 flex items-center gap-4"}>
            <div className={`relative shrink-0 ${mergeProfileHeader ? "h-[7.8rem] w-[7.8rem] md:h-[9.1rem] md:w-[9.1rem]" : "h-20 w-20"}`}>
              <div className={`flex h-full w-full items-center justify-center overflow-hidden p-[2px] ring-4 ring-[#5e17eb]/10 ${mergeProfileHeader ? "rounded-3xl" : "rounded-2xl"} ${isProfileFallbackAvatar ? GUEST_FALLBACK_AVATAR_FRAME_CLASS : GUEST_REAL_AVATAR_FRAME_CLASS}`}>
                {profileAvatar ? (
                  <img
                    src={profileAvatar}
                    alt={agent?.name || fallbackName || "嘉宾"}
                    className={isProfileFallbackAvatar ? GUEST_FALLBACK_AVATAR_DETAIL_IMG_CLASS : GUEST_REAL_AVATAR_DETAIL_IMG_CLASS}
                    onError={() => setAvatarFallbackActive(true)}
                  />
                ) : null}
                <span className="absolute right-1 top-1 rounded-full bg-[#6257ff] px-1.5 py-0.5 text-[10px] font-black text-white md:right-1 md:top-1">AI</span>
              </div>
              {mergeProfileHeader ? <div className="absolute -bottom-3 right-[-19px] z-10"><GuestWishButton guestId={guestId} /></div> : null}
            </div>
            <div className={mergeProfileHeader ? "mt-6 min-w-0" : "min-w-0"}>
              <div className={mergeProfileHeader ? "flex items-center justify-center gap-3" : ""}>
                <h2 className={`truncate font-black text-[#241a3a] ${mergeProfileHeader ? "text-3xl md:text-4xl" : "text-2xl"}`}>{agent?.name || fallbackName || "嘉宾智能体"}</h2>
                <p className={`line-clamp-2 font-bold text-[#5e17eb] ${mergeProfileHeader ? "text-sm" : "mt-1 text-xs"}`}>{agent?.title || fallbackTitle || "节目嘉宾 AI 分身"}</p>
              </div>
            </div>
          </div>
          <p className={`mt-5 text-sm leading-7 text-[#6f66ad] ${mergeProfileHeader ? "mx-auto max-w-[22rem] text-center md:max-w-none" : ""}`}>
            {mergeProfileHeader
              ? fallbackBio || agent?.bio || "暂无简介，后续可在后台补充嘉宾背景、研究方向与代表经验。"
              : agent?.bio || fallbackBio || "这个 AI 分身会基于嘉宾档案、节目内容和公开资料回答，并尽量标注可追溯来源。"}
          </p>
          {mergeProfileHeader && mobileProfileExtra ? <div className="mt-4 md:hidden">{mobileProfileExtra}</div> : null}
          {mergeProfileHeader ? (
            <div className="mt-6 hidden flex-wrap justify-center gap-2 md:flex">
              <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                节目 {programCount ?? agent?.programCount ?? 0}
              </span>
              <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                社交媒体 {socialCount ?? 0}
              </span>
              <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                公开内容 {publicationCount ?? 0}
              </span>
            </div>
          ) : null}
          <div className={mergeProfileHeader ? "mt-5 hidden grid-cols-2 gap-2 md:grid" : "mt-5 grid grid-cols-2 gap-2"}>
            <div className="rounded-2xl bg-white px-4 py-3">
              <div className="text-2xl font-black text-[#241a3a]">{agent?.programCount ?? 0}</div>
              <div className="text-xs font-bold text-[#8e81b3]">关联节目</div>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <div className="text-2xl font-black text-[#241a3a]">{agent?.chunkCount ?? sourceTotal}</div>
              <div className="text-xs font-bold text-[#8e81b3]">知识片段</div>
            </div>
          </div>
          <div className={mergeProfileHeader ? "mt-4 hidden rounded-2xl bg-white px-4 py-3 text-xs leading-5 text-[#7b70a4] md:block" : "mt-4 rounded-2xl bg-white px-4 py-3 text-xs leading-5 text-[#7b70a4]"}>
            对话会参考节目逐字稿、节目笔记、嘉宾档案和公开资料；资料不足时会明确说明。
          </div>
        </div>

        <div className={chatCardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee8f8] pb-4">
            <div>
              <h3 className="text-xl font-black text-[#241a3a]">向嘉宾 AI 分身提问</h3>
              <p className="mt-1 text-xs font-bold text-[#8e81b3]">{agent?.privacyNote || "登录后可保存当前账号的对话历史。"}</p>
            </div>
            <div className="rounded-full bg-[#f3eefc] px-3 py-1 text-[11px] font-black text-[#5e17eb]">
              {loading ? "索引读取中" : `已索引 ${agent?.chunkCount || 0} 段`}
            </div>
          </div>
          {error ? <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-500">{error}</div> : null}

          <div className={`flex-1 space-y-4 overflow-y-auto py-5 ${mergeProfileHeader ? "pb-[112px] md:pb-5" : ""}`}>
            {messages.length === 0 ? (
              <div className="space-y-3">
                <div className="rounded-[1.4rem] bg-[#f4f2fb] px-5 py-4 text-base font-black leading-7 text-[#241a3a]">
                  我是{agent?.name || fallbackName || "这位嘉宾"}的 AI 分身。你可以问我节目观点、具体做法，或让资料库帮你追溯出处。
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {suggestedQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => sendQuestion(question)}
                      className="rounded-2xl border border-[#e8e0f2] bg-white px-4 py-3 text-left text-sm font-black text-[#241a3a] transition hover:border-[#b79bff] hover:bg-[#fcfaff]"
                    >
                      <span className="text-[#5e17eb]">#</span> {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => {
                const previousUserMessage = [...messages.slice(0, index)].reverse().find((item) => item.role === "user")?.content || "";
                const assistantContent = message.role === "assistant" ? stripInlineCitationSummary(message.content) : message.content;
                const showRecommendations =
                  message.role === "assistant" &&
                  shouldShowProgramRecommendations(message.citations, previousUserMessage, assistantContent);
                return (
                  <div key={`${message.role}-${index}-${message.content.slice(0, 12)}`} className={message.role === "user" ? "ml-auto max-w-[86%]" : "mr-auto max-w-[92%]"}>
                    <div
                      className={
                        message.role === "user"
                          ? "rounded-[1.4rem] bg-[#5e17eb] px-5 py-3 text-sm font-bold leading-7 text-white"
                          : "rounded-[1.4rem] bg-[#f4f2fb] px-5 py-3 text-sm font-bold leading-7 text-[#241a3a]"
                      }
                    >
                      {message.role === "assistant" ? <MarkdownAnswer content={assistantContent} /> : assistantContent}
                    </div>
                    {showRecommendations ? <ProgramRecommendationCards citations={message.citations || []} /> : null}
                    {message.role === "assistant" && message.citations && message.citations.length > 0 ? (
                      <CitationGroup citations={message.citations} compactMobile={mergeProfileHeader} />
                    ) : null}
                  </div>
                );
              })
            )}
            {sending ? <div className="mr-auto rounded-[1.4rem] bg-[#f4f2fb] px-5 py-3 text-sm font-black text-[#8e81b3]">正在检索资料并生成回答...</div> : null}
          </div>

          <div className={mergeProfileHeader ? "hidden border-t border-[#eee8f8] pt-4 md:block" : "border-t border-[#eee8f8] pt-4"}>
            <div className="flex items-center gap-2 rounded-full border border-[#e6def6] bg-white px-3 py-2 shadow-[0_12px_40px_rgba(80,62,125,0.08)]">
              <span className="material-symbols-outlined text-[#5e17eb]">forum</span>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendQuestion(input);
                  }
                }}
                placeholder={authed ? "问问这位嘉宾的观点和做法" : "登录后即可向嘉宾提问"}
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-bold text-[#241a3a] outline-none placeholder:text-[#b2abc8]"
              />
              <button
                type="button"
                disabled={sending || !input.trim()}
                onClick={() => sendQuestion(input)}
                className="rounded-full bg-[#5e17eb] px-5 py-2 text-sm font-black text-white transition hover:bg-[#4a11d0] disabled:cursor-not-allowed disabled:bg-[#c6b7ef]"
              >
                    提问
              </button>
            </div>
          </div>
        </div>
      </div>
      {mergeProfileHeader ? (
        <div
          className={`fixed left-0 right-0 top-0 z-[60] h-[68px] bg-white/72 shadow-[0_8px_28px_rgba(70,73,132,0.08)] backdrop-blur-md transition duration-200 md:hidden ${
            compactHeaderVisible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0 pointer-events-none"
          }`}
        >
          <div className="absolute left-[90px] right-5 top-[calc(12px+env(safe-area-inset-top))] flex h-11 min-w-0 items-center gap-2">
            <img
              src={profileAvatar}
              alt={agent?.name || fallbackName || "嘉宾"}
              className="h-8 w-8 shrink-0 rounded-full border-2 border-[#6f73ff] bg-white object-cover"
              onError={() => setAvatarFallbackActive(true)}
            />
            <div className="flex min-w-0 items-center gap-1 truncate">
              <span className="truncate text-[18px] font-black leading-none text-[#151638]">{agent?.name || fallbackName || "嘉宾智能体"}</span>
              <span className="shrink-0 text-xs font-bold leading-none text-[#7d86a5]">{agent?.title || fallbackTitle || "节目嘉宾 AI 分身"}</span>
            </div>
          </div>
        </div>
      ) : null}
      {mergeProfileHeader ? (
        <>
        {attachmentMenuOpen ? (
          <div className="fixed bottom-[calc(24px+env(safe-area-inset-bottom))] left-[30px] right-[30px] z-[81] grid grid-cols-3 gap-[18px] md:hidden">
            <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex flex-col items-center gap-2 border-0 bg-transparent p-0 text-[13px] font-black leading-none text-[#11143b]">
              <span className="relative block h-[62px] w-[62px] rounded-[22px] bg-white/90 text-[#10085f] shadow-[0_10px_24px_rgba(70,73,132,0.1)]">
                <span className="material-symbols-rounded absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 text-[30px] leading-none">photo_camera</span>
              </span>
              拍照
            </button>
            <button type="button" onClick={() => imageInputRef.current?.click()} className="flex flex-col items-center gap-2 border-0 bg-transparent p-0 text-[13px] font-black leading-none text-[#11143b]">
              <span className="relative block h-[62px] w-[62px] rounded-[22px] bg-white/90 text-[#10085f] shadow-[0_10px_24px_rgba(70,73,132,0.1)]">
                <span className="material-symbols-rounded absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 text-[30px] leading-none">image</span>
              </span>
              图片
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-2 border-0 bg-transparent p-0 text-[13px] font-black leading-none text-[#11143b]">
              <span className="relative block h-[62px] w-[62px] rounded-[22px] bg-white/90 text-[#10085f] shadow-[0_10px_24px_rgba(70,73,132,0.1)]">
                <span className="material-symbols-rounded absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 text-[30px] leading-none">description</span>
              </span>
              文件
            </button>
          </div>
        ) : null}
        <div
          className={`fixed left-[30px] right-[30px] z-[80] flex items-center gap-[10px] transition-[bottom] duration-200 md:hidden ${
            attachmentMenuOpen ? "bottom-[calc(150px+env(safe-area-inset-bottom))]" : "bottom-[calc(18px+env(safe-area-inset-bottom))]"
          }`}
        >
          {attachmentMenuOpen ? (
            <>
              <div className="pointer-events-none absolute left-[-24px] right-[-24px] top-8 z-[-1] h-[106px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(91,72,255,.36)_0%,rgba(148,163,255,.28)_44%,rgba(232,236,255,0)_80%)] blur-[24px]" />
              <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-[-2] h-[calc(168px+env(safe-area-inset-bottom))] bg-[linear-gradient(180deg,rgba(232,236,255,0)_0%,rgba(232,236,255,.88)_34%,rgba(232,236,255,.98)_64%,#e8ecff_100%)]" />
            </>
          ) : null}
          <div className={`relative flex min-w-0 flex-1 items-center ${voiceListening || voiceHolding ? "scale-[1.012]" : ""}`}>
            {uploadedAttachment ? (
              <div className="absolute bottom-[66px] left-2 right-2 z-20 flex min-h-[42px] items-center gap-2 rounded-[18px] bg-white/95 px-2.5 py-1.5 text-xs font-extrabold text-[#6b7280] shadow-[0_10px_24px_rgba(70,73,132,0.12)]">
                {uploadedAttachment.kind === "file" ? (
                  <span className="material-symbols-rounded flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-[#f1efff] text-[19px] text-[#1b1464]">description</span>
                ) : (
                  <img src={uploadedAttachment.dataUrl} alt="已上传图片" className="h-[30px] w-[30px] rounded-[10px] object-cover" />
                )}
                <span className="min-w-0 flex-1 truncate">{uploadedAttachment.name}</span>
                <button type="button" aria-label="移除图片" onClick={() => setUploadedAttachment(null)} className="material-symbols-rounded border-0 bg-transparent text-[18px] text-slate-400">close</button>
              </div>
            ) : null}
            <button
              type="button"
              aria-label="长按输入框语音输入"
              onClick={toggleVoiceInput}
              className={`absolute left-[6px] top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-0 p-0 text-[23px] shadow-[0_5px_14px_rgba(70,73,132,0.08)] ${
                voiceListening ? "bg-[linear-gradient(135deg,#5b48ff,#7a45f4)] text-white" : voiceHolding ? "bg-[#f2efff] text-[#5b48ff]" : "bg-white text-[#11143b]"
              }`}
            >
              <span className="material-symbols-rounded">{voiceListening ? "graphic_eq" : "record_voice_over"}</span>
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={onInputChange}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendQuestion(input);
                }
              }}
              onPointerDown={startInputVoicePress}
              onPointerUp={endInputVoicePress}
              onPointerCancel={endInputVoicePress}
              onPointerLeave={endInputVoicePress}
              placeholder={authed ? "对话内容已开启隐私保护" : "登录后即可向嘉宾提问"}
              rows={1}
              className={`h-[52px] max-h-[104px] min-h-[52px] w-full resize-none overflow-hidden rounded-full border-0 bg-white/95 pb-0 pt-[14px] pl-[54px] pr-[52px] text-[15px] font-[760] leading-[22px] text-[#11143b] shadow-[0_10px_26px_rgba(70,73,132,0.12)] outline-none transition-[box-shadow,transform] duration-[180ms] placeholder:text-[#a6aec4] ${
                attachmentMenuOpen ? "shadow-[0_18px_38px_rgba(70,73,132,.2),0_28px_58px_rgba(91,72,255,.18)]" : ""
              }`}
            />
            <button
              type="button"
              disabled={sending || (!input.trim() && !uploadedAttachment)}
              onClick={() => sendQuestion(input)}
              className="absolute right-[5px] top-1/2 flex h-[42px] w-[42px] -translate-y-1/2 items-center justify-center rounded-full border-0 bg-[linear-gradient(135deg,#5b48ff,#7a45f4)] p-0 text-white shadow-[0_8px_18px_rgba(91,72,255,0.25)] disabled:opacity-[0.42]"
            >
              <span className="material-symbols-rounded text-[22px]">{sending ? "more_horiz" : "send"}</span>
            </button>
          </div>
          <button
            type="button"
            aria-label="添加附件"
            onClick={() => setAttachmentMenuOpen((value) => !value)}
            className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-0 bg-white/95 p-0 text-[#11143b] shadow-[0_10px_26px_rgba(70,73,132,0.1)] ${
              attachmentMenuOpen ? "text-[#5b48ff] shadow-[0_14px_30px_rgba(91,72,255,.18)]" : ""
            }`}
          >
            <span className="material-symbols-rounded text-[29px]">{attachmentMenuOpen ? "close" : "add"}</span>
          </button>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onImagePicked} />
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImagePicked} />
          <input ref={fileInputRef} type="file" className="hidden" onChange={onFilePicked} />
        </div>
        </>
      ) : null}
    </section>
  );
};

export default GuestAgentChatPanel;
