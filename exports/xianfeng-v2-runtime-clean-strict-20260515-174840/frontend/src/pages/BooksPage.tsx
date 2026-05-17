import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import { getCollapsedPages } from "../lib/pagination";
import { Book, publicApi } from "../services/api";

const PAGE_SIZE = 24;
const UNKNOWN_GUEST = "未标注推荐人";
const FALLBACK_COVER = "/assets/podcast-cover-1.svg";
const BOOKS_HERO_DISMISSED_KEY = "books_hero_dismissed_v1";

type EnrichedBook = Book & {
  normalizedGuest: string;
  sourceGuestRefId: string;
};

type BookCardProps = {
  item: EnrichedBook;
};

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeGuestName(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function getSourceGuestId(value: Book["sourceGuestId"]): string {
  if (!value) return "";
  if (typeof value === "string") return normalizeText(value);
  if (typeof value === "object") return normalizeText((value as { _id?: string })._id);
  return "";
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

const BookCard: React.FC<BookCardProps> = ({ item }) => {
  return (
    <article className="mb-3 break-inside-avoid overflow-hidden rounded-[1rem] border border-[#e2dcf0] bg-white shadow-[0_8px_18px_rgba(60,40,80,0.06)]">
      <div className="w-full p-2">
        <div className="flex items-center justify-center overflow-hidden rounded-lg bg-white">
          <img
            src={item.coverImage || FALLBACK_COVER}
            alt={item.title || "书籍封面"}
            className="w-full object-contain"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.src = FALLBACK_COVER;
            }}
          />
        </div>
      </div>
      <div className="px-3 pb-3 pt-1">
        <h3 className="line-clamp-2 text-[22px] font-black leading-tight text-[#2b1a3a]">{item.title || "未命名书籍"}</h3>
        <p className="mt-2 text-sm text-[#6f62a4]">作者: {item.author || "未标注"}</p>
        {item.translator ? <p className="mt-1 text-sm text-[#6f62a4]">译者: {item.translator}</p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {item.recommendedGuest ? (
            <span className="rounded-full border border-[#d5c8ff] bg-[#f6f0ff] px-2.5 py-1 text-[11px] font-bold text-[#5e17eb]">
              {item.recommendedGuest}
            </span>
          ) : null}
          {item.grade ? (
            <span className="rounded-full border border-[#d9d8ee] bg-[#f7f7ff] px-2.5 py-1 text-[11px] font-bold text-[#4e4c87]">
              {item.grade}
            </span>
          ) : null}
          {item.categoryLabel ? (
            <span className="rounded-full border border-[#f1d9ee] bg-[#fff5ff] px-2.5 py-1 text-[11px] font-bold text-[#8a3daa]">
              {item.categoryLabel}
            </span>
          ) : null}
          {item.topic ? (
            <span className="rounded-full border border-[#cde6ea] bg-[#f2fbfe] px-2.5 py-1 text-[11px] font-bold text-[#25678a]">
              {item.topic}
            </span>
          ) : null}
        </div>
        <div className="mt-2 text-xs text-[#8b7dbc]">{item.publisher ? <span>出版社: {item.publisher}</span> : <span>出版社未标注</span>}</div>
      </div>
    </article>
  );
};

const BooksPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();

  const initialGuestId = normalizeText(searchParams.get("sourceGuestId"));
  const initialGuestName = normalizeText(searchParams.get("guest"));
  const initialKeyword = normalizeText(searchParams.get("q"));
  const initialGrades = uniq(
    normalizeText(searchParams.get("grade"))
      .split(",")
      .map((item) => normalizeText(item))
  );

  const [showHero, setShowHero] = useState(false);
  const [boundGuestId, setBoundGuestId] = useState(initialGuestId);
  const [boundGuestName, setBoundGuestName] = useState(initialGuestName);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [selectedGrades, setSelectedGrades] = useState<string[]>(initialGrades);
  const fromGuestLink = Boolean(initialGuestId || initialGuestName);

  useEffect(() => {
    try {
      setShowHero(window.localStorage.getItem(BOOKS_HERO_DISMISSED_KEY) !== "1");
    } catch (_err) {
      setShowHero(true);
    }
  }, []);

  const dismissHero = () => {
    setShowHero(false);
    try {
      window.localStorage.setItem(BOOKS_HERO_DISMISSED_KEY, "1");
    } catch (_err) {}
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    publicApi
      .getBooks()
      .then((response) => {
        if (!alive) return;
        setBooks(Array.isArray(response.data) ? response.data : []);
      })
      .catch((err: any) => {
        if (!alive) return;
        setError(err?.response?.data?.message || err?.message || "书单加载失败");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (boundGuestId) next.set("sourceGuestId", boundGuestId);
    if (boundGuestName) next.set("guest", boundGuestName);
    if (selectedGrades.length > 0) next.set("grade", selectedGrades.join(","));
    if (keyword) next.set("q", keyword);
    setSearchParams(next, { replace: true });
  }, [boundGuestId, boundGuestName, selectedGrades, keyword, setSearchParams]);

  const enriched = useMemo<EnrichedBook[]>(() => {
    return books.map((item) => {
      const guestName = normalizeText(item.recommendedGuest) || UNKNOWN_GUEST;
      const sourceGuestRefId = getSourceGuestId(item.sourceGuestId);
      return {
        ...item,
        normalizedGuest: normalizeGuestName(guestName),
        sourceGuestRefId,
        recommendedGuest: guestName,
      };
    });
  }, [books]);

  const guestBoundBase = useMemo(() => {
    if (boundGuestId) {
      const byId = enriched.filter((item) => normalizeText(item.sourceGuestRefId) === boundGuestId);
      if (byId.length > 0) return byId;
      if (boundGuestName) {
        const normalized = normalizeGuestName(boundGuestName);
        return enriched.filter((item) => item.normalizedGuest === normalized);
      }
      return byId;
    }
    if (boundGuestName) {
      const normalized = normalizeGuestName(boundGuestName);
      return enriched.filter((item) => item.normalizedGuest === normalized);
    }
    return enriched;
  }, [enriched, boundGuestId, boundGuestName]);

  const gradeOptions = useMemo(() => {
    const gradeOrder: Record<string, number> = {
      "一年级": 1, "二年级": 2, "三年级": 3, "四年级": 4, "五年级": 5, "六年级": 6,
      "七年级": 7, "八年级": 8, "九年级": 9,
      "高一": 10, "高二": 11, "高三": 12,
    };
    return uniq(guestBoundBase.map((item) => normalizeText(item.grade))).sort((a, b) => (gradeOrder[a] || 99) - (gradeOrder[b] || 99));
  }, [guestBoundBase]);

  useEffect(() => {
    setSelectedGrades((prev) => prev.filter((item) => gradeOptions.includes(item)));
  }, [gradeOptions]);

  const filtered = useMemo(() => {
    const q = keyword.toLowerCase();
    return guestBoundBase.filter((item) => {
      const byGrade = selectedGrades.length === 0 || selectedGrades.includes(normalizeText(item.grade));
      const haystack = `${item.title || ""} ${item.author || ""} ${item.publisher || ""} ${item.topic || ""} ${item.categoryLabel || ""} ${item.recommendedGuest || ""}`.toLowerCase();
      const byKeyword = !q || haystack.includes(q);
      return byGrade && byKeyword;
    });
  }, [guestBoundBase, keyword, selectedGrades]);

  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedBook[]>();
    for (const item of filtered) {
      const key = normalizeText(item.recommendedGuest) || UNKNOWN_GUEST;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .map(([guest, items]) => ({
        guest,
        items: items.sort((a, b) => normalizeText(a.title).localeCompare(normalizeText(b.title), "zh-CN")),
      }))
      .sort((a, b) => a.guest.localeCompare(b.guest, "zh-CN"));
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginationItems = useMemo(() => getCollapsedPages(safePage, totalPages, 1), [safePage, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [boundGuestId, boundGuestName, keyword, selectedGrades]);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const pagedGrouped = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const sliced = filtered.slice(start, end);
    const map = new Map<string, EnrichedBook[]>();
    for (const item of sliced) {
      const key = normalizeText(item.recommendedGuest) || UNKNOWN_GUEST;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .map(([guest, items]) => ({ guest, items }))
      .sort((a, b) => a.guest.localeCompare(b.guest, "zh-CN"));
  }, [filtered, safePage]);

  const pagedFlat = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const clearFilters = () => {
    setBoundGuestId("");
    setBoundGuestName("");
    setSelectedGrades([]);
    setKeyword("");
  };

  const toggleGrade = (grade: string) => {
    setSelectedGrades((prev) => (prev.includes(grade) ? prev.filter((item) => item !== grade) : [...prev, grade]));
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#1f1d1a]">
      {/* BooksPage: subtle dot grid + gentle floating orbs */}
      <style>{`
        @keyframes booksOrb1 {
          0%,100% { transform: translate3d(0,0,0) scale(1); opacity: .55; }
          50% { transform: translate3d(1.5%,-2%,0) scale(1.12); opacity: .8; }
        }
        @keyframes booksOrb2 {
          0%,100% { transform: translate3d(0,0,0) scale(.95); opacity: .5; }
          45% { transform: translate3d(-2%,1.5%,0) scale(1.18); opacity: .75; }
        }
        @keyframes booksOrb3 {
          0%,100% { transform: translate3d(0,0,0) scale(1.05); opacity: .45; }
          35% { transform: translate3d(2.5%,-1%,0) scale(.88); opacity: .68; }
          80% { transform: translate3d(-1.8%,2%,0) scale(1.2); opacity: .82; }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(118,83,205,0.09)_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[10%] -left-24 h-[350px] w-[350px] rounded-full bg-[radial-gradient(circle,rgba(143,100,255,0.12),transparent_60%)]" style={{ animation: "booksOrb1 15s ease-in-out infinite" }} />
        <div className="absolute top-[50%] -right-32 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(109,52,226,0.1),transparent_58%)]" style={{ animation: "booksOrb2 18s ease-in-out infinite 3s" }} />
        <div className="absolute -bottom-16 left-[20%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(153,102,255,0.11),transparent_56%)]" style={{ animation: "booksOrb3 14s ease-in-out infinite 6s" }} />
      </div>
      <GlobalPublicNav
        compactMobile
        showExpertsEntry
        showProgramEntry
        showSearch={!showHero}
        searchPlaceholder="搜索书名、作者、出版社、推荐人"
        searchValue={keyword}
        onSearchChange={setKeyword}
      />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8">
        {showHero ? (
          <section className="group relative overflow-hidden rounded-[2rem] border border-[#d8d0ef] bg-[radial-gradient(circle_at_10%_0%,_rgba(143,100,255,0.1),_transparent_40%),linear-gradient(135deg,_#f4f1fd_0%,_#faf8ff_48%,_#f0ebff_100%)] p-7 shadow-[0_24px_80px_rgba(80,62,125,0.1)] sm:p-9">
            <button
              type="button"
              onClick={dismissHero}
              aria-label="关闭引导卡片"
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#cfc2ee] bg-white/75 text-[#5b3fa1] opacity-0 transition hover:bg-white hover:text-[#4e36a0] group-hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 max-sm:opacity-100"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-[#5b3fa1]">
                Reading Shelf
              </div>
              <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#2b1a3a] sm:text-5xl">推荐书单</h1>
              <p className="mt-3 text-sm leading-7 text-[#6f62a3] sm:text-base">
                基于节目实践沉淀的书籍清单。可先按推荐人聚合浏览，再结合年级和关键词快速筛选。
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <label className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-[#d8d0ef] bg-white px-4 shadow-sm">
                <span className="material-symbols-outlined text-[#8f7bd6]">search</span>
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索书名、作者、出版社、推荐人"
                  className="materials-search-input w-full border-0 bg-transparent text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                />
              </label>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#cfc2ee] bg-white px-5 text-sm font-bold text-[#654f88] transition hover:border-[#5e17eb] hover:text-[#5e17eb]"
              >
                清空筛选
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-[1.8rem] border border-[#e0d9f2] bg-white p-5 shadow-[0_16px_50px_rgba(80,62,125,0.06)] sm:p-6">
          {boundGuestId || boundGuestName ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-bold text-[#3e4d88]">
                推荐嘉宾: {boundGuestName || "指定嘉宾"}
              </span>
              {boundGuestId ? (
                <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-xs font-bold text-[#52525b]">ID: {boundGuestId}</span>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 md:flex-row md:items-start">
            <div className="w-[72px] pt-1 text-sm font-black tracking-[0.1em] text-[#6b5fa0]">年级</div>
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                {gradeOptions.map((grade) => {
                  const active = selectedGrades.includes(grade);
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => toggleGrade(grade)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-[#5e17eb] bg-[#5e17eb] text-white"
                          : "border-[#d8c8ef] bg-white text-[#5f5290] hover:border-[#5e17eb]"
                      }`}
                    >
                      {grade}
                    </button>
                  );
                })}
                {gradeOptions.length === 0 ? <span className="text-sm text-[#8b7db6]">暂无可筛选年级</span> : null}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-[#7b6bb8]">共 {filtered.length} 本书</span>
            {fromGuestLink ? (
              <span className="rounded-full bg-[#f3eefc] px-2.5 py-1 text-xs font-bold text-[#5b3fa1]">聚合组数: {grouped.length}</span>
            ) : null}
            {selectedGrades.map((item) => (
              <span key={`grade-${item}`} className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-bold text-[#3e4d88]">
                年级: {item}
              </span>
            ))}
          </div>
        </section>

        {error ? <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-500">{error}</div> : null}

        <section className="mt-6 space-y-5">
          {loading
            ? Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="animate-pulse rounded-[1.5rem] border border-[#e2dcf0] bg-white p-5">
                  <div className="h-6 w-56 rounded bg-[#ece3f7]" />
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((__, cardIdx) => (
                      <div key={cardIdx} className="h-56 rounded-[1.2rem] bg-[#ece3f7]" />
                    ))}
                  </div>
                </div>
              ))
            : null}

          {!loading && (fromGuestLink ? pagedGrouped.length === 0 : pagedFlat.length === 0) ? (
            <div className="rounded-[1.6rem] border border-dashed border-[#d2c5ee] bg-white px-6 py-12 text-center">
              <p className="text-base font-bold text-[#6f5fb4]">没有匹配到书单</p>
              <p className="mt-2 text-sm text-[#8b7db6]">可以尝试减少筛选条件，或点击“清空筛选”重新查看全部。</p>
            </div>
          ) : null}

          {!loading && fromGuestLink
            ? pagedGrouped.map((group) => (
                <section key={group.guest} className="rounded-[1.5rem] border border-[#e2dcf0] bg-white p-5 shadow-[0_12px_40px_rgba(80,62,125,0.05)]">
                  <header className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-xl font-black text-[#2b1a3a]">{group.guest}</h2>
                    <span className="rounded-full border border-[#e3d0b8] bg-[#fff7ec] px-2.5 py-1 text-xs font-bold text-[#7c5c35]">
                      {group.items.length} 本
                    </span>
                  </header>
                  <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
                    {group.items.map((item) => (
                      <BookCard key={item._id} item={item} />
                    ))}
                  </div>
                </section>
              ))
            : null}

          {!loading && !fromGuestLink ? (
            <section className="rounded-[1.5rem] border border-[#e2dcf0] bg-white p-5 shadow-[0_12px_40px_rgba(80,62,125,0.05)]">
              <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
                {pagedFlat.map((item) => (
                  <BookCard key={item._id} item={item} />
                ))}
              </div>
            </section>
          ) : null}
        </section>

        {!loading && filtered.length > 0 ? (
          <section className="mt-8">
            {totalPages > 1 ? (
              <div className="flex items-center justify-center gap-3">
                {paginationItems.map((item, idx) => {
                  if (item === "ellipsis") {
                    return (
                      <span key={`ellipsis-${idx}`} className="inline-flex h-7 w-7 items-center justify-center text-[10px] font-bold text-[#8f7bd6]">
                        ...
                      </span>
                    );
                  }
                  const active = item === safePage;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      style={{ fontSize: "9.1px", lineHeight: 1 }}
                      className={`h-7 w-7 rounded-full text-[7px] font-bold transition ${
                        active
                          ? "bg-[#5e17eb] text-white shadow-lg shadow-[#5e17eb]/25"
                          : "border border-[#5e17eb]/25 bg-white text-[#5e17eb] hover:bg-[#5e17eb]/5"
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
};

export default BooksPage;
