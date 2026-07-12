import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import GlobalPublicNav from "../components/GlobalPublicNav";
import { publicApi, type ExternalBookLibraryRecord } from "../services/api";
import { buildBookCoverImageSrc } from "../utils/bookCover";
import { readExternalBookLibraryRecord, readExternalBookLibraryRecords, rememberExternalBookLibraryRecord } from "../utils/externalBookLibraryStorage";
import { isMiniProgramWebView } from "../utils/mpAuthBridge";

const TRANSLATE_SYMBOL_MASK_URL = "/assets/library-translate-symbol-mask.png";

type DetailFact = {
  label: string;
  value: string;
  searchQuery?: string;
};

function splitValues(value: string): string[] {
  return String(value || "")
    .split(/[;；,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatValue(value: string | number | null | undefined): string {
  return String(value ?? "").trim();
}

function hasDisplayValue(value: string | number | null | undefined): boolean {
  const normalized = String(value ?? "").trim();
  if (!normalized) return false;
  return !["none", "null", "undefined", "n/a", "na", "-"].includes(normalized.toLowerCase());
}

function formatFictionLabel(value: string): string {
  const normalized = String(value || "").trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return "";
  if (["1", "true", "fiction", "fictional", "yes", "y", "虚构"].includes(lower)) return "虚构";
  if (["0", "false", "nonfiction", "non-fiction", "no", "n", "非虚构"].includes(lower)) return "非虚构";
  return normalized;
}

function formatLevelLabel(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const match = normalized.match(/^花生\s*(\d+)\s*级$/);
  if (match) return `Level ${match[1]}`;
  return normalized;
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

function buildDetailFacts(book: ExternalBookLibraryRecord): DetailFact[] {
  return [
    { label: "作者", value: formatValue(book.author), searchQuery: formatValue(book.author) },
    { label: "出版社", value: formatValue(book.publisher), searchQuery: formatValue(book.publisher) },
    { label: "ISBN", value: formatValue(book.isbn) },
    { label: "出版时间", value: formatValue(book.pubDate) },
    { label: "页数", value: book.pages ? `${book.pages} 页` : "" },
    { label: "词汇量", value: formatValue(book.words) },
    { label: "Lexile", value: formatValue(book.lexile) },
    { label: "AR", value: formatValue(book.ar) },
    { label: "难度", value: formatLevelLabel(book.levelRange) },
    { label: "是否虚构", value: formatFictionLabel(book.fiction) },
    { label: "系列", value: formatValue(book.series) },
  ].filter((fact) => hasDisplayValue(fact.value));
}

function buildRelatedBooks(book: ExternalBookLibraryRecord, candidates: ExternalBookLibraryRecord[]): ExternalBookLibraryRecord[] {
  const currentId = String(book.id || "");
  const bookTags = new Set(splitValues(book.tags || book.category));
  const bookLevel = formatLevelLabel(book.levelRange);
  const bookFiction = formatFictionLabel(book.fiction);
  const fallback: ExternalBookLibraryRecord[] = [];

  const matched = candidates
    .filter((item) => item?.id && String(item.id) !== currentId)
    .map((item) => {
      const itemTags = splitValues(item.tags || item.category);
      let score = 0;
      if (itemTags.some((tag) => bookTags.has(tag))) score += 3;
      if (bookLevel && formatLevelLabel(item.levelRange) === bookLevel) score += 2;
      if (bookFiction && formatFictionLabel(item.fiction) === bookFiction) score += 1;
      fallback.push(item);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item);

  return (matched.length > 0 ? matched : fallback).slice(0, 10);
}

function getExternalBookIdFromPath(pathname: string): string {
  const normalized = pathname.startsWith("/v2/") ? pathname.slice(3) : pathname;
  const match = normalized.match(/^\/library\/([^/?#]+)/);
  if (!match) return "";

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function getExternalBookIdFromSearch(search: string): string {
  return formatValue(new URLSearchParams(search).get("xf_external_book_id"));
}

function externalBookFromMiniProgramPayload(search: string, expectedId: string): ExternalBookLibraryRecord | null {
  try {
    const raw = new URLSearchParams(search).get("xf_external_book");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const id = formatValue((parsed as Partial<ExternalBookLibraryRecord>).id);
    if (!id || (expectedId && id !== expectedId)) return null;
    return {
      id,
      title: formatValue((parsed as Partial<ExternalBookLibraryRecord>).title),
      coverPic: formatValue((parsed as Partial<ExternalBookLibraryRecord>).coverPic),
      author: formatValue((parsed as Partial<ExternalBookLibraryRecord>).author),
      publisher: formatValue((parsed as Partial<ExternalBookLibraryRecord>).publisher),
      isbn: formatValue((parsed as Partial<ExternalBookLibraryRecord>).isbn),
      pubDate: formatValue((parsed as Partial<ExternalBookLibraryRecord>).pubDate),
      pages: Number.isFinite(Number((parsed as Partial<ExternalBookLibraryRecord>).pages)) ? Number((parsed as Partial<ExternalBookLibraryRecord>).pages) : null,
      words: formatValue((parsed as Partial<ExternalBookLibraryRecord>).words),
      lexile: formatValue((parsed as Partial<ExternalBookLibraryRecord>).lexile),
      ar: formatValue((parsed as Partial<ExternalBookLibraryRecord>).ar),
      tags: formatValue((parsed as Partial<ExternalBookLibraryRecord>).tags),
      category: formatValue((parsed as Partial<ExternalBookLibraryRecord>).category),
      series: formatValue((parsed as Partial<ExternalBookLibraryRecord>).series),
      fiction: formatValue((parsed as Partial<ExternalBookLibraryRecord>).fiction),
      levelRange: formatValue((parsed as Partial<ExternalBookLibraryRecord>).levelRange),
      description: formatValue((parsed as Partial<ExternalBookLibraryRecord>).description)
    };
  } catch {
    return null;
  }
}

const ExternalBookLibraryDetailPage: React.FC = () => {
  const { externalId: routeId = "" } = useParams();
  const location = useLocation();
  const decodedRouteId = decodeURIComponent(routeId);
  const id = decodedRouteId || getExternalBookIdFromPath(location.pathname) || getExternalBookIdFromSearch(location.search);
  const [book, setBook] = useState<ExternalBookLibraryRecord | null>(() => externalBookFromMiniProgramPayload(location.search, id) || readExternalBookLibraryRecord(id));
  const [cachedBooks, setCachedBooks] = useState<ExternalBookLibraryRecord[]>(() => readExternalBookLibraryRecords());
  const [translatedIntro, setTranslatedIntro] = useState("");
  const [isIntroTranslated, setIsIntroTranslated] = useState(false);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [restoringBook, setRestoringBook] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [id]);

  useEffect(() => {
    const miniProgramPayloadBook = externalBookFromMiniProgramPayload(location.search, id);
    if (miniProgramPayloadBook) {
      rememberExternalBookLibraryRecord(miniProgramPayloadBook);
      setBook(miniProgramPayloadBook);
      setCachedBooks(readExternalBookLibraryRecords());
      setTranslatedIntro("");
      setIsIntroTranslated(false);
      setTranslationError("");
      setRestoreError("");
    } else {
      const cachedBook = readExternalBookLibraryRecord(id);
      setBook(cachedBook);
      setCachedBooks(readExternalBookLibraryRecords());
      setTranslatedIntro("");
      setIsIntroTranslated(false);
      setTranslationError("");
      setRestoreError("");
      if (cachedBook || !id) {
        setRestoringBook(false);
        return;
      }
    }

    let alive = true;
    const restoreId = id || miniProgramPayloadBook?.id || "";
    setRestoringBook(true);
    publicApi.getExternalBook(restoreId)
      .then((response) => {
        if (!alive) return;
        const nextBook = response.data;
        if (!nextBook?.id) {
          setRestoreError("图书详情加载失败");
          return;
        }
        rememberExternalBookLibraryRecord(nextBook);
        setBook(nextBook);
        setCachedBooks(readExternalBookLibraryRecords());
      })
      .catch((error: any) => {
        if (!alive) return;
        setRestoreError(error?.response?.data?.message || error?.message || "图书详情加载失败");
      })
      .finally(() => {
        if (!alive) return;
        setRestoringBook(false);
      });

    return () => {
      alive = false;
    };
  }, [id, location.search]);

  const displayedIntro = isIntroTranslated && translatedIntro ? translatedIntro : book?.description || "";
  const introParagraphs = useMemo(() => buildIntroParagraphs(displayedIntro), [displayedIntro]);
  const relatedBooks = useMemo(() => book ? buildRelatedBooks(book, cachedBooks) : [], [book, cachedBooks]);
  const translationButtonClassName = "group inline-flex h-[22px] w-[22px] appearance-none items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cfc2ef] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-45";
  const translationIconClassName = isIntroTranslated
    ? "inline-flex h-[20px] w-[20px] items-center justify-center rounded-full bg-transparent text-[#6c27d6] transition"
    : "inline-flex h-[20px] w-[20px] items-center justify-center rounded-full bg-transparent text-[#7f73a7] transition group-hover:text-[#6c27d6]";

  const handleTranslateIntro = async () => {
    if (!book?.description || translationLoading) return;
    if (isIntroTranslated) {
      setIsIntroTranslated(false);
      setTranslationError("");
      return;
    }
    if (translatedIntro) {
      setIsIntroTranslated(true);
      setTranslationError("");
      return;
    }
    setTranslationLoading(true);
    setTranslationError("");
    try {
      const response = await publicApi.translateExternalBookDescription(book.id, { title: book.title, description: book.description });
      const nextTranslatedIntro = response.data.translatedDescription || "";
      setTranslatedIntro(nextTranslatedIntro);
      setIsIntroTranslated(Boolean(nextTranslatedIntro));
    } catch (error: any) {
      setTranslationError(error?.response?.data?.message || error?.message || "翻译失败，请稍后重试");
    } finally {
      setTranslationLoading(false);
    }
  };
  const miniProgramWebView = isMiniProgramWebView();

  return (
    <div className="external-book-detail-page min-h-screen bg-[#f3f2f8] text-[#1f1736]">
      <style>{`
        html.xf-mp-webview .external-book-detail-main {
          padding-top: var(--xf-mp-nav-height, 88px) !important;
          padding-bottom: 0 !important;
        }

        @keyframes xf-translate-dot {
          0%, 100% {
            opacity: 0.38;
            transform: translateY(0) scale(0.72);
          }
          40% {
            opacity: 1;
            transform: translateY(-4px) scale(1.16);
          }
        }

        .external-book-translate-dot {
          animation: xf-translate-dot 0.74s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
        }
      `}</style>
      <GlobalPublicNav compactMobile showProgramEntry showExpertsEntry />
      <main className="external-book-detail-main mx-auto max-w-6xl px-4 pb-16 pt-[88px] sm:px-6 lg:px-8">
        {!miniProgramWebView ? (
          <div className="mb-5">
            <Link
              to="/library"
              className="xf-web-detail-back inline-flex items-center gap-1.5 p-0 text-sm font-semibold !text-[#7C3AED] visited:!text-[#7C3AED] hover:!text-[#6D28D9]"
            >
              ← 返回及阅
            </Link>
          </div>
        ) : null}

        {!book && restoringBook ? (
          <section className="rounded-[2rem] border border-[#ded7f3] bg-white px-6 py-12 text-center shadow-[0_18px_60px_rgba(80,62,125,0.08)]">
            <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
              及阅详情
            </div>
            <h1 className="mt-4 text-2xl font-black text-[#24163a]">正在加载及阅详情</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#7f73a7]">
              正在根据这本书的记录恢复详情页。
            </p>
          </section>
        ) : !book ? (
          <section className="rounded-[2rem] border border-[#ded7f3] bg-white px-6 py-12 text-center shadow-[0_18px_60px_rgba(80,62,125,0.08)]">
            <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
              及阅详情
            </div>
            <h1 className="mt-4 text-2xl font-black text-[#24163a]">需要从及阅列表进入</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#7f73a7]">
              {restoreError || "请回到及阅列表点击一本书，我们会把该条记录带入详情页展示。"}
            </p>
            <Link
              to="/library"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#7C3AED] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(124,58,237,0.22)]"
            >
              回到及阅
            </Link>
          </section>
        ) : (() => {
              const coverSrc = book.coverPic ? buildBookCoverImageSrc(book.coverPic) : "";
              const tags = splitValues(book.tags || book.category);
              const facts = buildDetailFacts(book);
              const shouldShowRelatedBooks = relatedBooks.length > 0 && (facts.length <= 6 || relatedBooks.length >= 3);

              return (
                <div className="space-y-8">
              <section className="overflow-hidden rounded-[2rem] border border-[#ded7f3] bg-white shadow-[0_18px_60px_rgba(80,62,125,0.08)]">
                <div className="grid gap-0 lg:grid-cols-[minmax(260px,0.42fr)_minmax(0,0.58fr)]">
                  <div className="flex items-center justify-center bg-[linear-gradient(135deg,#f5f1ff,#ffffff)] p-6 sm:p-8">
                    <div className="w-full max-w-[300px] overflow-hidden rounded-[1.75rem] border border-[#e5def6] bg-white p-2 shadow-[0_18px_40px_rgba(80,62,125,0.08)] sm:max-w-[360px]">
                      {coverSrc ? (
                        <div className="overflow-hidden rounded-[1.15rem] bg-white">
                          <img
                            src={coverSrc}
                            alt={book.title || "书籍封面"}
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
                    <div className="inline-flex w-fit self-start rounded-full bg-[#f1eaff] px-3 py-1 text-xs font-black text-[#6d28d9]">及阅详情</div>
                    <h1 className="mt-4 text-3xl font-black leading-tight text-[#24163a] sm:text-5xl">{book.title || "未命名书籍"}</h1>
                    <div className="mt-4 space-y-2 text-sm font-semibold text-[#6b5f95]">
                      {hasDisplayValue(book.author) ? (
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-[#7C3AED]">作者</span>
                          <span>{book.author}</span>
                        </div>
                      ) : null}
                      {hasDisplayValue(book.publisher) ? (
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-[#7C3AED]">出版社</span>
                          <span>{book.publisher}</span>
                        </div>
                      ) : null}
                      {hasDisplayValue(book.pubDate) ? (
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-[#7C3AED]">出版时间</span>
                          <span>{book.pubDate}</span>
                        </div>
                      ) : null}
                      {hasDisplayValue(book.isbn) ? (
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-[#7C3AED]">ISBN</span>
                          <span>{book.isbn}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {hasDisplayValue(book.words) ? <span className="rounded-full border border-[#d5c8ff] bg-[#f6f0ff] px-3 py-1 text-xs font-bold text-[#5e17eb]">词汇量：{book.words}</span> : null}
                      {hasDisplayValue(book.lexile) ? <span className="rounded-full border border-[#cde6ea] bg-[#f2fbfe] px-3 py-1 text-xs font-bold text-[#25678a]">Lexile：{book.lexile}</span> : null}
                      {hasDisplayValue(book.ar) ? <span className="rounded-full border border-[#cde6ea] bg-[#f2fbfe] px-3 py-1 text-xs font-bold text-[#25678a]">AR：{book.ar}</span> : null}
                      {hasDisplayValue(formatLevelLabel(book.levelRange)) ? <span className="rounded-full border border-[#f1d9ee] bg-[#fff5ff] px-3 py-1 text-xs font-bold text-[#8a3daa]">难度：{formatLevelLabel(book.levelRange)}</span> : null}
                      {hasDisplayValue(formatFictionLabel(book.fiction)) ? <span className="rounded-full border border-[#e5dfc9] bg-[#fffaf0] px-3 py-1 text-xs font-bold text-[#82612b]">是否虚构：{formatFictionLabel(book.fiction)}</span> : null}
                    </div>

                    {tags.length > 0 ? (
                      <div className="mt-5">
                            <div className="text-xs font-black text-[#8d84b6]">标签</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {tags.map((tag) => (
                                <Link
                                  key={tag}
                                  to={`/library?tag=${encodeURIComponent(tag)}`}
                                  className="rounded-full border border-[#ece5fb] bg-[#fcfbff] px-3 py-1 text-xs font-bold !text-[#6b5f95] no-underline transition hover:border-[#c8b8f6] hover:bg-[#f8f5ff] hover:!text-[#5e17eb]"
                                >
                                  {tag}
                                </Link>
                              ))}
                            </div>
                          </div>
                        ) : null}
                  </div>
                </div>
              </section>

              <section>
                <article className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
                  <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                    BOOK INFO
                  </div>
                  <h2 className="mt-2 text-2xl font-black text-[#24163a]">完整简介</h2>
                  {translationError ? (
                    <p className="mt-2 text-sm font-semibold text-red-500">{translationError}</p>
                  ) : null}
                  <div className="mt-5 w-full max-w-none space-y-4">
                    {introParagraphs.length > 0 ? (
                      introParagraphs.map((paragraph, index) => (
                        <p key={`${index}-${paragraph.slice(0, 12)}`} className="whitespace-pre-wrap text-[17px] leading-[2.05] tracking-[0.01em] text-[#4f456f]">
                          {paragraph}
                        </p>
                      ))
                    ) : (
                      <p className="text-[17px] leading-[2.05] text-[#4f456f]">暂无简介。</p>
                    )}
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      aria-label="翻译简介"
                      aria-pressed={isIntroTranslated}
                      onClick={handleTranslateIntro}
                      disabled={translationLoading || !book?.description}
                      className={translationButtonClassName}
                    >
                      {translationLoading ? (
                        <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
                          <span className="external-book-translate-dot h-[4px] w-[4px] rounded-full bg-current" style={{ animationDelay: "-0.24s" }} />
                          <span className="external-book-translate-dot h-[4px] w-[4px] rounded-full bg-current" style={{ animationDelay: "-0.12s" }} />
                          <span className="external-book-translate-dot h-[4px] w-[4px] rounded-full bg-current" />
                        </span>
                      ) : (
                        <span className={translationIconClassName} aria-hidden="true">
                          <span
                            className="h-[18px] w-[18px] bg-current"
                            style={{
                              WebkitMaskImage: `url(${TRANSLATE_SYMBOL_MASK_URL})`,
                              maskImage: `url(${TRANSLATE_SYMBOL_MASK_URL})`,
                              WebkitMaskPosition: "center",
                              maskPosition: "center",
                              WebkitMaskRepeat: "no-repeat",
                              maskRepeat: "no-repeat",
                              WebkitMaskSize: "contain",
                              maskSize: "contain",
                            }}
                          />
                        </span>
                      )}
                    </button>
                  </div>
                </article>
              </section>

                  <section className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
                    <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                      METADATA
                </div>
                <h2 className="mt-2 text-2xl font-black text-[#24163a]">图书资料</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {facts.map((fact) => (
                    <div key={fact.label} className="rounded-[1.25rem] border border-[#ece5fb] bg-[#fcfbff] p-4">
                      <div className="text-[11px] font-black text-[#8d84b6]">{fact.label}</div>
                      {fact.searchQuery ? (
                        <Link
                          to={`/library?q=${encodeURIComponent(fact.searchQuery)}`}
                          className="mt-1 inline-flex break-words text-sm font-bold leading-6 !text-[#35264f] no-underline transition hover:!text-[#5e17eb]"
                        >
                          {fact.value}
                        </Link>
                      ) : (
                        <div className="mt-1 break-words text-sm font-bold leading-6 text-[#35264f]">{fact.value}</div>
                      )}
                    </div>
                      ))}
                    </div>
                  </section>

                  {shouldShowRelatedBooks ? (
                    <section className="rounded-[2rem] border border-[#ded7f3] bg-white p-6 shadow-[0_18px_60px_rgba(80,62,125,0.08)] sm:p-8">
                      <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-[#5b3fa1]">
                        RELATED BOOKS
                      </div>
                      <h2 className="mt-2 text-2xl font-black text-[#24163a]">相关图书</h2>
                      <p className="mt-2 text-sm font-semibold text-[#7f73a7]">同标签或同分类下的其他图书。</p>
                      <div className="-mx-2 mt-5 overflow-x-auto px-2 pb-2">
                        <div className="flex min-w-max gap-3">
                          {relatedBooks.map((item) => {
                            const relatedCoverSrc = item.coverPic ? buildBookCoverImageSrc(item.coverPic) : "";
                            const relatedMeta = [item.author, item.publisher].filter(hasDisplayValue).join(" · ");

                            return (
                              <Link
                                key={item.id}
                                to={`/library/${encodeURIComponent(item.id)}`}
                                onClick={() => rememberExternalBookLibraryRecord(item)}
                                className="block w-[142px] shrink-0 rounded-[1.25rem] border border-[#ece5fb] bg-[#fcfbff] p-3 !text-inherit no-underline transition hover:-translate-y-0.5 hover:border-[#c8b8f6] hover:shadow-[0_14px_28px_rgba(60,40,80,0.1)] sm:w-[158px]"
                              >
                                <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[0.9rem] bg-[#f8f5ff]">
                                  {relatedCoverSrc ? (
                                    <img src={relatedCoverSrc} alt={item.title || "书籍封面"} className="h-full w-full object-contain" loading="lazy" />
                                  ) : (
                                    <span className="text-4xl font-black text-[#cfc4f0]">书</span>
                                  )}
                                </div>
                                <div className="mt-3 line-clamp-2 text-sm font-black leading-snug text-[#2b1a3a]">{item.title || "未命名书籍"}</div>
                                {relatedMeta ? <div className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#7f73a7]">{relatedMeta}</div> : null}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  ) : null}
                </div>
              );
            })()}
      </main>
    </div>
  );
};

export default ExternalBookLibraryDetailPage;
