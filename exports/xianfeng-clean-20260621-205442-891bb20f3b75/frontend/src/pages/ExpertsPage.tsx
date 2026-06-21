import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { Link, useSearchParams } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import Pagination from "../components/Pagination";
import WishModal from "../components/WishModal";
import { publicApi, PublicGuest } from "../services/api";
import { useIsMobilePager } from "../hooks/useIsMobilePager";
import { useXiaowanziEmbeddedLayer } from "../utils/xiaowanziLayer";
import {
  GUEST_FALLBACK_AVATAR_ARCHIVE_IMG_CLASS,
  GUEST_FALLBACK_AVATAR_CARD_IMG_CLASS,
  GUEST_FALLBACK_AVATAR_FRAME_CLASS,
  GUEST_FALLBACK_AVATAR_SRC,
  GUEST_REAL_AVATAR_ARCHIVE_IMG_CLASS,
  GUEST_REAL_AVATAR_CARD_IMG_CLASS,
  GUEST_REAL_AVATAR_FRAME_CLASS,
  resolveGuestAvatar,
} from "../utils/guestAvatar";

const PAGE_SIZE = 15;
const XIAOWANZI_HOME_NAV_HEIGHT_CLASS = "h-[56px]";
const XIAOWANZI_HOME_NAV_BUTTON_TOP_CLASS = "top-[calc(8px+env(safe-area-inset-top))]";
const XIAOWANZI_HOME_NAV_SEARCH_TOP_CLASS = "top-[calc(6px+env(safe-area-inset-top))]";
const XIAOWANZI_HOME_NAV_FLOATING_TOP_CLASS = "top-[56px]";
const EXPERTS_SUPER_MAIN_TOP_PADDING_CLASS = "pt-[68px]";
const XIAOWANZI_HOME_NAV_DOCK_SCROLL_Y = 56;

function mergeById<T extends { _id: string }>(current: T[], next: T[]) {
  const seen = new Set(current.map((item) => item._id));
  return [...current, ...next.filter((item) => !seen.has(item._id))];
}

function buildGuestSuggestedQuestions(guest: PublicGuest): string[] {
  const name = String(guest.name || "").trim() || "这位嘉宾";
  const keyword =
    (Array.isArray(guest.contentTags) ? guest.contentTags.find((tag) => String(tag || "").trim()) : "") ||
    (guest.referenceCount ? "公开内容" : "") ||
    (guest.programCount ? "参与节目" : "") ||
    "家庭教育";
  return [
    `${name}的核心观点是什么？`,
    `关于${keyword}，${name}有哪些具体建议？`,
    "如果我想马上行动，可以先做哪三件事？",
  ];
}

