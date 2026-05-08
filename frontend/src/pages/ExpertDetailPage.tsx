import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import { GuestPublication, GuestSocialProfile, publicApi, PublicGuest, PublicGuestDetail } from "../services/api";

const FALLBACK_AVATAR = "/assets/podcast-cover-1.svg";
const PUBLICATION_LABELS: Record<GuestPublication["type"], string> = {
  paper: "论文",
  book: "著作",
  interview: "采访",
  media: "公开内容",
  other: "其他资料",
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
    programCount: Number(detail?.programCount || summary?.programCount || 0),
    referenceCount: Number(detail?.referenceCount || summary?.referenceCount || 0),
    relatedPrograms: Array.isArray(detail?.relatedPrograms) ? detail!.relatedPrograms : [],
  };
}

const ExpertDetailPage: React.FC = () => {
  const { id: routeId = "" } = useParams();
  const { pathname } = useLocation();
  const id = useMemo(() => {
    const fromRoute = String(routeId || "").trim();
    if (fromRoute) return decodeURIComponent(fromRoute);
    const match = pathname.match(/^\/experts\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }, [pathname, routeId]);
  const [guest, setGuest] = useState<PublicGuestDetail | null>(null);
  const [hasBoundBooks, setHasBoundBooks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
            const matched = books.some((book) => extractBookSourceGuestId(book.sourceGuestId) === merged._id);
            setHasBoundBooks(matched);
          } else {
            setHasBoundBooks(false);
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
            const matched = books.some((book) => extractBookSourceGuestId(book.sourceGuestId) === mergedGuest._id);
            setHasBoundBooks(matched);
          } else {
            setHasBoundBooks(false);
          }
          return;
        }

        setError("嘉宾详情暂未同步完成");
      } catch (err: any) {
        if (!alive) return;
        setHasBoundBooks(false);
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
  const relatedPrograms = useMemo(
    () => (Array.isArray(guest?.relatedPrograms) ? guest.relatedPrograms.filter((item) => String(item?._id || "").trim()) : []),
    [guest]
  );
  const publicationGroups = useMemo(() => groupPublications(publications), [publications]);
  const hasSocialSection = socialProfiles.length > 0;
  const hasPublicationSection = publications.length > 0 || profileReferences.length > 0;
  const hasRelatedProgramsSection = relatedPrograms.length > 0;

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
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-35">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 28% 42%, rgba(118,83,205,0.07) 1.2px, transparent 1.2px)', backgroundSize: '36px 36px' }} />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[15%] left-[5%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(143,100,255,0.1),transparent_62%)]" style={{ animation: "edOrb1 13s ease-in-out infinite" }} />
        <div className="absolute bottom-[10%] right-[8%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(109,52,226,0.1),transparent_58%)]" style={{ animation: "edOrb2 18s ease-in-out infinite 5s" }} />
      </div>
      <GlobalPublicNav compactMobile showSearch={false} />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center gap-2 text-sm text-[#8b7db6]">
          <Link to="/experts" className="font-bold text-[#5e17eb] hover:text-[#4a11d0]">
            先疯智库
          </Link>
          <span>/</span>
          <span>{guest?.name || "嘉宾详情"}</span>
        </div>

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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px,1fr]">
            <aside className="rounded-[2rem] border border-[#e2dcf0] bg-white p-6 shadow-[0_24px_80px_rgba(80,62,125,0.08)]">
              <div className="overflow-hidden rounded-[1.5rem] bg-[linear-gradient(140deg,_#1f143a_0%,_#4b1db2_42%,_#b79bff_100%)]">
                <img
                  src={guest.avatar || FALLBACK_AVATAR}
                  alt={guest.name || "嘉宾头像"}
                  className="h-[420px] w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.src = FALLBACK_AVATAR;
                  }}
                />
              </div>
              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-[#d9c8ff] bg-[#f6f0ff] px-4 py-3 text-sm text-[#7b6aa7]">
                  关联节目 <span className="font-black text-[#2f1a3a]">{guest.programCount || 0}</span>
                </div>
                <div className="rounded-2xl border border-[#d9c8ff] bg-[#f6f0ff] px-4 py-3 text-sm text-[#7b6aa7]">
                  公开资料 <span className="font-black text-[#2f1a3a]">{profileReferences.length}</span>
                </div>
                {guest.profileUrl ? (
                  <a
                    href={guest.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center rounded-full bg-[#5e17eb] px-5 py-3 text-sm font-black text-white transition hover:bg-[#4a11d0]"
                  >
                    查看官方档案
                  </a>
                ) : null}
                {guest._id && hasBoundBooks ? (
                  <Link
                    to={`/books?sourceGuestId=${encodeURIComponent(guest._id)}&guest=${encodeURIComponent(guest.name || "")}`}
                    className="flex items-center justify-center rounded-full border border-[#b79bff] bg-[#f6f0ff] px-5 py-3 text-sm font-black text-[#5e17eb] transition hover:border-[#5e17eb] hover:text-[#4a11d0]"
                  >
                    查看关联书单
                  </Link>
                ) : null}
              </div>
            </aside>

            <section className="space-y-6">
              <div className="rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]">
                <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                  Guest Profile
                </div>
                <h1 className="mt-5 text-4xl font-black tracking-tight text-[#241a3a]">{guest.name || "未命名嘉宾"}</h1>
                <p className="mt-3 text-sm font-black uppercase tracking-[0.22em] text-[#5e17eb]">{guest.title || "节目嘉宾"}</p>
                <p className="mt-6 max-w-3xl text-[15px] leading-8 text-[#6f66ad]">
                  {guest.bio || "暂无简介，后续可在后台补充嘉宾背景、研究方向与代表经验。"}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                    节目 {guest.programCount || 0}
                  </span>
                  <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                    社交媒体 {socialProfiles.length}
                  </span>
                  <span className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#7d6ca7]">
                    公开成果 {publications.length || profileReferences.length}
                  </span>
                </div>
              </div>

              {hasSocialSection ? (
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
                <div className="rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-[#241a3a]">公开成果与资料</h2>
                    <p className="mt-2 text-sm text-[#7b70a4]">按论文、著作、采访与公开内容分组整理，便于快速判断这位嘉宾的研究与表达路径。</p>
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
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
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

              {hasRelatedProgramsSection ? (
                <div className="rounded-[2rem] border border-[#e2dcf0] bg-white p-8 shadow-[0_24px_80px_rgba(80,62,125,0.08)]">
                <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                  Related Content
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-[#241a3a]">关联节目</h2>
                <p className="mt-2 text-sm text-[#7b70a4]">只保留标题，快速浏览这位嘉宾参与过的节目内容。</p>
                  <div className="mt-6 space-y-3">
                    {relatedPrograms.map((program, index) => {
                      const routeId = program.programCode || program._id;
                      return (
                        <Link
                          key={program._id}
                          to={`/programs/${encodeURIComponent(routeId)}`}
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
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default ExpertDetailPage;
