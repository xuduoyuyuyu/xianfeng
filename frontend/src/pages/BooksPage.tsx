import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import GlobalPublicNav from "../components/GlobalPublicNav";
import Pagination from "../components/Pagination";
import { Book, publicApi } from "../services/api";
import { useIsMobilePager } from "../hooks/useIsMobilePager";
import { buildBookCoverImageSrc, getPreferredBookCover } from "../utils/bookCover";
import { hasBookSourceName } from "../utils/bookSourceNames";
import { useXiaowanziEmbeddedLayer } from "../utils/xiaowanziLayer";

const PAGE_SIZE = 24;
const UNKNOWN_GUEST = "未标注推荐人";
const DESKTOP_VISIBLE_TOPIC_FILTERS = 48;
const TOPIC_FILTER_COLLAPSED_ROWS = 4;
const MOBILE_VISIBLE_TOPIC_FILTER_FALLBACK = 22;

type EnrichedBook = Book & {
  normalizedGuest: string;
  sourceGuestRefId: string;
};

type BookCardProps = {
  item: EnrichedBook;
  imageIndex: number;
};

const PRIORITY_COVER_COUNT = 8;

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

function getBookListCover(item: Pick<Book, "coverImage" | "metadataCover">): string {
  return getPreferredBookCover(item, { cover: item.metadataCover });
}

function hasBookCover(item: Pick<Book, "coverImage" | "metadataCover">): boolean {
  return Boolean(getBookListCover(item));
}

