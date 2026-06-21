import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import GlobalPublicNav from "../components/GlobalPublicNav";
import { Book, BookMetadataDetail, publicApi } from "../services/api";
import { buildBookCoverImageSrc, getPreferredBookCover, hasUsableBookCover } from "../utils/bookCover";

type PathChip = {
  label: string;
  text: string;
  to?: string;
  href?: string;
};

type BookDetailLocationState = {
  fromReadingDetail?: string;
};

function isPathChip(item: PathChip | null): item is PathChip {
  return Boolean(item);
}

function unwrapBookResponse(value: unknown): Book | null {
  const first = (value as { data?: unknown })?.data ?? value;
  const second = (first as { data?: unknown })?.data ?? first;
  if (!second || typeof second !== "object" || Array.isArray(second)) return null;
  return second as Book;
}

function getBookIdFromPath(pathname: string): string {
  const normalized = pathname.startsWith("/v2/") ? pathname.slice(3) : pathname;
  const match = normalized.match(/^\/reading\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getSourceGuestId(value: Book["sourceGuestId"]): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return String(value._id || "").trim();
}

function buildSourceLine(book: Book): string {
  const sourceName = String(book.sourceName || "").trim();
  const guest = String(book.recommendedGuest || "").trim();
  if (sourceName) return `来自《${sourceName}》`;
  if (guest) return `${guest}推荐`;
  return "";
}

function buildSourceReadingHref(book: Book, sourceGuestId: string): string {
  const guest = String(book.recommendedGuest || "").trim();
  const sourceName = String(book.sourceName || "").trim();
  if (!sourceGuestId && !sourceName) {
    return `/reading?q=${encodeURIComponent(book.topic || book.categoryLabel || book.title)}`;
  }

  const params = new URLSearchParams();
  if (sourceGuestId) params.set("sourceGuestId", sourceGuestId);
  if (guest) params.set("guest", guest);
  if (sourceName) params.set("sourceName", sourceName);
  return `/reading?${params.toString()}`;
}

function buildNextStepChips(
  book: Book,
  sourceLineHref: string,
  guestCardHref: string,
  stageLabel: string
): PathChip[] {
  const guest = String(book.recommendedGuest || "").trim();
  const sourceName = String(book.sourceName || "").trim();

  const chips: Array<PathChip | null> = [
    sourceName
      ? {
          label: "来源书单",
          text: `《${sourceName}》`,
          to: sourceLineHref || undefined,
        }
      : null,
    guest
      ? {
          label: "推荐人",
          text: `查看${guest}`,
          to: guestCardHref || undefined,
        }
      : null,
    stageLabel
      ? {
          label: "推荐阅读",
          text: stageLabel,
        }
      : null,
    {
      label: "延伸阅读",
      text: "继续找同类书",
      to: `/reading?q=${encodeURIComponent(book.topic || book.categoryLabel || book.title)}`,
    },
  ];
  return chips.filter(isPathChip);
}

function buildIntroParagraphs(intro: string): string[] {
  const normalized = intro.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const explicitParagraphs = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (explicitParagraphs.length > 1) return explicitParagraphs;

  const singleBlock = normalized.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const sentences = singleBlock.split(/(?<=[。！？])/u).map((sentence) => sentence.trim()).filter(Boolean);
  if (sentences.length <= 2) return [singleBlock];

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(""));
  }
  return paragraphs;
}

function getMetadataSourceLabel(source: string | undefined): string {
  const normalized = String(source || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "weread_web" || normalized === "weread") return "微信读书";
  if (normalized === "google_books") return "Google Books";
  if (normalized === "open_library") return "Open Library";
  return String(source || "").trim();
}

function formatMetadataRating(rating: number | null | undefined): string {
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) return "";
  const normalized = rating >= 100 ? rating / 100 : rating;
  return `${normalized.toFixed(1)} 分`;
}