const ExpertsPage: React.FC = () => {
  const token = useSelector((state: RootState) => state.user.token);
  const [guests, setGuests] = useState<PublicGuest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [superSearchDocked, setSuperSearchDocked] = useState(false);
  const [superSearchExpanded, setSuperSearchExpanded] = useState(false);
  const [suggestedQuestionsByGuest, setSuggestedQuestionsByGuest] = useState<Record<string, string[]>>({});
  const [topicTick, setTopicTick] = useState(0);
  const superSearchInputRef = useRef<HTMLInputElement | null>(null);
  const superModePage = useXiaowanziEmbeddedLayer();
  const isMobilePager = useIsMobilePager();
  const xwReturnParam = searchParams.get("xw_return") || "";
  const showSuperQuickSearch = superModePage && superSearchDocked && !superSearchExpanded;
  const showSuperFloatingSearch = superModePage && superSearchDocked && superSearchExpanded;
  const firstAgentGuestId = useMemo(() => guests.find((guest) => guest.agentEnabled === true)?._id || "", [guests]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const showInitialLoading = loading && (!isMobilePager || safePage <= 1);

  // 从 URL search params 读取搜索和分页
  useEffect(() => {
    const q = searchParams.get("q") || "";
    const tag = searchParams.get("tag") || "";
    const p = Number(searchParams.get("page"));
    setSearch(q);
    setSelectedTag(tag);
    setPage(Number.isFinite(p) && p > 0 ? Math.floor(p) : 1);
  }, []);

  const quickFilterTags = useMemo(() => {
    const tags = filterTags.filter((tag) => tag.trim());
    if (selectedTag && !tags.includes(selectedTag)) return [selectedTag, ...tags];
    return tags;
  }, [filterTags, selectedTag]);

  // 加载数据
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    publicApi
      .getGuests({ search: search || undefined, tag: selectedTag || undefined, page: safePage, pageSize: PAGE_SIZE })
      .then((response) => {
        if (!alive) return;
        const data = response.data;
        const list = Array.isArray(data) ? data : (data.guests || []);
        setGuests((prev) => (isMobilePager && safePage > 1 ? mergeById(prev, list) : list));
        setFilterTags(Array.isArray(data.filterTags) ? data.filterTags : []);
        setTotal(data.total ?? list.length);
      })
      .catch((err: any) => {
        if (!alive) return;
        setError(err?.response?.data?.message || err?.message || "加载先疯智库失败");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isMobilePager, safePage, search, selectedTag]);

  useEffect(() => {
    if (!superModePage) return;
    const updateDockedSearch = () => {
      const docked = window.scrollY > XIAOWANZI_HOME_NAV_DOCK_SCROLL_Y;
      setSuperSearchDocked(docked);
      if (!docked) setSuperSearchExpanded(false);
    };
    updateDockedSearch();
    window.addEventListener("scroll", updateDockedSearch, { passive: true });
    return () => window.removeEventListener("scroll", updateDockedSearch);
  }, [superModePage]);

  useEffect(() => {
    if (!showSuperFloatingSearch) return;
    window.setTimeout(() => {
      superSearchInputRef.current?.focus();
    }, 40);
  }, [showSuperFloatingSearch]);

  useEffect(() => {
    if (!superModePage || guests.length === 0) {
      setSuggestedQuestionsByGuest({});
      return;
    }
    let alive = true;
    const firstAgentGuest = guests.find((guest) => guest._id === firstAgentGuestId);
    if (!firstAgentGuest?._id) {
      setSuggestedQuestionsByGuest({});
      return;
    }
    publicApi
      .getGuestAgent(firstAgentGuest._id)
      .then((response) => ({
        guestId: firstAgentGuest._id,
        suggestedQuestions: (response.data?.agent?.suggestedQuestions || []).filter(Boolean).slice(0, 4),
      }))
      .catch(() => ({
        guestId: firstAgentGuest._id,
        suggestedQuestions: buildGuestSuggestedQuestions(firstAgentGuest),
      }))
      .then((item) => {
        if (!alive) return;
        setSuggestedQuestionsByGuest(item.suggestedQuestions.length > 0 ? { [item.guestId]: item.suggestedQuestions } : {});
      });
    return () => {
      alive = false;
    };
  }, [firstAgentGuestId, guests, superModePage]);

  useEffect(() => {
    if (!superModePage) return;
    const timer = window.setInterval(() => {
      setTopicTick((value) => value + 1);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [superModePage]);

  // 同步 page 到 search
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  // 更新 URL search params
  useEffect(() => {
    const next = new URLSearchParams();
    if (superModePage) next.set("xw_layer", "1");
    if (xwReturnParam) next.set("xw_return", xwReturnParam);
    if (search) next.set("q", search);
    if (selectedTag) next.set("tag", selectedTag);
    if (safePage > 1) next.set("page", String(safePage));
    setSearchParams(next, { replace: true });
  }, [search, selectedTag, safePage, setSearchParams, superModePage, xwReturnParam]);

  const renderQuickFilters = (compact = false) => {
    if (loading && quickFilterTags.length === 0) return null;

    const baseButtonClass = compact
      ? "h-10 shrink-0 rounded-full px-5 text-[15px] font-black transition"
      : "h-11 shrink-0 rounded-full px-6 text-sm font-black transition";
    const activeClass = "bg-[#5e17eb] text-white shadow-[0_10px_24px_rgba(94,23,235,0.22)]";
    const inactiveClass = "border border-[#d9c8ff] bg-white text-[#5e17eb] shadow-[0_8px_22px_rgba(94,23,235,0.06)] hover:bg-[#f6f0ff]";

    return (
      <section className={compact ? "mb-4 -mx-3 overflow-x-auto px-3 [scrollbar-width:none]" : "mt-6 overflow-x-auto pb-1 [scrollbar-width:none]"}>
        <div className="flex min-w-max items-center gap-3">
          <button
            type="button"
            onClick={() => { setSelectedTag(""); setPage(1); }}
            className={`${baseButtonClass} ${selectedTag ? inactiveClass : activeClass}`}
          >
            全部
          </button>
          {quickFilterTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => { setSelectedTag(tag === selectedTag ? "" : tag); setPage(1); }}
              className={`${baseButtonClass} ${selectedTag === tag ? activeClass : inactiveClass}`}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#1f1d1a]">
      {/* ExpertsPage: large flowing gradient waves + layered grid */}
      <style>{`
        @keyframes expWave1 {
          0%,100% { transform: translate3d(0,0,0) scale(1); opacity: .6; }
          30% { transform: translate3d(3%,-2%,0) scale(1.08); opacity: .85; }
          70% { transform: translate3d(-2%,1.5%,0) scale(.94); opacity: .7; }
        }
        @keyframes expWave2 {
          0%,100% { transform: translate3d(0,0,0) scale(.95); opacity: .5; }
          50% { transform: translate3d(-2.5%,2%,0) scale(1.15); opacity: .78; }
        }
        @keyframes expWave3 {
          0%,100% { transform: translate3d(0,0,0) scale(1.02); opacity: .5; }
          40% { transform: translate3d(2%,-1.5%,0) scale(.9); opacity: .75; }
          85% { transform: translate3d(-1.5%,2.5%,0) scale(1.18); opacity: .82; }
        }
        @media (max-width: 768px) {
          .experts-mobile-main { padding-top: 70px !important; padding-bottom: calc(120px + env(safe-area-inset-bottom)) !important; }
          .experts-mobile-hero { padding: 16px !important; border-radius: 20px !important; }
          .experts-mobile-title { font-size: 30px !important; line-height: 1.15 !important; }
          .experts-mobile-grid { gap: 12px !important; }
          .experts-mobile-card { padding: 12px !important; border-radius: 16px !important; }
        }
        .experts-super-main {
          width: min(calc(100vw - 24px), 560px);
          max-width: 100%;
        }
        @media (max-width: 390px) {
          .experts-super-main {
            width: min(calc(100vw - 16px), 560px);
          }
          .experts-super-card {
            gap: 10px;
            padding: 12px;
          }
          .experts-super-avatar {
            width: 70px;
            height: 70px;
          }
        }
        .experts-super-search-input,
        .experts-super-search-input:focus,
        .experts-super-search-input:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          border-color: transparent !important;
          -webkit-appearance: none;
          appearance: none;
        }
        @keyframes expTopicRise {
          0% { opacity: 0; transform: translateY(10px); }
          18%,82% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-8px); }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(118,83,205,0.06)_2px,transparent_2px),linear-gradient(90deg,rgba(118,83,205,0.04)_2px,transparent_2px)] bg-[size:50px_50px]" />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 -left-20 h-[450px] w-[450px] rounded-full bg-[radial-gradient(circle,rgba(143,100,255,0.15),transparent_58%)]" style={{ animation: "expWave1 12s ease-in-out infinite" }} />
        <div className="absolute top-[35%] -right-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(129,75,255,0.11),transparent_60%)]" style={{ animation: "expWave2 16s ease-in-out infinite 3s" }} />
        <div className="absolute -bottom-24 left-[25%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(153,102,255,0.1),transparent_55%)]" style={{ animation: "expWave3 14s ease-in-out infinite 6s" }} />
      </div>
      {!superModePage ? (
        <GlobalPublicNav
          compactMobile
          showSearch
          searchPlaceholder="搜索嘉宾姓名/头衔/研究方向"
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
        />
      ) : null}
      {superModePage ? (
        <header className={`fixed left-0 right-0 top-0 z-[70] flex ${XIAOWANZI_HOME_NAV_HEIGHT_CLASS} items-center justify-center bg-[#f7f5ff]/95 px-5 pt-[env(safe-area-inset-top)] backdrop-blur`}>
          <button
            type="button"
            aria-label="返回小玩子"
            onClick={() => {
              try {
                sessionStorage.setItem("xiaowanzi_return_home_v1", "1");
              } catch (_error) {}
              window.location.href = "/programs/list?xw_restore=xiaowanzi";
            }}
            className={`absolute left-4 ${XIAOWANZI_HOME_NAV_BUTTON_TOP_CLASS} inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent text-[#11143b]`}
          >
            <span className="material-symbols-outlined text-[30px]">arrow_back</span>
          </button>
          <div className="text-[15px] font-black tracking-tight text-[#11143b]">先疯智库</div>
          {showSuperQuickSearch ? (
            <button
              type="button"
              aria-label="展开搜索框"
              onClick={() => setSuperSearchExpanded(true)}
              className={`absolute right-4 ${XIAOWANZI_HOME_NAV_SEARCH_TOP_CLASS} inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#11143b] shadow-[0_12px_28px_rgba(70,73,132,0.12)] transition active:scale-95`}
            >
              <span className="material-symbols-outlined text-[27px]">search</span>
            </button>
          ) : null}
        </header>
      ) : null}
      {showSuperFloatingSearch ? (
        <div className={`fixed left-0 right-0 ${XIAOWANZI_HOME_NAV_FLOATING_TOP_CLASS} z-[65] px-3`}>
          <section className="experts-super-main mx-auto w-full overflow-hidden rounded-[24px] bg-white/95 px-3 py-3 shadow-[0_18px_45px_rgba(70,73,132,0.12)] backdrop-blur">
            <label className="flex h-11 items-center gap-3 rounded-full bg-[#f5f3ff] px-4 text-[#8f93b3] focus-within:ring-0">
              <span className="material-symbols-outlined text-[22px]">search</span>
              <input
                ref={superSearchInputRef}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSuperSearchExpanded(false);
                }}
                placeholder="搜索嘉宾、主题、关键词"
                className="experts-super-search-input min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-[#11143b] outline-none ring-0 placeholder:text-[#9aa0bd] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                style={{ outline: "none", boxShadow: "none" }}
              />
            </label>
          </section>
        </div>
      ) : null}
      <main className={`${superModePage ? `experts-super-main mx-auto pb-[calc(96px+env(safe-area-inset-bottom))] ${EXPERTS_SUPER_MAIN_TOP_PADDING_CLASS}` : "experts-mobile-main mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8"}`}>
        {!superModePage ? (
          <section className="experts-mobile-hero group relative overflow-hidden rounded-[2rem] border border-[#d8d0ef] bg-[radial-gradient(circle_at_top_left,_rgba(143,100,255,0.12),_transparent_32%),linear-gradient(135deg,_#f4f1fd_0%,_#fff_52%,_#f0ebff_100%)] p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)] sm:p-10">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#5b3fa1]">
                Experts
              </div>
              <h1 className="experts-mobile-title mt-5 text-4xl font-black leading-[1.14] tracking-tight text-[#241a3a] sm:text-5xl">
                跟随分享者的视角，往更深、更广的维度延展思索
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6f66ad] sm:text-base">
                从节目延伸到人物。这里汇总节目中嘉宾的背景信息、著作、公开参考链接与拓展内容，帮助你更快判断这位嘉宾的经验、方法与视角是否适合当前问题。
              </p>
            </div>
          </section>
        ) : (
          <section className="mb-4 w-full overflow-hidden rounded-[26px] bg-white/95 px-4 py-3 shadow-[0_18px_45px_rgba(70,73,132,0.08)]">
            <label className="flex h-12 items-center gap-3 rounded-full bg-[#f5f3ff] px-4 text-[#8f93b3] focus-within:ring-0">
              <span className="material-symbols-outlined text-[22px]">search</span>
              <input
                ref={!showSuperFloatingSearch ? superSearchInputRef : undefined}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="搜索嘉宾、主题、关键词"
                className="experts-super-search-input min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-[#11143b] outline-none ring-0 placeholder:text-[#9aa0bd] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                style={{ outline: "none", boxShadow: "none" }}
              />
            </label>
          </section>
        )}

        {renderQuickFilters(superModePage)}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-500">{error}</div>
        ) : null}

        <section className={`${superModePage ? "grid w-full grid-cols-1 gap-3" : "experts-mobile-grid mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"}`}>
          {showInitialLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className={`animate-pulse border border-[#e2dcf0] bg-white ${superModePage ? "w-full rounded-[24px] p-4" : "rounded-[1.7rem] p-5"}`}>
                {superModePage ? (
                  <div className="flex gap-4">
                    <div className="h-[78px] w-[78px] rounded-full bg-[#ece3f7]" />
                    <div className="flex-1">
                      <div className="h-5 w-1/2 rounded bg-[#ece3f7]" />
                      <div className="mt-3 h-4 w-4/5 rounded bg-[#ece3f7]" />
                      <div className="mt-3 h-12 rounded bg-[#ece3f7]" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-48 rounded-[1.4rem] bg-[#ece3f7]" />
                    <div className="mt-4 h-6 w-2/3 rounded bg-[#ece3f7]" />
                    <div className="mt-3 h-4 w-1/2 rounded bg-[#ece3f7]" />
                    <div className="mt-4 h-16 rounded bg-[#ece3f7]" />
                  </>
                )}
              </div>
            ))
          ) : guests.length === 0 ? (
            <div className="col-span-full rounded-[1.7rem] border border-dashed border-[#d2c5ee] bg-white px-6 py-12 text-center text-sm text-[#8e81b3]">
              暂无符合条件的嘉宾资料。
            </div>
          ) : (
            guests.map((guest, index) => {
              const showQuestionCard = superModePage && guest.agentEnabled === true && guest._id === firstAgentGuestId;
              const suggestedQuestions = showQuestionCard ? suggestedQuestionsByGuest[guest._id] || [] : [];
              const guestQuestions = showQuestionCard ? (suggestedQuestions.length ? suggestedQuestions : buildGuestSuggestedQuestions(guest)) : [];
              const activeQuestion = guestQuestions[topicTick % guestQuestions.length] || "";
              const { src: avatarSrc, isFallback: isFallbackAvatar } = resolveGuestAvatar(guest.avatar);
              const avatarLoading: "eager" | "lazy" = index < 6 ? "eager" : "lazy";
              const avatarFetchPriority: "high" | "auto" = index < 6 ? "high" : "auto";
              return (
                <Link
                  key={guest._id}
                  to={`/experts/${encodeURIComponent(guest._id)}${superModePage ? "?xw_layer=1" : ""}`}
                  className={superModePage ? "experts-super-card group flex w-full min-w-0 gap-4 rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_18px_44px_rgba(70,73,132,0.08)] transition active:scale-[0.99]" : "experts-mobile-card group overflow-hidden rounded-[1.7rem] border border-[#e2dcf0] bg-white p-5 shadow-[0_20px_60px_rgba(63,38,112,0.06)] transition hover:-translate-y-1 hover:border-[#b79bff] hover:shadow-[0_28px_80px_rgba(63,38,112,0.12)]"}
                >
                {superModePage ? (
                  <>
                    <div className="experts-super-avatar relative h-[78px] w-[78px] shrink-0">
                      <div className={`flex h-full w-full items-center justify-center overflow-hidden rounded-3xl p-px ring-2 ring-[#5e17eb]/10 ${isFallbackAvatar ? GUEST_FALLBACK_AVATAR_FRAME_CLASS : GUEST_REAL_AVATAR_FRAME_CLASS}`}>
                        <img
                          src={avatarSrc}
                          alt={guest.name || "嘉宾头像"}
                          loading={avatarLoading}
                          decoding="async"
                          fetchPriority={avatarFetchPriority}
                          className={isFallbackAvatar ? GUEST_FALLBACK_AVATAR_CARD_IMG_CLASS : GUEST_REAL_AVATAR_CARD_IMG_CLASS}
                          onError={(event) => {
                            event.currentTarget.src = GUEST_FALLBACK_AVATAR_SRC;
                            event.currentTarget.className = GUEST_FALLBACK_AVATAR_CARD_IMG_CLASS;
                            if (event.currentTarget.parentElement) event.currentTarget.parentElement.style.background = "#fff";
                          }}
                        />
                      </div>
                      {guest.agentEnabled === true ? (
                        <span className="absolute right-[-3px] top-1 rounded-full bg-[#6257ff] px-1.5 py-0.5 text-[10px] font-black leading-none text-white ring-2 ring-white">AI</span>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <h2 className="min-w-0 truncate text-[20px] font-black leading-tight text-[#11143b]">{guest.name || "未命名嘉宾"}</h2>
                        <span className="shrink-0 rounded-md bg-white px-0.5 py-0.5 text-[11px] font-black leading-none text-[#5e57ff]">{guest.title || "嘉宾"}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold leading-none text-[#7d6ca7]">节目 {guest.programCount || 0}</span>
                        {Number(guest.referenceCount || 0) > 0 ? (
                          <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold leading-none text-[#7d6ca7]">公开内容 {guest.referenceCount}</span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-6 text-[#7d86a5]">{guest.bio || "基于嘉宾档案、节目内容和公开资料，整理可追溯的观点与方法。"}</p>
                      {activeQuestion ? (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="min-w-0 flex-1 overflow-hidden rounded-full bg-[#f3f2fb] px-4 py-2 text-[13px] font-black text-[#11143b]">
                            <div
                              key={`${guest._id}-${activeQuestion}`}
                              className="truncate"
                              style={{ animation: "expTopicRise 3.2s ease-in-out both" }}
                            >
                              {activeQuestion}
                            </div>
                          </div>
                          <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#5e17eb] px-4 py-2 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(94,23,235,0.22)]">
                            <span className="material-symbols-outlined text-[17px]">auto_awesome</span>
                            去问问
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                <div className={`relative overflow-hidden rounded-[1.4rem] ${isFallbackAvatar ? "bg-white" : "bg-[linear-gradient(135deg,_#1f143a,_#4b1db2_44%,_#b79bff)]"}`}>
                  <img
                    src={avatarSrc}
                    alt={guest.name || "嘉宾头像"}
                    loading={avatarLoading}
                    decoding="async"
                    fetchPriority={avatarFetchPriority}
                    className={isFallbackAvatar ? GUEST_FALLBACK_AVATAR_ARCHIVE_IMG_CLASS : GUEST_REAL_AVATAR_ARCHIVE_IMG_CLASS}
                    style={{ contentVisibility: 'auto' }}
                    onError={(event) => {
                      event.currentTarget.src = GUEST_FALLBACK_AVATAR_SRC;
                      event.currentTarget.className = GUEST_FALLBACK_AVATAR_ARCHIVE_IMG_CLASS;
                      if (event.currentTarget.parentElement) event.currentTarget.parentElement.style.background = "#fff";
                    }}
                  />
                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#5e17eb]">
                    Guest Archive
                  </div>
                </div>
                <div className="mt-5">
                  <div className="flex items-baseline gap-3 whitespace-nowrap">
                    <h2 className="min-w-0 truncate text-2xl leading-none font-black tracking-tight text-[#24180a]">{guest.name || "未命名嘉宾"}</h2>
                    <span className="shrink-0 text-xs leading-none font-black uppercase tracking-[0.22em] text-[#5e17eb]">{guest.title || "节目嘉宾"}</span>
                  </div>
                  <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#6f66ad]">{guest.bio || "暂无简介，后续可在后台补充嘉宾公开资料与人物介绍。"}</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                    关联节目 {guest.programCount || 0}
                  </span>
                  {Number(guest.referenceCount || 0) > 0 ? (
                    <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                      公开资料 {guest.referenceCount}
                    </span>
                  ) : null}
                </div>
                  </>
                )}
                </Link>
              );
            })
          )}
        </section>

        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          mobileAutoLoad
          mobileHasMore={safePage < totalPages}
          mobileLoading={loading && isMobilePager && safePage > 1}
          onMobileLoadMore={() => setPage((value) => Math.min(totalPages, value + 1))}
          onPageChange={setPage}
        />

        {/* 许愿入口 — 列表页底部小字 */}
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              const isLoggedIn = !!token || !!localStorage.getItem("token");
              if (!isLoggedIn) {
                document.dispatchEvent(new CustomEvent("xf-show-login-modal", { detail: { title: "登录后即可互动", description: "登录后可提交心愿、了解教育行业顶尖从业者。" } }));
                return;
              }
              setWishModalOpen(true);
            }}
            className="transition hover:text-[#5e17eb]"
            style={{ fontSize: 7.7, color: "#b7a9d6" }}
          >
            🙏 女施主又来许愿了
          </button>
        </div>

        <WishModal
          open={wishModalOpen}
          onClose={() => setWishModalOpen(false)}
          guestId="guest-list"
        />
      </main>
    </div>
  );
};

export default ExpertsPage;