function getBookDisplayPriority(item: EnrichedBook): number {
  if (hasBookCover(item) && item.hasMetadataDetail) return 3;
  if (hasBookCover(item)) return 2;
  return 1;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

const BookCard: React.FC<BookCardProps> = ({ item, imageIndex }) => {
  const coverUrl = getBookListCover(item);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const isPriorityCover = imageIndex < PRIORITY_COVER_COUNT;
  const coverLoading = isPriorityCover ? "eager" : "lazy";
  const coverFetchPriority = isPriorityCover ? "high" : "auto";

  useEffect(() => {
    setCoverLoaded(false);
  }, [coverUrl]);

  const coverSrc = buildBookCoverImageSrc(coverUrl);

  const cardContent = (
    <>
      {coverUrl ? (
        <div className="book-card-cover-frame relative w-full p-2">
          <div className="book-card-cover-shell flex min-h-[180px] items-center justify-center overflow-hidden rounded-lg bg-[#f8f5ff] sm:min-h-[220px]">
            <img
              src={coverSrc}
              alt={item.title || "书籍封面"}
              className={`book-card-cover-image w-full object-contain transition-opacity duration-200 ${coverLoaded ? "opacity-100" : "opacity-0"}`}
              loading={coverLoading}
              decoding={isPriorityCover ? "sync" : "async"}
              {...({ fetchpriority: coverFetchPriority } as React.ImgHTMLAttributes<HTMLImageElement> & { fetchpriority: typeof coverFetchPriority })}
              onLoad={() => setCoverLoaded(true)}
              onError={(e) => {
                setCoverLoaded(false);
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          </div>
          {/* 购买功能暂隐藏 */}
        </div>
      ) : null}
      <div className={`book-card-body px-3 pb-3 ${coverUrl ? "pt-1" : "pt-3"}`}>
        <h3 className="book-card-title line-clamp-2 text-[22px] font-black leading-tight text-[#2b1a3a]">{item.title || "未命名书籍"}</h3>
        <p className="book-card-meta mt-2 text-sm text-[#6f62a4]">作者: {item.author || "未标注"}</p>
        {item.translator ? <p className="book-card-meta mt-1 text-sm text-[#6f62a4]">译者: {item.translator}</p> : null}
        <div className="book-card-tags mt-2.5 flex flex-wrap gap-1.5">
          {item.recommendedGuest ? (
            <span className="book-card-tag book-card-tag-guest rounded-full border border-[#d5c8ff] bg-[#f6f0ff] px-2.5 py-1 text-[11px] font-bold text-[#5e17eb]">
              推荐人：{item.recommendedGuest}
            </span>
          ) : null}
          {item.grade ? (
            <span className="book-card-tag book-card-tag-grade rounded-full border border-[#d9d8ee] bg-[#f7f7ff] px-2.5 py-1 text-[11px] font-bold text-[#4e4c87]">
              {item.grade}
            </span>
          ) : null}
          {item.categoryLabel ? (
            <span className="book-card-tag book-card-tag-category rounded-full border border-[#f1d9ee] bg-[#fff5ff] px-2.5 py-1 text-[11px] font-bold text-[#8a3daa]">
              {item.categoryLabel}
            </span>
          ) : null}
          {item.topic ? (
            <span className="book-card-tag book-card-tag-topic rounded-full border border-[#cde6ea] bg-[#f2fbfe] px-2.5 py-1 text-[11px] font-bold text-[#25678a]">
              {item.topic}
            </span>
          ) : null}
        </div>
        <div className="book-card-publisher mt-2 text-xs text-[#8b7dbc]">{item.publisher ? <span>出版社: {item.publisher}</span> : <span>出版社未标注</span>}</div>
        <div className="book-card-source-row mt-1.5 flex items-center justify-between gap-3 border-t border-[#f0ebff] pt-2 text-xs">
          {item.sourceName ? (
            <span className="book-card-source min-w-0 truncate text-[#a9a2d4]">《{item.sourceName}》</span>
          ) : (
            <span />
          )}
          {item.hasMetadataDetail ? (
            <span className="book-card-detail-link shrink-0 font-bold text-[#7C3AED]">查看详情</span>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <article className="book-card-article group mb-3 break-inside-avoid overflow-hidden rounded-[1rem] border border-[#e2dcf0] bg-white shadow-[0_8px_18px_rgba(60,40,80,0.06)]">
      {item.hasMetadataDetail ? (
        <Link to={`/reading/${item._id}`} className="block">
          {cardContent}
        </Link>
      ) : (
        <div className="block">
          {cardContent}
        </div>
      )}
    </article>
  );
};

const BooksPage: React.FC = () => {
  const superModePage = useXiaowanziEmbeddedLayer();
  const isMobilePager = useIsMobilePager();
  const token = useSelector((state: RootState) => state.user.token);
  const isLoggedIn = !!token || !!localStorage.getItem("token");

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();

  const initialGuestId = normalizeText(searchParams.get("sourceGuestId"));
  const initialGuestName = normalizeText(searchParams.get("guest"));
  const initialSourceName = normalizeText(searchParams.get("sourceName"));
  const initialKeyword = normalizeText(searchParams.get("q"));
  const xwReturnParam = searchParams.get("xw_return") || "";
  const initialGrades = uniq(
    normalizeText(searchParams.get("grade"))
      .split(",")
      .map((item) => normalizeText(item))
  );

  const [boundGuestId, setBoundGuestId] = useState(initialGuestId);
  const [boundGuestName, setBoundGuestName] = useState(initialGuestName);
  const [boundSourceName, setBoundSourceName] = useState(initialSourceName);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [selectedGrades, setSelectedGrades] = useState<string[]>(initialGrades);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicExpanded, setTopicExpanded] = useState(false);
  const [collapsedTopicLimit, setCollapsedTopicLimit] = useState(MOBILE_VISIBLE_TOPIC_FILTER_FALLBACK);
  const topicMeasureRef = useRef<HTMLDivElement | null>(null);
  const fromGuestLink = Boolean(initialGuestId || initialGuestName || initialSourceName);

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
    if (superModePage) next.set("xw_layer", "1");
    if (xwReturnParam) next.set("xw_return", xwReturnParam);
    if (boundGuestId) next.set("sourceGuestId", boundGuestId);
    if (boundGuestName) next.set("guest", boundGuestName);
    if (boundSourceName) next.set("sourceName", boundSourceName);
    if (selectedGrades.length > 0) next.set("grade", selectedGrades.join(","));
    if (keyword) next.set("q", keyword);
    setSearchParams(next, { replace: true });
  }, [boundGuestId, boundGuestName, boundSourceName, selectedGrades, keyword, setSearchParams, superModePage, xwReturnParam]);

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
      const bySourceName = !boundSourceName || hasBookSourceName(item.sourceName, boundSourceName);
      const byGrade = selectedGrades.length === 0 || selectedGrades.includes(normalizeText(item.grade));
      const byTopic = selectedTopics.length === 0 || selectedTopics.includes(String(item.topic || "").trim());
      const haystack = `${item.title || ""} ${item.author || ""} ${item.publisher || ""} ${item.topic || ""} ${item.categoryLabel || ""} ${item.recommendedGuest || ""}`.toLowerCase();
      const byKeyword = !q || haystack.includes(q);
      return bySourceName && byGrade && byTopic && byKeyword;
    });
  }, [boundSourceName, guestBoundBase, keyword, selectedGrades, selectedTopics]);

  const coverFirstFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const priorityDelta = getBookDisplayPriority(b) - getBookDisplayPriority(a);
      if (priorityDelta !== 0) return priorityDelta;
      return normalizeText(a.title).localeCompare(normalizeText(b.title), "zh-CN");
    });
  }, [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedBook[]>();
    for (const item of coverFirstFiltered) {
      const key = normalizeText(item.recommendedGuest) || UNKNOWN_GUEST;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .map(([guest, items]) => ({
        guest,
        items: items.sort((a, b) => {
          const priorityDelta = getBookDisplayPriority(b) - getBookDisplayPriority(a);
          if (priorityDelta !== 0) return priorityDelta;
          return normalizeText(a.title).localeCompare(normalizeText(b.title), "zh-CN");
        }),
      }))
      .sort((a, b) => a.guest.localeCompare(b.guest, "zh-CN"));
  }, [coverFirstFiltered]);

  const totalPages = Math.max(1, Math.ceil(coverFirstFiltered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleBookLimit = safePage * PAGE_SIZE;

  useEffect(() => {
    setPage(1);
  }, [boundGuestId, boundGuestName, boundSourceName, keyword, selectedGrades, selectedTopics]);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const pagedGrouped = useMemo(() => {
    const start = isMobilePager ? 0 : (safePage - 1) * PAGE_SIZE;
    const end = isMobilePager ? visibleBookLimit : start + PAGE_SIZE;
    const sliced = coverFirstFiltered.slice(start, end);
    const map = new Map<string, EnrichedBook[]>();
    for (const item of sliced) {
      const key = normalizeText(item.recommendedGuest) || UNKNOWN_GUEST;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .map(([guest, items]) => ({ guest, items }))
      .sort((a, b) => a.guest.localeCompare(b.guest, "zh-CN"));
  }, [coverFirstFiltered, isMobilePager, safePage, visibleBookLimit]);

  const pagedFlat = useMemo(() => {
    if (isMobilePager) return coverFirstFiltered.slice(0, visibleBookLimit);
    const start = (safePage - 1) * PAGE_SIZE;
    return coverFirstFiltered.slice(start, start + PAGE_SIZE);
  }, [coverFirstFiltered, isMobilePager, safePage, visibleBookLimit]);

  const clearFilters = () => {
    setBoundGuestId("");
    setBoundGuestName("");
    setBoundSourceName("");
    setSelectedGrades([]);
    setSelectedTopics([]);
    setKeyword("");
  };

  const toggleGrade = (grade: string) => {
    if (!isLoggedIn) {
      document.dispatchEvent(new CustomEvent("xf-show-login-modal", { detail: { title: "登录后即可筛选", description: "登录后可查看完整书单、使用筛选功能，获得个性化阅读推荐。" } }));
      return;
    }
    setSelectedGrades((prev) => (prev.includes(grade) ? prev.filter((item) => item !== grade) : [...prev, grade]));
  };

  const toggleTopic = (topic: string) => {
    if (!isLoggedIn) {
      document.dispatchEvent(new CustomEvent("xf-show-login-modal", { detail: { title: "登录后即可筛选", description: "登录后可查看完整书单、使用筛选功能，获得个性化阅读推荐。" } }));
      return;
    }
    setSelectedTopics((prev) => (prev.includes(topic) ? prev.filter((item) => item !== topic) : [...prev, topic]));
  };

  const topicOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of books) {
      const t = String(item.topic || "").trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort();
  }, [books]);

  useEffect(() => {
    if (!isMobilePager) {
      setCollapsedTopicLimit(DESKTOP_VISIBLE_TOPIC_FILTERS);
      return;
    }

    const node = topicMeasureRef.current;
    if (!node) {
      setCollapsedTopicLimit(MOBILE_VISIBLE_TOPIC_FILTER_FALLBACK);
      return;
    }

    let frame = 0;
    const calculateCollapsedTopicLimit = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const chips = Array.from(node.querySelectorAll<HTMLElement>("[data-topic-measure-chip]"));
        if (chips.length === 0) {
          setCollapsedTopicLimit(MOBILE_VISIBLE_TOPIC_FILTER_FALLBACK);
          return;
        }

        const rowTops: number[] = [];
        let nextLimit = chips.length;
        for (let index = 0; index < chips.length; index += 1) {
          const top = Math.round(chips[index].offsetTop);
          if (!rowTops.includes(top)) rowTops.push(top);
          if (rowTops.length > TOPIC_FILTER_COLLAPSED_ROWS) {
            nextLimit = index;
            break;
          }
        }

        const clamped = Math.max(1, Math.min(nextLimit, topicOptions.length));
        setCollapsedTopicLimit((prev) => (prev === clamped ? prev : clamped));
      });
    };

    calculateCollapsedTopicLimit();
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(calculateCollapsedTopicLimit);
      resizeObserver.observe(node);
      return () => {
        if (frame) window.cancelAnimationFrame(frame);
        resizeObserver.disconnect();
      };
    }

    window.addEventListener("resize", calculateCollapsedTopicLimit);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", calculateCollapsedTopicLimit);
    };
  }, [isMobilePager, topicOptions]);

  const maxVisibleTopicFilters = isMobilePager ? collapsedTopicLimit : DESKTOP_VISIBLE_TOPIC_FILTERS;
  const visibleTopicOptions = topicExpanded ? topicOptions : topicOptions.slice(0, maxVisibleTopicFilters);
  const hasMoreTopicOptions = topicOptions.length > maxVisibleTopicFilters;

  return (
    <div className="xf-books-page relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#1f1d1a]">
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
        .books-hero-search {
          border: 1px solid rgba(124, 77, 255, 0.22);
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 4px 14px rgba(124, 77, 255, 0.09);
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        }
        .books-hero-search:focus-within {
          border-color: rgba(124, 77, 255, 0.46);
          box-shadow: 0 8px 20px rgba(124, 77, 255, 0.16);
          transform: translateY(-1px);
        }
        .books-hero-search .materials-search-input {
          font-size: 16px;
          line-height: 1.2;
          color: #43336f;
          height: 100%;
        }
        .books-hero-search .materials-search-input::placeholder {
          color: #9a8fc4;
          font-weight: 500;
        }
        .books-hero-control {
          height: 56px;
          min-height: 56px;
          max-height: 56px;
          border-radius: 16px;
        }
        .xf-books-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: #f3f2f8;
          color: #1f1d1a;
        }
        .xf-books-page .books-mobile-main {
          position: relative;
          z-index: 1;
          max-width: 1280px;
          margin: 0 auto;
          box-sizing: border-box;
          padding: 76px 16px 64px;
        }
        html.xf-mp-webview .books-mobile-main {
          --xf-mp-outer-gutter: clamp(8px, 2.4vw, 10px);
          --xf-mp-inner-gutter: clamp(3px, 1vw, 4px);
          width: calc(100% - var(--xf-mp-outer-gutter)) !important;
          padding-left: var(--xf-mp-inner-gutter) !important;
          padding-right: var(--xf-mp-inner-gutter) !important;
          padding-top: var(--xf-mp-nav-height, 88px) !important;
          padding-bottom: 0 !important;
        }
        .xf-books-page .books-mobile-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid #d8d0ef;
          border-radius: 32px;
          background: radial-gradient(circle at 10% 0%, rgba(143,100,255,.1), transparent 40%), linear-gradient(135deg, #f4f1fd 0%, #faf8ff 48%, #f0ebff 100%);
          padding: 28px;
          box-shadow: 0 24px 80px rgba(80,62,125,.1);
        }
        .xf-books-page .books-mobile-hero > div:first-child > div:first-child {
          display: inline-flex;
          border: 1px solid #cfc2ef;
          border-radius: 999px;
          background: #f3eefc;
          padding: 4px 16px;
          color: #5b3fa1;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .26em;
          text-transform: uppercase;
        }
        .xf-books-page .books-hero-logo {
          display: block;
          width: min(100%, 300px);
          height: auto;
          margin-top: 16px;
          object-fit: contain;
        }
        .xf-books-page .books-mobile-hero p {
          margin: 12px 0 0;
          max-width: 720px;
          color: #6f62a3;
          font-size: 16px;
          line-height: 1.8;
        }
        .xf-books-page .books-mobile-hero > div:nth-child(2) {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }
        .xf-books-page .books-hero-search {
          display: inline-flex;
          flex: 1 1 auto;
          align-items: center;
          gap: 8px;
          box-sizing: border-box;
          padding: 0 16px;
        }
        .xf-books-page .books-hero-control {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          border-radius: 16px;
        }
        .xf-books-page button.books-hero-control {
          flex: 0 0 auto;
          border: 1px solid #cfc2ee;
          background: #fff;
          padding: 0 20px;
          color: #654f88;
          font-size: 14px;
          font-weight: 800;
        }
        .xf-books-page .books-mobile-filter {
          margin-top: 24px;
          border: 1px solid #e0d9f2;
          border-radius: 28px;
          background: #fff;
          padding: 20px;
          box-shadow: 0 16px 50px rgba(80,62,125,.06);
        }
        .xf-books-page .books-mobile-filter .flex.flex-col.gap-3,
        .xf-books-page .books-mobile-filter .md\\:flex-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .xf-books-page .books-mobile-label {
          flex: 0 0 72px;
          width: 72px;
          padding-top: 4px;
          color: #6b5fa0;
          font-size: 14px;
          font-weight: 900;
          letter-spacing: .1em;
        }
        .xf-books-page .books-mobile-filter .flex-1 {
          flex: 1 1 auto;
          min-width: 0;
        }
        .xf-books-page .books-mobile-filter .flex.flex-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .xf-books-page .books-filter-chip {
          min-height: 42px;
          border-radius: 999px;
          border: 1px solid #d8c8ef;
          background: #fff;
          padding: 9px 18px;
          color: #6b5fa0;
          font-size: 15px;
          font-weight: 400 !important;
          line-height: 1.2;
        }
        .xf-books-page .books-filter-chip.border-\\[\\#5e17eb\\] {
          border-color: #5e17eb;
          background: #5e17eb;
          color: #fff;
        }
        .xf-books-page .books-mobile-filter > div:last-child {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-top: 20px;
          color: #7b6bb8;
          font-size: 14px;
        }
        .xf-books-page .books-mobile-filter > div:last-child span {
          border-radius: 999px;
          padding: 4px 10px;
        }
        .xf-books-page .books-mobile-main > section.mt-6 {
          display: block;
          margin-top: 24px;
        }
        .xf-books-page .books-mobile-main > section.mt-6 > section,
        .xf-books-page .books-mobile-main > section.mt-6 > div {
          box-sizing: border-box;
          border: 1px solid #e2dcf0;
          border-radius: 24px;
          background: #fff;
          padding: 20px;
          box-shadow: 0 12px 40px rgba(80,62,125,.05);
        }
        .xf-books-page .books-mobile-card {
          display: block;
          break-inside: avoid;
          margin-bottom: 12px;
        }
        .xf-books-page .books-mobile-card article {
          overflow: hidden;
          border: 1px solid #e2dcf0;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 18px rgba(60,40,80,.06);
        }
        .xf-books-page .book-card-article {
          overflow: hidden;
          border: 1px solid #e2dcf0;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 18px rgba(60,40,80,.06);
        }
        .xf-books-page .books-mobile-card a,
        .xf-books-page .books-mobile-card .block {
          display: block;
          color: inherit;
          text-decoration: none;
        }
        .xf-books-page .books-mobile-card article > div,
        .xf-books-page .books-mobile-card article > a > div:first-child {
          box-sizing: border-box;
        }
        .xf-books-page .book-card-cover-frame {
          box-sizing: border-box;
          width: 100%;
          padding: 8px;
        }
        .xf-books-page .book-card-cover-shell {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 180px;
          overflow: hidden;
          border-radius: 12px;
          background: #f8f5ff;
        }
        .xf-books-page .books-mobile-card img {
          display: block;
          max-width: 100%;
          height: auto;
          object-fit: contain;
        }
        .xf-books-page .book-card-cover-image {
          display: block;
          width: 100%;
          max-width: 100%;
          max-height: 360px;
          height: auto;
          object-fit: contain;
        }
        .xf-books-page .book-card-body {
          box-sizing: border-box;
          padding: 4px 12px 12px;
        }
        .xf-books-page .book-card-title {
          margin: 0;
          display: -webkit-box;
          overflow: hidden;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          color: #2b1a3a;
          font-size: 22px;
          line-height: 1.18;
          font-weight: 900;
        }
        .xf-books-page .book-card-meta,
        .xf-books-page .book-card-publisher {
          margin: 8px 0 0;
          color: #6f62a4;
          font-size: 14px;
        }
        .xf-books-page .book-card-publisher {
          color: #8b7dbc;
          font-size: 12px;
        }
        .xf-books-page .book-card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }
        .xf-books-page .book-card-tag {
          display: inline-flex;
          align-items: center;
          max-width: 100%;
          border-radius: 999px;
          border: 1px solid #d5c8ff;
          background: #f6f0ff;
          padding: 4px 10px;
          color: #5e17eb;
          font-size: 11px;
          font-weight: 800;
          line-height: 1.25;
        }
        .xf-books-page .book-card-tag-grade {
          border-color: #d9d8ee;
          background: #f7f7ff;
          color: #4e4c87;
        }
        .xf-books-page .book-card-tag-category {
          border-color: #f1d9ee;
          background: #fff5ff;
          color: #8a3daa;
        }
        .xf-books-page .book-card-tag-topic {
          border-color: #cde6ea;
          background: #f2fbfe;
          color: #25678a;
        }
        .xf-books-page .book-card-source-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 8px;
          border-top: 1px solid #f0ebff;
          padding-top: 8px;
          color: #a9a2d4;
          font-size: 12px;
        }
        .xf-books-page .book-card-source {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .xf-books-page .book-card-detail-link {
          flex-shrink: 0;
          color: #7C3AED;
          font-weight: 800;
        }
        @media (max-width: 768px) {
          .xf-books-page .books-mobile-main { padding-left: 16px !important; padding-right: 16px !important; }
          .books-mobile-main { padding-top: 70px !important; padding-bottom: calc(120px + env(safe-area-inset-bottom)) !important; }
          html.xf-mp-webview .books-mobile-main {
            --xf-mp-outer-gutter: clamp(8px, 2.4vw, 10px);
            --xf-mp-inner-gutter: clamp(3px, 1vw, 4px);
            width: calc(100% - var(--xf-mp-outer-gutter)) !important;
            padding-left: var(--xf-mp-inner-gutter) !important;
            padding-right: var(--xf-mp-inner-gutter) !important;
            padding-top: var(--xf-mp-nav-height, 88px) !important;
            padding-bottom: 0 !important;
          }
          .books-mobile-main.xw-layer-main { padding-top: 24px !important; }
          .books-mobile-hero { padding: 16px !important; border-radius: 20px !important; }
          .xf-books-page .books-mobile-hero > div:nth-child(2) { flex-direction: column; }
          .xf-books-page .books-hero-logo { width: min(100%, 236px); }
          .xf-books-page .books-mobile-hero p { font-size: 15px; line-height: 1.65; }
          .books-mobile-filter { padding: 12px !important; border-radius: 16px !important; }
          .xf-books-page .books-mobile-filter .flex.flex-col.gap-3,
          .xf-books-page .books-mobile-filter .md\\:flex-row { align-items: flex-start; gap: 10px; }
          .books-mobile-label {
            flex: 0 0 auto !important;
            width: auto !important;
            padding-top: 0 !important;
            font-size: 12px !important;
            line-height: 1.2 !important;
          }
          .xf-books-page .books-filter-chip { min-height: 32px !important; padding: 6.5px 13px !important; font-size: 14.3px !important; font-weight: 400 !important; line-height: 1.2 !important; }
          .books-mobile-card h3 { font-size: 16px !important; }
          .xf-books-page .book-card-title { font-size: 18px !important; }
          .xf-books-page .book-card-cover-shell { min-height: 148px; }
          .xf-books-page .book-card-cover-image { max-height: 280px; }
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
        showSearch
        searchPlaceholder="搜索书名、作者、出版社、推荐人"
        searchValue={keyword}
        onSearchChange={setKeyword}
      />
      <main className={`books-mobile-main mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8 ${superModePage ? "xw-layer-main" : ""}`}>
        <section className="books-mobile-hero group relative overflow-hidden rounded-[2rem] border border-[#d8d0ef] bg-[radial-gradient(circle_at_10%_0%,_rgba(143,100,255,0.1),_transparent_40%),linear-gradient(135deg,_#f4f1fd_0%,_#faf8ff_48%,_#f0ebff_100%)] p-7 shadow-[0_24px_80px_rgba(80,62,125,0.1)] sm:p-9">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-[#5b3fa1]">
                Reading Shelf
              </div>
              <img
                src="/assets/jiyue-hero-logo.png"
                alt="及阅 · 成长及阅读"
                className="books-hero-logo mt-4 block h-auto w-full max-w-[300px] object-contain sm:max-w-[360px]"
              />
              <p className="mt-3 text-sm leading-7 text-[#6f62a3] sm:text-base">
                基于节目实践沉淀的书籍清单。可先按推荐人聚合浏览，再结合年级和关键词快速筛选。
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <label className="books-hero-search books-hero-control inline-flex flex-1 items-center gap-2 border border-[#d8d0ef] bg-white px-4 shadow-sm">
                <span className="material-symbols-outlined text-[#8f7bd6]">search</span>
                <input
                  value={keyword}
                  onChange={(event) => {
                    if (!isLoggedIn) {
                      document.dispatchEvent(new CustomEvent("xf-show-login-modal", { detail: { title: "登录后即可搜索", description: "登录后可查看完整书单、使用搜索和筛选功能，获得个性化阅读推荐。" } }));
                      return;
                    }
                    setKeyword(event.target.value);
                  }}
                  placeholder="搜索书名、作者、出版社、推荐人"
                  className="materials-search-input w-full border-0 bg-transparent text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                />
              </label>
              <button
                type="button"
                onClick={clearFilters}
                className="books-hero-control inline-flex items-center justify-center border border-[#cfc2ee] bg-white px-5 text-sm font-bold text-[#654f88] transition hover:border-[#5e17eb] hover:text-[#5e17eb]"
              >
                清空筛选
              </button>
            </div>
        </section>

        <section className="books-mobile-filter mt-6 rounded-[1.8rem] border border-[#e0d9f2] bg-white p-5 shadow-[0_16px_50px_rgba(80,62,125,0.06)] sm:p-6">
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

          <div className="flex flex-col gap-3 md:flex-row md:items-start mb-4">
            <div className="books-mobile-label w-[72px] pt-1 text-sm font-black tracking-[0.1em] text-[#6b5fa0]">年级</div>
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                {gradeOptions.map((grade) => {
                  const active = selectedGrades.includes(grade);
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => toggleGrade(grade)}
                      className={`books-filter-chip rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-[#5e17eb] bg-[#5e17eb] text-white"
                          : "border-[#d8c8ef] bg-white text-[#6b5fa0] hover:border-[#5e17eb] hover:bg-[#faf8ff]"
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

          <div className="flex flex-col gap-3 md:flex-row md:items-start mb-4">
            <div className="books-mobile-label w-[72px] pt-1 text-sm font-black tracking-[0.1em] text-[#6b5fa0]">主题</div>
            <div className="relative flex-1">
              <div className="flex flex-wrap gap-2">
                {visibleTopicOptions.map((topic) => {
                  const active = selectedTopics.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleTopic(topic)}
                      className={`books-filter-chip rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-[#5e17eb] bg-[#5e17eb] text-white"
                          : "border-[#d8c8ef] bg-white text-[#6b5fa0] hover:border-[#5e17eb] hover:bg-[#faf8ff]"
                      }`}
                    >
                      {topic}
                    </button>
                  );
                })}
                {topicOptions.length === 0 ? <span className="text-sm text-[#8b7db6]">暂无可筛选主题</span> : null}
              </div>
              <div
                ref={topicMeasureRef}
                aria-hidden="true"
                className="pointer-events-none invisible absolute left-0 top-0 flex h-0 w-full flex-wrap gap-2 overflow-hidden"
              >
                {topicOptions.map((topic) => (
                  <span
                    key={`measure-${topic}`}
                    data-topic-measure-chip
                    className="books-filter-chip inline-block rounded-full border border-[#d8c8ef] bg-white px-3 py-1.5 text-xs font-bold text-[#6b5fa0]"
                  >
                    {topic}
                  </span>
                ))}
              </div>
              {hasMoreTopicOptions ? (
                <div className="mt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setTopicExpanded((expanded) => !expanded)}
                    className="border-0 bg-transparent p-0 text-xs font-semibold text-[#7C3AED]"
                    style={{ fontSize: 12 }}
                  >
                    {topicExpanded ? "收起 ▲" : "展开全部 ▼"}
                  </button>
                </div>
              ) : null}
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
            {selectedTopics.map((item) => (
              <span key={`topic-${item}`} className="rounded-full bg-[#fef7ee] px-2.5 py-1 text-xs font-bold text-[#8e6b3e]">
                主题: {item}
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
                    {group.items.map((item, index) => (
                      <div key={item._id} className="books-mobile-card"><BookCard item={item} imageIndex={index} /></div>
                    ))}
                  </div>
                </section>
              ))
            : null}

          {!loading && !fromGuestLink ? (
            <section className="rounded-[1.5rem] border border-[#e2dcf0] bg-white p-5 shadow-[0_12px_40px_rgba(80,62,125,0.05)]">
              <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
                {pagedFlat.map((item, index) => (
                  <div key={item._id} className="books-mobile-card"><BookCard item={item} imageIndex={index} /></div>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          mobileAutoLoad
          mobileHasMore={safePage < totalPages}
          onMobileLoadMore={() => setPage((value) => Math.min(totalPages, value + 1))}
          onPageChange={setPage}
        />
      </main>
    </div>
  );
};

export default BooksPage;
