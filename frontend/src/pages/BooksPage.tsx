import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import { Book, publicApi } from "../services/api";

const PAGE_SIZE = 24;
const UNKNOWN_GUEST = "未标注推荐人";
const FALLBACK_COVER = "/assets/podcast-cover-1.svg";

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
    <article className="mb-3 break-inside-avoid overflow-hidden rounded-[1rem] border border-[#e9ded1] bg-white shadow-[0_8px_18px_rgba(60,40,20,0.06)]">
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
        <h3 className="line-clamp-2 text-[22px] font-black leading-tight text-[#2b2012]">{item.title || "未命名书籍"}</h3>
        <p className="mt-2 text-sm text-[#6f6254]">作者: {item.author || "未标注"}</p>
        {item.translator ? <p className="mt-1 text-sm text-[#6f6254]">译者: {item.translator}</p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {item.recommendedGuest ? (
            <span className="rounded-full border border-[#e3d0b8] bg-[#fff7ec] px-2.5 py-1 text-[11px] font-bold text-[#7c5c35]">
              {item.recommendedGuest}
            </span>
          ) : null}
          {item.grade ? (
            <span className="rounded-full border border-[#d9d8ee] bg-[#f7f7ff] px-2.5 py-1 text-[11px] font-bold text-[#4e4c87]">
              {item.grade}
            </span>
          ) : null}
          {item.categoryLabel ? (
            <span className="rounded-full border border-[#f1d9d9] bg-[#fff5f5] px-2.5 py-1 text-[11px] font-bold text-[#8a3d3d]">
              {item.categoryLabel}
            </span>
          ) : null}
          {item.topic ? (
            <span className="rounded-full border border-[#cde6d8] bg-[#f2fbf6] px-2.5 py-1 text-[11px] font-bold text-[#25674a]">
              {item.topic}
            </span>
          ) : null}
        </div>
        <div className="mt-2 text-xs text-[#8b7d6f]">{item.publisher ? <span>出版社: {item.publisher}</span> : <span>出版社未标注</span>}</div>
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

  const [boundGuestId, setBoundGuestId] = useState(initialGuestId);
  const [boundGuestName, setBoundGuestName] = useState(initialGuestName);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [selectedGrades, setSelectedGrades] = useState<string[]>(initialGrades);
  const fromGuestLink = Boolean(initialGuestId || initialGuestName);

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
    return uniq(guestBoundBase.map((item) => normalizeText(item.grade))).sort((a, b) => a.localeCompare(b, "zh-CN"));
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
    <div className="min-h-screen bg-[#f7f0e7] text-[#2a2118]">
      <GlobalPublicNav compactMobile showExpertsEntry showProgramEntry showSearch={false} />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-[#eadbc8] bg-[linear-gradient(135deg,_#fffaf4_0%,_#fff3e1_48%,_#fff_100%)] p-7 shadow-[0_24px_80px_rgba(95,56,22,0.08)] sm:p-9">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-[#d5a15f] bg-[#fff3df] px-4 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-[#a25f16]">
              Reading Shelf
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#2a1605] sm:text-5xl">推荐书单</h1>
            <p className="mt-3 text-sm leading-7 text-[#6f6253] sm:text-base">
              基于节目实践沉淀的书籍清单。可先按推荐人聚合浏览，再结合年级和关键词快速筛选。
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-[#e8d7c6] bg-white px-4 shadow-sm">
              <span className="material-symbols-outlined text-[#9f8b74]">search</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索书名、作者、主题、推荐人"
                className="materials-search-input w-full border-0 bg-transparent text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              />
            </label>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#ccbca8] bg-white px-5 text-sm font-bold text-[#654f38] transition hover:border-[#a25f16] hover:text-[#a25f16]"
            >
              清空筛选
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-[1.8rem] border border-[#eadbc8] bg-white p-5 shadow-[0_16px_50px_rgba(95,56,22,0.06)] sm:p-6">
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
            <div className="w-[72px] pt-1 text-sm font-black tracking-[0.1em] text-[#5f5242]">年级</div>
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
                          : "border-[#e7d8c8] bg-white text-[#5f5242] hover:border-[#5e17eb]"
                      }`}
                    >
                      {grade}
                    </button>
                  );
                })}
                {gradeOptions.length === 0 ? <span className="text-sm text-[#8b7d6f]">暂无可筛选年级</span> : null}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-[#7b6b58]">共 {filtered.length} 本书</span>
            {fromGuestLink ? (
              <span className="rounded-full bg-[#fff3df] px-2.5 py-1 text-xs font-bold text-[#8a5d26]">聚合组数: {grouped.length}</span>
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
                <div key={idx} className="animate-pulse rounded-[1.5rem] border border-[#ece3d8] bg-white p-5">
                  <div className="h-6 w-56 rounded bg-[#f3ece2]" />
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((__, cardIdx) => (
                      <div key={cardIdx} className="h-56 rounded-[1.2rem] bg-[#f3ece2]" />
                    ))}
                  </div>
                </div>
              ))
            : null}

          {!loading && (fromGuestLink ? pagedGrouped.length === 0 : pagedFlat.length === 0) ? (
            <div className="rounded-[1.6rem] border border-dashed border-[#e5d9ca] bg-white px-6 py-12 text-center">
              <p className="text-base font-bold text-[#6f5f4c]">没有匹配到书单</p>
              <p className="mt-2 text-sm text-[#8b7d6f]">可以尝试减少筛选条件，或点击“清空筛选”重新查看全部。</p>
            </div>
          ) : null}

          {!loading && fromGuestLink
            ? pagedGrouped.map((group) => (
                <section key={group.guest} className="rounded-[1.5rem] border border-[#ece3d8] bg-white p-5 shadow-[0_12px_40px_rgba(95,56,22,0.05)]">
                  <header className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-xl font-black text-[#2b2012]">{group.guest}</h2>
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
            <section className="rounded-[1.5rem] border border-[#ece3d8] bg-white p-5 shadow-[0_12px_40px_rgba(95,56,22,0.05)]">
              <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
                {pagedFlat.map((item) => (
                  <BookCard key={item._id} item={item} />
                ))}
              </div>
            </section>
          ) : null}
        </section>

        {!loading && filtered.length > 0 ? (
          <section className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-[#ebddce] bg-white px-5 py-4 sm:flex-row">
            <p className="text-sm text-[#7b6c59]">
              第 {safePage}/{totalPages} 页，每页 {PAGE_SIZE} 条
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={safePage <= 1}
                className="rounded-xl border border-[#ddccba] px-3 py-2 text-sm font-bold text-[#5d4c39] disabled:cursor-not-allowed disabled:opacity-45"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage >= totalPages}
                className="rounded-xl border border-[#ddccba] px-3 py-2 text-sm font-bold text-[#5d4c39] disabled:cursor-not-allowed disabled:opacity-45"
              >
                下一页
              </button>
            </div>
          </section>
        ) : null}

        <div className="mt-8">
          <Link to="/experts" className="text-sm font-bold text-[#7b5b31] hover:text-[#5e17eb]">
            返回先疯智库
          </Link>
        </div>
      </main>
    </div>
  );
};

export default BooksPage;
