import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import GuestWishButton from "../components/GuestWishButton";
import GuestAgentChatPanel from "../components/GuestAgentChatPanel";
import { toXiaowanziPublicContentUrl, useXiaowanziEmbeddedLayer } from "../utils/xiaowanziLayer";
import { uniqueBookSourceNames } from "../utils/bookSourceNames";
import {
  GUEST_FALLBACK_AVATAR_DETAIL_IMG_CLASS,
  GUEST_FALLBACK_AVATAR_FRAME_CLASS,
  GUEST_REAL_AVATAR_DETAIL_IMG_CLASS,
  GUEST_REAL_AVATAR_FRAME_CLASS,
  resolveGuestAvatar,
} from "../utils/guestAvatar";
import { GuestPublication, GuestSocialProfile, ListenerBenefit, publicApi, PublicGuest, PublicGuestDetail } from "../services/api";

const PUBLICATION_LABELS: Record<GuestPublication["type"], string> = {
  paper: "论文",
  book: "著作",
  interview: "采访",
  media: "文章",
  other: "拓展",
};

function fmtDate(value?: string | null) {
  if (!value) return "未发布";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未发布";
  return date.toLocaleDateString("zh-CN");
}

function groupPublications(items: GuestPublication[]) {
  const buckets: Record<GuestPublication["type"], GuestPublication[]> = {
    paper: [],
    book: [],
    interview: [],
    media: [],
    other: [],
  };
  items.forEach((item) => {
    buckets[item.type || "other"].push(item);
  });
  return buckets;
}

function extractBookSourceGuestId(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input.trim();
  if (typeof input === "object" && input !== null) {
    return String((input as { _id?: string })._id || "").trim();
  }
  return "";
}

function hasMeaningfulGuestContent(guest: Partial<PublicGuestDetail> | null | undefined) {
  if (!guest) return false;
  return Boolean(
    String(guest.name || "").trim() ||
      String(guest.title || "").trim() ||
      String(guest.bio || "").trim() ||
      String(guest.avatar || "").trim() ||
      String(guest.profileUrl || "").trim() ||
      (Array.isArray(guest.profileReferences) && guest.profileReferences.length > 0) ||
      (Array.isArray(guest.socialProfiles) && guest.socialProfiles.length > 0) ||
      (Array.isArray(guest.publications) && guest.publications.length > 0) ||
      (Array.isArray(guest.relatedPrograms) && guest.relatedPrograms.length > 0) ||
      Number(guest.programCount || 0) > 0 ||
      Number(guest.referenceCount || 0) > 0
  );
}

function mergeGuestSummary(detail: Partial<PublicGuestDetail> | null | undefined, summary: PublicGuest | null | undefined): PublicGuestDetail | null {
  if (!detail && !summary) return null;
  return {
    _id: String(detail?._id || summary?._id || ""),
    name: String(detail?.name || summary?.name || "").trim(),
    title: String(detail?.title || summary?.title || "").trim(),
    bio: String(detail?.bio || summary?.bio || "").trim(),
    avatar: String(detail?.avatar || summary?.avatar || "").trim(),
    profileUrl: String(detail?.profileUrl || summary?.profileUrl || "").trim(),
    profileReferences: Array.isArray(detail?.profileReferences)
      ? detail!.profileReferences
      : Array.isArray(summary?.profileReferences)
      ? summary!.profileReferences
      : [],
    socialProfiles: Array.isArray(detail?.socialProfiles)
      ? detail!.socialProfiles
      : Array.isArray(summary?.socialProfiles)
      ? summary!.socialProfiles
      : [],
    publications: Array.isArray(detail?.publications)
      ? detail!.publications
      : Array.isArray(summary?.publications)
      ? summary!.publications
      : [],
    listenerBenefits: Array.isArray(detail?.listenerBenefits)
      ? detail!.listenerBenefits
      : Array.isArray(summary?.listenerBenefits)
      ? summary!.listenerBenefits
      : [],
    agentEnabled: detail?.agentEnabled === true || summary?.agentEnabled === true,
    programCount: Number(detail?.programCount || summary?.programCount || 0),
    referenceCount: Number(detail?.referenceCount || summary?.referenceCount || 0),
    relatedPrograms: Array.isArray(detail?.relatedPrograms) ? detail!.relatedPrograms : [],
  };
}