const BookDetailPage: React.FC = () => {
  const { id: routeId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const id = routeId || getBookIdFromPath(location.pathname);
  const [book, setBook] = useState<Book | null>(null);
  const [metadata, setMetadata] = useState<BookMetadataDetail | null>(null);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [relatedMetadataByBookId, setRelatedMetadataByBookId] = useState<Record<string, BookMetadataDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    if (!id) {
      setBook(null);
      setMetadata(null);
      setAllBooks([]);
      setError("书籍详情加载失败");
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    Promise.allSettled([
      publicApi.getBook(id),
      publicApi.getBookMetadata(id),
      publicApi.getBooks(),
    ])
      .then(([bookResult, metadataResult, booksResult]) => {
        if (!alive) return;

        if (bookResult.status !== "fulfilled") {
          const nextError =
            (bookResult.reason as any)?.response?.data?.message ||
            (bookResult.reason as any)?.message ||
            "书籍详情加载失败";
          setError(nextError);
          setBook(null);
          setMetadata(null);
          return;
        }

        const nextBook = unwrapBookResponse(bookResult.value);
        if (!nextBook) {
          setError("书籍详情加载失败");
          setBook(null);
          setMetadata(null);
          return;
        }

        setBook(nextBook);

        if (metadataResult.status === "fulfilled") {
          setMetadata(metadataResult.value.data);
        } else {
          setMetadata(null);
        }

        if (booksResult.status === "fulfilled") {
          setAllBooks(Array.isArray(booksResult.value.data) ? booksResult.value.data : []);
        } else {
          setAllBooks([]);
        }
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id]);

  const heroImage = book ? getPreferredBookCover(book, metadata) : "";
  const relatedBookCandidates = useMemo(() => {
    if (!book) return [];
    const sourceName = String(book.sourceName || "").trim();
    const sourceGuestId = getSourceGuestId(book.sourceGuestId);
    const guest = String(book.recommendedGuest || "").trim();

    return allBooks.filter((item) => {
      if (!item || String(item._id || "") === String(book._id || "")) return false;
      const itemSourceGuestId = getSourceGuestId(item.sourceGuestId);
      const itemSourceName = String(item.sourceName || "").trim();
      const itemGuest = String(item.recommendedGuest || "").trim();
      if (sourceGuestId && itemSourceGuestId === sourceGuestId) return true;
      if (sourceName && itemSourceName === sourceName) return true;
      return !sourceGuestId && !sourceName && guest && itemGuest === guest;
    });
  }, [allBooks, book]);

  useEffect(() => {
    let alive = true;
    const ids = relatedBookCandidates
      .filter((item) => item.hasMetadataDetail)
      .map((item) => String(item._id || "").trim())
      .filter(Boolean);

    if (!ids.length) {
      setRelatedMetadataByBookId({});
      return () => {
        alive = false;
      };
    }

    Promise.allSettled(ids.map((relatedId) => publicApi.getBookMetadata(relatedId)))
      .then((results) => {
        if (!alive) return;
        const next: Record<string, BookMetadataDetail> = {};
        results.forEach((result, index) => {
          if (result.status !== "fulfilled" || !result.value?.data) return;
          next[ids[index]] = result.value.data;
        });
        setRelatedMetadataByBookId(next);
      });

    return () => {
      alive = false;
    };
  }, [relatedBookCandidates]);

  const relatedBooks = useMemo(() => {
    return [...relatedBookCandidates]
      .sort((a, b) => {
        const coverA = Boolean(getPreferredBookCover(a, relatedMetadataByBookId[a._id]));
        const coverB = Boolean(getPreferredBookCover(b, relatedMetadataByBookId[b._id]));
        if (coverA !== coverB) return coverA ? -1 : 1;

        const publishedAtA = String(a.publishedDate || a.publishedAt || "");
        const publishedAtB = String(b.publishedDate || b.publishedAt || "");
        const da = publishedAtA ? new Date(publishedAtA).getTime() : 0;
        const db = publishedAtB ? new Date(publishedAtB).getTime() : 0;
        return db - da;
      })
      .slice(0, 10);
  }, [relatedBookCandidates, relatedMetadataByBookId]);
  const locationState = location.state as BookDetailLocationState | null;
  const previousReadingDetailPath = locationState?.fromReadingDetail || "";
  const shouldReturnToPreviousDetail = previousReadingDetailPath.startsWith("/reading/");
  const backLinkTarget = shouldReturnToPreviousDetail ? previousReadingDetailPath : "/reading";

  function handleBackClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!shouldReturnToPreviousDetail) return;
    event.preventDefault();
    navigate(-1);
  }

  return (
    <div className="min-h-screen bg-[#f3f2f8] text-[#1f1736]">
      <GlobalPublicNav compactMobile showProgramEntry showExpertsEntry />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-[88px] sm:px-6 lg:px-8">
        <div className="mb-5">
          <Link
            to={backLinkTarget}
            onClick={handleBackClick}
            className="inline-flex items-center gap-1.5 p-0 text-sm font-semibold !text-[#7C3AED] visited:!text-[#7C3AED] hover:!text-[#6D28D9]"
          >
            ← 返回
          </Link>
        </div>

        {loading ? (
          <section className="rounded-[2rem] border border-[#ded7f3] bg-white p-8 shadow-[0_18px_60px_rgba(80,62,125,0.08)]">
            <div className="animate-pulse space-y-4">
              <div className="h-8 w-40 rounded-full bg-[#ece3f7]" />
              <div className="h-14 w-full max-w-3xl rounded-xl bg-[#ece3f7]" />
              <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="aspect-[3/4] rounded-[1.5rem] bg-[#ece3f7]" />
                <div className="space-y-4">
                  <div className="h-28 rounded-[1.5rem] bg-[#ece3f7]" />
                  <div className="h-44 rounded-[1.5rem] bg-[#ece3f7]" />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && error ? (
          <section className="rounded-[2rem] border border-red-100 bg-white px-6 py-10 text-center shadow-[0_18px_60px_rgba(80,62,125,0.08)]">
            <h1 className="text-2xl font-black text-[#2b1a3a]">未找到这本书</h1>
            <p className="mt-3 text-sm text-[#7f73a7]">{error}</p>
          </section>
        ) : null}

        {!loading && !error && book ? (() => {
          const sourceName = String(book.sourceName || "").trim();
          const sourceLine = buildSourceLine(book);
          const sourceGuestId = getSourceGuestId(book.sourceGuestId);
          const sourceLineHref = sourceName ? buildSourceReadingHref(book, sourceGuestId) : "";
          const formattedRating = formatMetadataRating(metadata?.rating);
          const ratingSummary = [
            metadata?.ratingLabel || formattedRating,
            metadata?.ratingCount ? `${metadata.ratingCount} 人评价` : "",
          ].filter(Boolean).join(" / ");
          const ratingSourceLabel = getMetadataSourceLabel(metadata?.source);
          const hasRating = Boolean(ratingSummary);
          const intro = metadata?.description || "";
          const introParagraphs = buildIntroParagraphs(intro);
          const stageLabel = String(book.grade || "").trim();
          const guestCardHref = sourceGuestId ? `/experts/${sourceGuestId}` : "";
          const nextStepChips = buildNextStepChips(
            book,
            sourceLineHref,
            guestCardHref,
            stageLabel
          );
          const relatedReadingChip = nextStepChips.find((chip) => chip.label === "延伸阅读") || null;
          const topNextStepChips = nextStepChips.filter((chip) => chip.label !== "延伸阅读");
          const topSourceLine = !sourceName && sourceLine ? sourceLine : "";

          return (
            <div className="space-y-8">
              <section className="overflow-hidden rounded-[2rem] border border-[#ded7f3] bg-white shadow-[0_18px_60px_rgba(80,62,125,0.08)]">
                <div className="grid gap-0 lg:grid-cols-[minmax(260px,0.42fr)_minmax(0,0.58fr)]">
                  <div className="flex items-center justify-center bg-[linear-gradient(135deg,#f5f1ff,#ffffff)] p-6 sm:p-8">
                    <div className="w-full max-w-[300px] overflow-hidden rounded-[1.75rem] border border-[#e5def6] bg-white p-2 shadow-[0_18px_40px_rgba(80,62,125,0.08)] sm:max-w-[360px]">
                      {hasUsableBookCover(heroImage) ? (
                        <div className="overflow-hidden rounded-[1.15rem] bg-white">
                          <img
                            src={buildBookCoverImageSrc(heroImage)}
                            alt={metadata?.title || book.title || "书籍封面"}
                            className="block h-auto w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-[3/4] items-center justify-center bg-[linear-gradient(135deg,#f5f1ff,#ede6ff)] text-[72px] font-black text-[#cfc4f0]">
                          书
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col p-6 sm:p-8 lg:p-10">
                    <div className="inline-flex w-fit self-start rounded-full bg-[#f1eaff] px-3 py-1 text-xs font-black text-[#6d28d9]">来自及阅</div>
                    <h1 className="mt-4 text-3xl font-black leading-tight text-[#24163a] sm:text-5xl">
                      {metadata?.title || book.title}
                    </h1>
                    <div className="mt-4 space-y-2 text-sm font-semibold text-[#6b5f95]">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-[#7C3AED]">作者</span>
                        <span>{metadata?.author || book.author || "未标注"}</span>
                      </div>
                      {book.translator ? (
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-[#7C3AED]">译者</span>
                          <span>{book.translator}</span>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-[#7C3AED]">出版社</span>
                        <span>{metadata?.publisher || book.publisher || "未标注"}</span>
                      </div>
                      {metadata?.isbn ? (
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-[#7C3AED]">ISBN</span>
                          <span>{metadata.isbn}</span>
                        </div>
                      ) : null}
                      {hasRating ? (
                        <div>
                          <div className="flex flex-wrap items-baseline gap-1.5">
                            <span className="text-[#7C3AED]">评分</span>
                            <span>{ratingSummary}</span>
                          </div>
                        </div>
                      ) : null}
                      {book.publishedDate ? (
                        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                          {book.publishedDate ? <span>出版时间：{book.publishedDate}</span> : null}
                        </div>
                      ) : null}
                    </div>

                    {topSourceLine ? (
                      <div className="mt-5 space-y-3 text-sm font-semibold text-[#6b5f95]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{topSourceLine}</span>
                        </div>
                      </div>
                    ) : null}

                    {ratingSourceLabel || relatedReadingChip?.to ? (
                      <div className="mt-auto flex items-end gap-4 pt-6">
                        {ratingSourceLabel ? (
                          <div className="text-xs font-medium text-[#9b95b8]">数据来源：{ratingSourceLabel}</div>
                        ) : null}
                        {relatedReadingChip?.to ? (
                          <Link
                            to={relatedReadingChip.to}
                            className="ml-auto inline-flex items-center gap-2 text-[13px] font-semibold !text-[#7C3AED] visited:!text-[#7C3AED] transition hover:!text-[#6D28D9]"
                          >
                            继续找同类书
                            <span
                              aria-hidden="true"
                              className="inline-flex h-2.5 w-2.5 rounded-full bg-[#7C3AED] opacity-80 animate-pulse"
                            />
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              {topNextStepChips.length > 0 ? (
                <section className="rounded-[2rem] border border-[#ded7f3] bg-white p-5 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-6">
                <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                  MORE CONTENT
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {topNextStepChips.map((chip) => (
                    chip.to ? (
                      <Link
                        key={chip.label}
                        to={chip.to}
                        className="rounded-[1.4rem] border border-[#ece5fb] bg-[#fcfbff] p-5 transition hover:-translate-y-0.5 hover:border-[#cdbcf4]"
                      >
                        <span className="text-[11px] font-black tracking-[0.02em] text-[#8d84b6]">{chip.label}</span>
                        <span className="mt-2 block text-lg font-black leading-tight text-[#24163a]">{chip.text}</span>
                      </Link>
                    ) : (
                      <div
                        key={chip.label}
                        className="rounded-[1.4rem] border border-[#ece5fb] bg-[#fcfbff] p-5"
                      >
                        <span className="text-[11px] font-black tracking-[0.02em] text-[#8d84b6]">{chip.label}</span>
                        <span className="mt-2 block text-lg font-black leading-tight text-[#24163a]">{chip.text}</span>
                      </div>
                    )
                  ))}
                </div>
              </section>
              ) : null}

              {intro ? (
                <section id="book-intro">
                  <article className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
                    <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                      BOOK INFO
                    </div>
                    <h2 className="mt-2 text-2xl font-black text-[#24163a]">内容简介</h2>
                    <div className="mt-5 max-w-4xl space-y-4">
                      {introParagraphs.map((paragraph, index) => (
                        <p
                          key={`${index}-${paragraph.slice(0, 12)}`}
                          className="whitespace-pre-wrap text-[17px] leading-[2.05] tracking-[0.01em] text-[#4f456f]"
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </article>
                </section>
              ) : null}

              {relatedBooks.length > 0 ? (
                <section className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
                  <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                    RELATED BOOKS
                  </div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-[#24163a]">相关图书</h2>
                  <p className="mt-2 text-sm text-[#7b70a4]">同来源书单或同推荐线索下的其他图书。</p>
                  <div className="mt-4 -mx-2 overflow-x-auto px-2 pb-2">
                    <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                      {relatedBooks.map((item) => {
                        const relatedMetaLine = String(item.author || item.publisher || "").trim();
                        const relatedCover = getPreferredBookCover(item, relatedMetadataByBookId[item._id]);
                        const cardInner = (
                          <>
                            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#f3eefc]">
                              {relatedCover ? (
                                <img
                                  src={buildBookCoverImageSrc(relatedCover)}
                                  alt={item.title || "相关图书封面"}
                                  className="h-full w-full object-cover transition group-hover:scale-105"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#f5f1ff,#ede6ff)] text-[42px] font-black text-[#cfc4f0]">
                                  书
                                </div>
                              )}
                            </div>
                            <div className="mt-2 text-center">
                              <div className="line-clamp-2 text-xs font-black leading-tight text-[#241a3a]">{item.title || "未命名书籍"}</div>
                              {relatedMetaLine ? (
                                <div className="mt-0.5 line-clamp-2 text-[10px] font-bold leading-snug text-[#8e81b3]">{relatedMetaLine}</div>
                              ) : null}
                            </div>
                          </>
                        );

                        return item.hasMetadataDetail ? (
                          <Link
                            key={item._id}
                            to={`/reading/${item._id}`}
                            state={{ fromReadingDetail: `${location.pathname}${location.search}` }}
                            className="group relative block w-[120px] shrink-0 rounded-[1.25rem] border border-[#e8e0f2] bg-[#fcfaff] p-2.5 transition hover:border-[#b79bff] hover:bg-white sm:w-[140px]"
                          >
                            {cardInner}
                          </Link>
                        ) : (
                          <div
                            key={item._id}
                            className="group relative w-[120px] shrink-0 rounded-[1.25rem] border border-[#e5e2ec] bg-[#f1eff5] p-2.5 opacity-80 grayscale-[0.18] sm:w-[140px]"
                          >
                            {cardInner}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ) : null}

            </div>
          );
        })() : null}
      </main>
    </div>
  );
};

export default BookDetailPage;