const ExpertDetailPage: React.FC = () => {
  const { id: routeId = "" } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const id = useMemo(() => {
    const fromRoute = String(routeId || "").trim();
    if (fromRoute) return decodeURIComponent(fromRoute);
    const match = pathname.match(/^\/experts\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }, [pathname, routeId]);
  const [guest, setGuest] = useState<PublicGuestDetail | null>(null);
  const [boundBooks, setBoundBooks] = useState<any[]>([]);
  const [authoredBooks, setAuthoredBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileInfoTab, setMobileInfoTab] = useState<"programs" | "publications">("programs");
  const [avatarFallbackActive, setAvatarFallbackActive] = useState(false);
  const isGuestAgentLayer = useXiaowanziEmbeddedLayer();
  const showGuestAgent = guest?.agentEnabled === true && isGuestAgentLayer;

  useEffect(() => {
    setAvatarFallbackActive(false);
  }, [guest?.avatar]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const detailResponse = await publicApi.getGuest(id);
        if (!alive) return;
        const detailData = detailResponse.data || null;

        if (hasMeaningfulGuestContent(detailData)) {
          const merged = mergeGuestSummary(detailData, null);
          setGuest(merged);
          if (merged?._id) {
            const booksResponse = await publicApi.getBooks();
            const books = Array.isArray(booksResponse.data) ? booksResponse.data : [];
            const bound = books.filter((book) => extractBookSourceGuestId(book.sourceGuestId) === merged._id);
            setBoundBooks(bound);
            // 著作：author 匹配嘉宾名字
            const guestName = (merged.name || "").trim();
            const authored = guestName ? books.filter((book) => {
              const author = (book.author || "").trim();
              return author && (author === guestName || author.includes(guestName) || guestName.includes(author));
            }) : [];
            setAuthoredBooks(authored);
          } else {
            setBoundBooks([]);
            setAuthoredBooks([]);
          }
          return;
        }

        const listResponse = await publicApi.getGuests();
        if (!alive) return;
        const summary = (Array.isArray(listResponse.data) ? listResponse.data : []).find((item) => item._id === id) || null;
        const mergedGuest = mergeGuestSummary(detailData, summary);

        if (hasMeaningfulGuestContent(mergedGuest)) {
          setGuest(mergedGuest);
          if (mergedGuest?._id) {
            const booksResponse = await publicApi.getBooks();
            const books = Array.isArray(booksResponse.data) ? booksResponse.data : [];
            const bound = books.filter((book) => extractBookSourceGuestId(book.sourceGuestId) === mergedGuest._id);
            setBoundBooks(bound);
            // 著作：author 匹配嘉宾名字
            const guestName = (mergedGuest.name || "").trim();
            const authored = guestName ? books.filter((book) => {
              const author = (book.author || "").trim();
              return author && (author === guestName || author.includes(guestName) || guestName.includes(author));
            }) : [];
            setAuthoredBooks(authored);
          } else {
            setBoundBooks([]);
            setAuthoredBooks([]);
          }
          return;
        }

        setError("嘉宾详情暂未同步完成");
      } catch (err: any) {
        if (!alive) return;
        setBoundBooks([]);
        setAuthoredBooks([]);
        setError(err?.response?.data?.message || err?.message || "加载嘉宾详情失败");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const profileReferences = useMemo(
    () => (Array.isArray(guest?.profileReferences) ? guest!.profileReferences.filter((item) => String(item?.url || "").trim()) : []),
    [guest]
  );
  const socialProfiles = useMemo(
    () =>
      Array.isArray(guest?.socialProfiles)
        ? guest.socialProfiles.filter((item) => String(item?.platform || "").trim() || String(item?.label || "").trim() || String(item?.url || "").trim())
        : [],
    [guest]
  );
  const publications = useMemo(
    () => (Array.isArray(guest?.publications) ? guest.publications.filter((item) => String(item?.url || "").trim() && String(item?.title || "").trim()) : []),
    [guest]
  );
  const listenerBenefits = useMemo(
    () => {
      if (!Array.isArray(guest?.listenerBenefits)) return [];
      return guest.listenerBenefits
        .filter((item) => String(item?.title || "").trim())
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    [guest]
  );
  const relatedPrograms = useMemo(
    () => (Array.isArray(guest?.relatedPrograms) ? guest.relatedPrograms.filter((item) => String(item?._id || "").trim()) : []),
    [guest]
  );
  const publicationGroups = useMemo(() => groupPublications(publications), [publications]);
  const { src: guestAvatar, isFallback: isGuestFallbackAvatar } = resolveGuestAvatar(guest?.avatar, avatarFallbackActive);
  const hasSocialSection = socialProfiles.length > 0;
  const hasPublicationSection = publications.length > 0 || profileReferences.length > 0;
  const hasRelatedProgramsSection = relatedPrograms.length > 0;
  const hasListenerBenefitsSection = listenerBenefits.length > 0;
  const mobilePublicationItems = useMemo(
    () => [
      ...publications.map((item) => ({
        key: item.url,
        title: item.title || "公开内容",
        subtitle: item.source || item.publishedAt || item.type || "公开参考链接",
        url: item.url,
      })),
      ...profileReferences.map((item: any) => ({
        key: item.url,
        title: item.label || item.source || item.title || "公开参考链接",
        subtitle: item.source || item.type || "公开资料",
        url: item.url,
      })),
      ...socialProfiles.map((item: GuestSocialProfile, index: number) => ({
        key: item.url || `${item.platform || "social"}-${item.label || index}`,
        title: item.label || item.url || "社交媒体",
        subtitle: item.platform || "社交媒体",
        url: item.url,
      })),
    ].filter((item) => String(item.url || "").trim()),
    [profileReferences, publications, socialProfiles]
  );
  const activeMobileInfoTab =
    mobileInfoTab === "programs" && !hasRelatedProgramsSection && hasPublicationSection
      ? "publications"
      : mobileInfoTab === "publications" && !hasPublicationSection && hasRelatedProgramsSection
      ? "programs"
      : mobileInfoTab;
  const mobileProfileExtra = showGuestAgent && (hasRelatedProgramsSection || hasPublicationSection || hasSocialSection) ? (
    <div className="mx-auto max-w-[22.5rem] border-t border-[#eee8f8] pt-3">
      <div className="grid grid-cols-2">
        <button
          type="button"
          onClick={() => setMobileInfoTab("programs")}
          className={`relative pb-2 !text-[12px] font-black transition ${activeMobileInfoTab === "programs" ? "text-[#241a3a]" : "text-[#8b7db6]"}`}
          style={{ fontSize: "12px", lineHeight: "16px" }}
        >
          参与节目
          {activeMobileInfoTab === "programs" ? <span className="absolute bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-[#635bff]" /> : null}
        </button>
        <button
          type="button"
          onClick={() => setMobileInfoTab("publications")}
          className={`relative pb-2 !text-[12px] font-black transition ${activeMobileInfoTab === "publications" ? "text-[#241a3a]" : "text-[#8b7db6]"}`}
          style={{ fontSize: "12px", lineHeight: "16px" }}
        >
          公开内容
          {activeMobileInfoTab === "publications" ? <span className="absolute bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-[#635bff]" /> : null}
        </button>
      </div>
      <div className="mt-2 space-y-0.5">
        {activeMobileInfoTab === "programs" ? (
          relatedPrograms.length ? (
            relatedPrograms.slice(0, 2).map((program, index) => {
              const routeId = program.programCode || program._id;
              return (
                <Link
                  key={program._id}
                  to={`/programs/${encodeURIComponent(routeId)}?xw_layer=1`}
                  className="flex items-center gap-1.5 rounded-xl px-2 py-1 text-left transition hover:bg-[#faf8ff]"
                >
                  <span className="w-6 shrink-0 text-left text-[14px] font-black text-[#5e3fb4]">
                    # {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-black leading-[18px] text-[#241a3a]">{program.title || "未命名节目"}</div>
                  </div>
                  <span className="material-symbols-outlined shrink-0 !text-[16px] !leading-none text-[#7a4df3]" style={{ fontSize: "16px", lineHeight: "16px" }}>arrow_outward</span>
                </Link>
              );
            })
          ) : (
            <div className="rounded-2xl bg-white px-4 py-5 text-center text-sm font-bold text-[#8e81b3]">暂无参与节目</div>
          )
        ) : mobilePublicationItems.length ? (
          mobilePublicationItems.slice(0, 2).map((item, index) => (
            <a
              key={item.key}
              href={toXiaowanziPublicContentUrl(item.url, item.title, isGuestAgentLayer)}
              target={isGuestAgentLayer ? undefined : "_blank"}
              rel={isGuestAgentLayer ? undefined : "noreferrer"}
              className="flex items-center gap-1.5 rounded-xl px-2 py-1 text-left transition hover:bg-[#faf8ff]"
            >
              <span className="w-6 shrink-0 text-left text-[14px] font-black text-[#5e3fb4]">
                # {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-black leading-[18px] text-[#241a3a]">{item.title}</div>
              </div>
              <span className="material-symbols-outlined shrink-0 !text-[16px] !leading-none text-[#7a4df3]" style={{ fontSize: "16px", lineHeight: "16px" }}>arrow_outward</span>
            </a>
          ))
        ) : (
          <div className="rounded-2xl bg-white px-4 py-5 text-center text-sm font-bold text-[#8e81b3]">暂无公开内容</div>
        )}
      </div>
    </div>
  ) : null;

  const bookGroups = useMemo(() => {
    const authoredSourceNames = new Set(
      uniqueBookSourceNames(authoredBooks.map((book) => book.sourceName))
    );
    return uniqueBookSourceNames(boundBooks.map((book) => book.sourceName))
      .filter((sourceName) => !authoredSourceNames.has(sourceName));
  }, [boundBooks, authoredBooks]);

  // 嘉宾著作按出版时间倒序
  const sortedAuthoredBooks = useMemo(() => {
    return [...authoredBooks].sort((a, b) => {
      const da = (a.publishedDate || a.publishedAt) ? new Date(a.publishedDate || a.publishedAt).getTime() : 0;
      const db = (b.publishedDate || b.publishedAt) ? new Date(b.publishedDate || b.publishedAt).getTime() : 0;
      return db - da;
    });
  }, [authoredBooks]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#1f1d1a]">
      {/* ExpertDetail: off-center grid mask + drifting orbs */}
      <style>{`
        @keyframes edOrb1 {
          0%,100% { transform: translate3d(0,0,0) scale(1); opacity: .5; }
          50% { transform: translate3d(-1.5%,2%,0) scale(1.1); opacity: .78; }
        }
        @keyframes edOrb2 {
          0%,100% { transform: translate3d(0,0,0) scale(.95); opacity: .45; }
          45% { transform: translate3d(2.5%,-1.5%,0) scale(1.18); opacity: .72; }
        }
        html.xf-mp-webview .expert-detail-main {
          padding-top: var(--xf-mp-nav-height, 88px) !important;
          padding-bottom: 0 !important;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-35">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 28% 42%, rgba(118,83,205,0.07) 1.2px, transparent 1.2px)', backgroundSize: '36px 36px' }} />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[15%] left-[5%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(143,100,255,0.1),transparent_62%)]" style={{ animation: "edOrb1 13s ease-in-out infinite" }} />
        <div className="absolute bottom-[10%] right-[8%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(109,52,226,0.1),transparent_58%)]" style={{ animation: "edOrb2 18s ease-in-out infinite 5s" }} />
      </div>
      <GlobalPublicNav compactMobile showSearch={false} />
      {isGuestAgentLayer ? (
        <button
          type="button"
          aria-label="返回小玩子"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
              return;
            }
            navigate("/experts?xw_layer=1");
          }}
          className="fixed left-4 top-[calc(12px+env(safe-area-inset-top))] z-[70] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#11143b] shadow-[0_10px_24px_rgba(70,73,132,0.14)]"
        >
          <span className="material-symbols-outlined text-[26px]">arrow_back</span>
        </button>
      ) : null}
      <main className={`expert-detail-main mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8 ${isGuestAgentLayer ? "pt-[52px]" : "pt-[76px]"}`}>
        {!isGuestAgentLayer ? (
          <div className="mb-5 flex items-center gap-2 text-sm text-[#8b7db6]">
            <Link to="/experts" className="font-bold text-[#5e17eb] hover:text-[#4a11d0]">
              先疯智库
            </Link>
            <span>/</span>
            <span>{guest?.name || "嘉宾详情"}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px,1fr]">
            <div className="animate-pulse rounded-[2rem] border border-[#e2dcf0] bg-white p-6">
              <div className="h-[420px] rounded-[1.5rem] bg-[#ece3f7]" />
            </div>
            <div className="animate-pulse rounded-[2rem] border border-[#e2dcf0] bg-white p-8">
              <div className="h-8 w-1/2 rounded bg-[#ece3f7]" />
              <div className="mt-4 h-6 w-2/3 rounded bg-[#ece3f7]" />
              <div className="mt-6 h-28 rounded bg-[#ece3f7]" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-500">{error}</div>
        ) : !guest ? (
          <div className="rounded-2xl border border-dashed border-[#d2c5ee] bg-white px-6 py-12 text-center text-sm text-[#8e81b3]">
            未找到该嘉宾资料。
          </div>
        ) : (
          <div className="space-y-6">
            {/* 顶部信息卡：与 AI 分身头部保持一致 */}
            {!showGuestAgent ? (
            <div className="rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]">
              <div className="flex flex-col items-center gap-8 text-center md:flex-row-reverse md:justify-between md:text-left">
                <div className="relative h-[7.8rem] w-[7.8rem] shrink-0 md:h-[9.1rem] md:w-[9.1rem]">
                  <div className={`flex h-[7.8rem] w-[7.8rem] items-center justify-center overflow-hidden rounded-3xl p-[2px] ring-4 ring-[#5e17eb]/10 md:h-[9.1rem] md:w-[9.1rem] ${isGuestFallbackAvatar ? GUEST_FALLBACK_AVATAR_FRAME_CLASS : GUEST_REAL_AVATAR_FRAME_CLASS}`}>
                    <img
                      src={guestAvatar}
                      alt={guest.name || "嘉宾头像"}
                      className={isGuestFallbackAvatar ? GUEST_FALLBACK_AVATAR_DETAIL_IMG_CLASS : GUEST_REAL_AVATAR_DETAIL_IMG_CLASS}
                      onError={() => { setAvatarFallbackActive(true); }}
                    />
                  </div>
                  <div className="absolute -bottom-3 right-[-19px] z-10">
                    <GuestWishButton guestId={guest._id || ""} />
                  </div>
                </div>
                <div className="mt-6 min-w-0 md:mt-0 md:flex-1">
                  <div className="hidden rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1] md:inline-flex">
                    Guest Profile
                  </div>
                  <div className="mt-5 flex items-center justify-center gap-3 md:justify-start">
                    <h1 className="text-4xl font-black tracking-tight text-[#241a3a]">{guest.name || "未命名嘉宾"}</h1>
                    <p className="text-sm font-black text-[#5e17eb]">{guest.title || "节目嘉宾"}</p>
                  </div>
                  <p className="mx-auto mt-5 max-w-[22rem] text-[15px] leading-8 text-[#6f66ad] md:mx-0 md:max-w-none">
                    {guest.bio || "暂无简介，后续可在后台补充嘉宾背景、研究方向与代表经验。"}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
                    <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                      节目 {guest.programCount || 0}
                    </span>
                    <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                      社交媒体 {socialProfiles.length}
                    </span>
                    <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                      公开内容 {publications.length || profileReferences.length}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
                    {guest.profileUrl ? (
                      <a href={guest.profileUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center rounded-full bg-[#5e17eb] px-5 py-2.5 text-xs font-black text-white transition hover:bg-[#4a11d0]">
                        查看官方档案
                      </a>
                    ) : null}
                  
                  </div>
                </div>
              </div>
            </div>
            ) : null}

            {showGuestAgent ? (
              <GuestAgentChatPanel
                guestId={guest._id || id}
                fallbackName={guest.name}
                fallbackTitle={guest.title}
                fallbackAvatar={guestAvatar}
                fallbackBio={guest.bio}
                programCount={guest.programCount || 0}
                socialCount={socialProfiles.length}
                publicationCount={publications.length || profileReferences.length}
                mergeProfileHeader
                mobileProfileExtra={mobileProfileExtra}
              />
            ) : null}

            {/* 嘉宾著作板块 - 紧接姓名板块 */}
            {sortedAuthoredBooks.length > 0 ? (
              <div className="rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]">
                <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                  Authored Works
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-[#241a3a]">嘉宾著作</h2>
                <p className="mt-2 text-sm text-[#7b70a4]">这位嘉宾自己的著作作品。</p>
                <div className="mt-4 overflow-x-auto pb-2 -mx-2 px-2">
                  <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                    {sortedAuthoredBooks.map((book) => {
                      const publishedAt = String(book.publishedDate || book.publishedAt || "");
                      const pubYear = publishedAt ? new Date(publishedAt).getFullYear() : "";
                      const cardContent = (
                        <>
                          <div className="aspect-[2/3] overflow-hidden rounded-xl bg-[#f3eefc] relative">
                            <img
                              src={book.coverImage || `https://via.placeholder.com/240x360/630ed4/ffffff?text=${encodeURIComponent((book.title || '书').slice(0, 4))}`}
                              alt={book.title || "著作封面"}
                              className="w-full h-full object-cover transition group-hover:scale-105"
                              loading="lazy"
                              onError={(e) => { e.currentTarget.src = `https://via.placeholder.com/240x360/630ed4/ffffff?text=${encodeURIComponent((book.title || '书').slice(0, 4))}`; }}
                            />
                          </div>
                          <div className="mt-2 text-center">
                            <div className="text-xs font-black text-[#241a3a] line-clamp-2 leading-tight">{book.title || "未命名书籍"}</div>
                            <div className="mt-0.5 text-[10px] font-bold text-[#8e81b3]">{pubYear}{pubYear && book.publisher ? " · " : ""}{book.publisher || ""}</div>
                            {book.hasMetadataDetail ? (
                              <div className="mt-1 text-[10px] font-black text-[#7C3AED]">查看详情</div>
                            ) : null}
                          </div>
                        </>
                      );

                      return book.hasMetadataDetail ? (
                        <Link
                          key={book._id}
                          to={`/reading/${book._id}`}
                          className="group relative w-[120px] shrink-0 rounded-[1.25rem] border border-[#e8e0f2] bg-[#fcfaff] p-2.5 transition hover:border-[#b79bff] hover:bg-white sm:w-[140px]"
                        >
                          {cardContent}
                        </Link>
                      ) : (
                        <div key={book._id} className="group relative w-[120px] shrink-0 rounded-[1.25rem] border border-[#e8e0f2] bg-[#fcfaff] p-2.5 sm:w-[140px]">
                          {cardContent}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {/* 听友福利板块 - 紧接嘉宾著作板块 */}
            {hasListenerBenefitsSection ? (
              <div className="rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]">
                <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                  Listener Benefits
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-[#241a3a]">听友福利</h2>
                <p className="mt-2 text-sm text-[#7b70a4]">专属福利，感谢各位听友一路陪伴。</p>
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {listenerBenefits.map((item: ListenerBenefit, index: number) => {
                    const hasUrl = Boolean(String(item.url || "").trim());
                    const hasImage = Boolean(String(item.image || "").trim());
                    const cardClass =
                      "block rounded-[1.25rem] border border-[#e8e0f2] bg-[#fcfaff] px-5 py-4 transition hover:border-[#b79bff] hover:bg-white";
                    const content = (
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-black text-[#241a3a]">{item.title || "未命名福利"}</div>
                          {item.description ? <div className="mt-2 text-sm text-[#7c70af]">{item.description}</div> : null}
                          {hasImage ? (
                            <div className="mt-3 overflow-hidden rounded-xl border border-[#e8e0f2]">
                              <img
                                src={item.image}
                                alt={item.title || "福利图片"}
                                className="w-full h-auto object-cover transition duration-300 hover:scale-110 cursor-zoom-in"
                                title="点击查看大图"
                                loading="lazy"
                              />
                            </div>
                          ) : null}
                          {item.note ? <div className="mt-2 text-xs text-[#9788a8]">{item.note}</div> : null}
                        </div>
                        {hasUrl ? <span className="material-symbols-outlined shrink-0 text-[#5e17eb]">open_in_new</span> : null}
                      </div>
                    );
                    if (!hasUrl) {
                      return (
                        <div key={`benefit-${item.title}-${index}`} className={cardClass}>
                          {content}
                        </div>
                      );
                    }
                    return (
                      <a
                        key={`benefit-${item.url}-${index}`}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className={cardClass}
                      >
                        {content}
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : null}

              {hasSocialSection && !showGuestAgent ? (
                <div className="rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-[#241a3a]">社交媒体</h2>
                    <p className="mt-2 text-sm text-[#7b70a4]">用于快速进入嘉宾的公开账号、栏目或持续输出阵地。</p>
                  </div>
                </div>
                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {socialProfiles.map((item: GuestSocialProfile, index: number) => {
                      const hasUrl = Boolean(String(item.url || "").trim());
                      const cardClass =
                        "block rounded-[1.25rem] border border-[#e8e0f2] bg-[#fcfaff] px-5 py-4 transition hover:border-[#b79bff] hover:bg-white";
                      const content = (
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#5e17eb]">{item.platform || "社交媒体"}</div>
                            <div className="mt-2 text-base font-black text-[#241a3a]">{item.label || item.url || "未命名账号"}</div>
                            {item.note ? <div className="mt-2 text-sm text-[#7c70af]">{item.note}</div> : null}
                          </div>
                          {hasUrl ? <span className="material-symbols-outlined text-[#5e17eb]">open_in_new</span> : null}
                        </div>
                      );
                      if (!hasUrl) {
                        return (
                          <div key={`${item.platform || "social"}-${item.label || index}-${index}`} className={cardClass}>
                            {content}
                          </div>
                        );
                      }
                      return (
                        <a
                          key={`${item.url}-${index}`}
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className={cardClass}
                        >
                          {content}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {hasPublicationSection ? (
                <div className={`${showGuestAgent ? "hidden md:block " : ""}rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-[#241a3a]">公开内容与资料</h2>
                    <p className="mt-2 text-sm text-[#7b70a4]">按论文、著作、采访、文章与拓展分组整理，便于快速判断这位嘉宾的研究与表达路径。</p>
                  </div>
                </div>
                  <div className="mt-6 space-y-6">
                    {(Object.keys(publicationGroups) as Array<GuestPublication["type"]>).map((groupKey) => {
                      const group = publicationGroups[groupKey];
                      if (!group.length) return null;
                      return (
                        <section key={groupKey}>
                          <h3 className="text-lg font-black text-[#241a3a]">{PUBLICATION_LABELS[groupKey]}</h3>
                          <div className="mt-3 space-y-3">
                            {group.map((item, index) => (
                              <a
                                key={`${item.url}-${index}`}
                                href={toXiaowanziPublicContentUrl(item.url, item.title, isGuestAgentLayer)}
                                target={isGuestAgentLayer ? undefined : "_blank"}
                                rel={isGuestAgentLayer ? undefined : "noreferrer"}
                                className="block rounded-[1.25rem] border border-[#e8e0f2] bg-[#fcfaff] px-5 py-4 transition hover:border-[#b79bff] hover:bg-white"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <div className="text-base font-black text-[#241a3a]">{item.title}</div>
                                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#9b83af]">
                                      {item.source ? <span>{item.source}</span> : null}
                                      {item.publishedAt ? <span>{item.publishedAt}</span> : null}
                                    </div>
                                    {item.summary ? <div className="mt-3 text-sm leading-7 text-[#7c70af]">{item.summary}</div> : null}
                                    {item.note ? <div className="mt-2 text-xs text-[#9788a8]">{item.note}</div> : null}
                                  </div>
                                  <span className="material-symbols-outlined shrink-0 text-[#5e17eb]">open_in_new</span>
                                </div>
                              </a>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* 关联书单卡片 */}
              {bookGroups.length > 0 ? (
                <div className="rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]">
                  <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                    Recommended Books
                  </div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-[#241a3a]">推荐书目</h2>
                  <p className="mt-2 text-sm text-[#7b70a4]">这位嘉宾推荐或参与的书单。</p>
                  <div className="mt-6 space-y-3">
                    {bookGroups.map((sourceName, index) => (
                      <Link
                        key={sourceName}
                        to={`/books?sourceGuestId=${encodeURIComponent(guest._id || "")}&guest=${encodeURIComponent(guest.name || "")}&sourceName=${encodeURIComponent(sourceName)}`}
                        className="flex items-center justify-between rounded-[1.1rem] border border-[#e8e0f2] bg-[#fcfaff] px-4 py-3 transition hover:border-[#b79bff] hover:bg-white"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5b3fa1]">#{index + 1}</div>
                          <div className="mt-1 text-base font-black text-[#241a3a]">{sourceName}</div>
                        </div>
                        <span className="material-symbols-outlined shrink-0 text-[#5e17eb]">arrow_outward</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasRelatedProgramsSection ? (
                <div className={`${showGuestAgent ? "hidden md:block " : ""}rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]`}>
                <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                  Related Content
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-[#241a3a]">参与节目</h2>
                <p className="mt-2 text-sm text-[#7b70a4]">只保留标题，快速浏览这位嘉宾参与过的节目内容。</p>
                  <div className="mt-6 space-y-3">
                    {relatedPrograms.map((program, index) => {
                      const routeId = program.programCode || program._id;
                      return (
                        <Link
                          key={program._id}
                          to={`/programs/${encodeURIComponent(routeId)}${isGuestAgentLayer ? "?xw_layer=1" : ""}`}
                          className="flex items-center justify-between rounded-[1.1rem] border border-[#e8e0f2] bg-[#fcfaff] px-4 py-3 transition hover:border-[#b79bff] hover:bg-white"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5b3fa1]">#{index + 1}</div>
                            <div className="mt-1 truncate text-base font-black text-[#241a3a]">{program.title || "未命名节目"}</div>
                          </div>
                          <span className="material-symbols-outlined shrink-0 text-[#5e17eb]">arrow_outward</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}
          
          </div>
        )}
      </main>
    </div>
  );
};

export default ExpertDetailPage;
