import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import Pagination from "../components/Pagination";
import { ExternalBookLibraryRecord, publicApi } from "../services/api";
import { buildBookCoverImageSrc } from "../utils/bookCover";
import { rememberExternalBookLibraryRecord, rememberExternalBookLibraryRecords } from "../utils/externalBookLibraryStorage";

const PAGE_SIZE = 24;

type ExternalBookCardProps = {
  item: ExternalBookLibraryRecord;
  imageIndex: number;
};

function splitValues(value: string): string[] {
  return String(value || "")
    .split(/[;；,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
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

const ExternalBookCard: React.FC<ExternalBookCardProps> = ({ item, imageIndex }) => {
  const categories = splitValues(item.category || item.tags).slice(0, 3);
  const coverSrc = item.coverPic ? buildBookCoverImageSrc(item.coverPic) : "";
  const loading = imageIndex < 8 ? "eager" : "lazy";

  return (
    <Link to={`/library/${encodeURIComponent(item.id)}`} onClick={() => rememberExternalBookLibraryRecord(item)} className="block !text-inherit no-underline">
      <article className="book-card-article group overflow-hidden rounded-[1rem] border border-[#e2dcf0] bg-white shadow-[0_8px_18px_rgba(60,40,80,0.06)] transition hover:-translate-y-0.5 hover:border-[#c8b8f6] hover:shadow-[0_14px_28px_rgba(60,40,80,0.1)]">
        {item.coverPic ? (
          <div className="book-card-cover-frame relative w-full p-2">
            <div className="book-card-cover-shell flex min-h-[180px] items-center justify-center overflow-hidden rounded-lg bg-[#f8f5ff] sm:min-h-[220px]">
              <img
                src={coverSrc}
                alt={item.title || "书籍封面"}
                className="book-card-cover-image w-full object-contain"
                loading={loading}
                decoding={imageIndex < 8 ? "sync" : "async"}
              />
            </div>
          </div>
        ) : null}
        <div className={`book-card-body px-3 pb-3 ${item.coverPic ? "pt-1" : "pt-3"}`}>
          <h3 className="book-card-title line-clamp-2 text-[22px] font-black leading-tight text-[#2b1a3a]">{item.title || "未命名书籍"}</h3>
          {item.author ? <p className="book-card-meta mt-2 text-sm text-[#6f62a4]">作者: {item.author}</p> : null}
          {item.publisher ? <p className="book-card-publisher mt-1 text-xs text-[#8b7dbc]">出版社: {item.publisher}</p> : null}
          <div className="book-card-tags mt-2.5 flex flex-wrap gap-1.5">
            {hasDisplayValue(item.pubDate) ? (
              <span className="book-card-tag book-card-tag-grade rounded-full border border-[#d9d8ee] bg-[#f7f7ff] px-2.5 py-1 text-[11px] font-bold text-[#4e4c87]">
                出版: {item.pubDate}
              </span>
            ) : null}
            {hasDisplayValue(item.isbn) ? (
              <span className="book-card-tag rounded-full border border-[#d5c8ff] bg-[#f6f0ff] px-2.5 py-1 text-[11px] font-bold text-[#5e17eb]">
                ISBN: {item.isbn}
              </span>
            ) : null}
            {item.pages ? (
              <span className="book-card-tag book-card-tag-topic rounded-full border border-[#cde6ea] bg-[#f2fbfe] px-2.5 py-1 text-[11px] font-bold text-[#25678a]">
                {item.pages} 页
              </span>
            ) : null}
            {hasDisplayValue(item.words) ? (
              <span className="book-card-tag rounded-full border border-[#d5c8ff] bg-[#f6f0ff] px-2.5 py-1 text-[11px] font-bold text-[#5e17eb]">
                词汇量: {item.words}
              </span>
            ) : null}
            {hasDisplayValue(item.lexile) ? (
              <span className="book-card-tag rounded-full border border-[#cde6ea] bg-[#f2fbfe] px-2.5 py-1 text-[11px] font-bold text-[#25678a]">
                Lexile: {item.lexile}
              </span>
            ) : null}
            {hasDisplayValue(item.ar) ? (
              <span className="book-card-tag rounded-full border border-[#cde6ea] bg-[#f2fbfe] px-2.5 py-1 text-[11px] font-bold text-[#25678a]">
                AR: {item.ar}
              </span>
            ) : null}
            {hasDisplayValue(formatLevelLabel(item.levelRange)) ? (
              <span className="book-card-tag rounded-full border border-[#f1d9ee] bg-[#fff5ff] px-2.5 py-1 text-[11px] font-bold text-[#8a3daa]">
                难度: {formatLevelLabel(item.levelRange)}
              </span>
            ) : null}
            {hasDisplayValue(formatFictionLabel(item.fiction)) ? (
              <span className="book-card-tag rounded-full border border-[#e5dfc9] bg-[#fffaf0] px-2.5 py-1 text-[11px] font-bold text-[#82612b]">
                虚构: {formatFictionLabel(item.fiction)}
              </span>
            ) : null}
            {categories.map((category) => (
              <span key={category} className="book-card-tag book-card-tag-category rounded-full border border-[#f1d9ee] bg-[#fff5ff] px-2.5 py-1 text-[11px] font-bold text-[#8a3daa]">
                {category}
              </span>
            ))}
          </div>
          {item.description ? (
            <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#6f62a4]">{item.description}</p>
          ) : null}
          <div className="book-card-source-row mt-2 flex items-center justify-between gap-3 border-t border-[#f0ebff] pt-2 text-xs">
            <span className="book-card-source min-w-0 truncate text-[#a9a2d4]">及阅</span>
            <span className="book-card-detail-link shrink-0 font-bold text-[#7C3AED]">查看详情</span>
          </div>
        </div>
      </article>
    </Link>
  );
};

const ExternalBookLibraryPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const queryKeyword = String(searchParams.get("q") || "").trim();
  const queryTag = String(searchParams.get("tag") || "").trim();
  const [books, setBooks] = useState<ExternalBookLibraryRecord[]>([]);
  const [keyword, setKeyword] = useState(() => queryKeyword);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => queryTag ? [queryTag] : []);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedFictions, setSelectedFictions] = useState<string[]>([]);

  function clearFilters() {
    setKeyword("");
    setSelectedCategories([]);
    setSelectedLevels([]);
    setSelectedFictions([]);
    setPage(1);
  }

  function toggleFilter(value: string, selected: string[], setSelected: React.Dispatch<React.SetStateAction<string[]>>) {
    setSelected(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
    setPage(1);
  }

  useEffect(() => {
    setKeyword(queryKeyword);
    setPage(1);
  }, [queryKeyword]);

  useEffect(() => {
    setSelectedCategories(queryTag ? [queryTag] : []);
    setPage(1);
  }, [queryTag]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    publicApi.getExternalBooks({ current: page, size: PAGE_SIZE })
      .then((response) => {
        if (!alive) return;
        const data = response.data;
        const nextRecords = Array.isArray(data.records) ? data.records : [];
        setBooks(nextRecords);
        rememberExternalBookLibraryRecords(nextRecords);
        setPages(Math.max(1, Number(data.pages || 1)));
      })
      .catch((err: any) => {
        if (!alive) return;
        setError(err?.response?.data?.message || err?.message || "书单加载失败");
        setBooks([]);
        setPages(1);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [page]);

  const categoryOptions = useMemo(() => {
    return uniqueValues(books.flatMap((item) => splitValues(item.tags || item.category))).slice(0, 24);
  }, [books]);

  const displayCategoryOptions = useMemo(() => uniqueValues([...selectedCategories, ...categoryOptions]), [categoryOptions, selectedCategories]);

  const levelOptions = useMemo(() => {
    return uniqueValues(books.map((item) => formatLevelLabel(item.levelRange)).filter(hasDisplayValue)).slice(0, 16);
  }, [books]);

  const fictionOptions = useMemo(() => {
    return uniqueValues(books.map((item) => formatFictionLabel(item.fiction)).filter(hasDisplayValue));
  }, [books]);

  const visibleBooks = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return books.filter((item) => {
      const itemCategories = splitValues(item.tags || item.category);
      const itemLevel = formatLevelLabel(item.levelRange);
      const itemFiction = formatFictionLabel(item.fiction);
      const matchesKeyword = !normalized || [item.title, item.author, item.publisher, item.isbn, item.category, item.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.some((category) => itemCategories.includes(category));
      const matchesLevel = selectedLevels.length === 0 || selectedLevels.includes(itemLevel);
      const matchesFiction = selectedFictions.length === 0 || selectedFictions.includes(itemFiction);
      return matchesKeyword && matchesCategory && matchesLevel && matchesFiction;
    });
  }, [books, keyword, selectedCategories, selectedLevels, selectedFictions]);
  const normalizedKeyword = keyword.trim();
  const hasActiveFilters = normalizedKeyword.length > 0 || selectedCategories.length > 0 || selectedLevels.length > 0 || selectedFictions.length > 0;

  return (
    <div className="xf-books-page relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#1f1d1a]">
      <style>{`
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
        .xf-books-page .books-mobile-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid #d8d0ef;
          border-radius: 32px;
          background: radial-gradient(circle at 10% 0%, rgba(143,100,255,.1), transparent 40%), linear-gradient(135deg, #f4f1fd 0%, #faf8ff 48%, #f0ebff 100%);
          padding: 28px;
          box-shadow: 0 24px 80px rgba(80,62,125,.1);
        }
        .xf-books-page .books-mobile-filter {
          margin-top: 24px;
          border: 1px solid #e0d9f2;
          border-radius: 28px;
          background: #fff;
          padding: 20px;
          box-shadow: 0 16px 50px rgba(80,62,125,.06);
        }
        .xf-books-page .books-hero-search {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 56px;
          border: 1px solid rgba(124, 77, 255, 0.22);
          border-radius: 16px;
          background: rgba(255,255,255,.94);
          padding: 0 16px;
          box-shadow: 0 4px 14px rgba(124,77,255,.09);
        }
        .xf-books-page .books-hero-search:focus-within {
          border-color: rgba(124,77,255,.46);
          box-shadow: 0 8px 20px rgba(124,77,255,.16);
        }
        .xf-books-page .materials-search-input {
          font-size: 16px;
          line-height: 1.2;
          color: #43336f;
        }
        .xf-books-page .book-card-article {
          overflow: hidden;
          border: 1px solid #e2dcf0;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 18px rgba(60,40,80,.06);
        }
        .xf-books-page .book-card-cover-frame { box-sizing: border-box; width: 100%; padding: 8px; }
        .xf-books-page .book-card-cover-shell {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 180px;
          overflow: hidden;
          border-radius: 12px;
          background: #f8f5ff;
        }
        .xf-books-page .book-card-cover-image {
          display: block;
          width: 100%;
          max-width: 100%;
          max-height: 360px;
          height: auto;
          object-fit: contain;
        }
        .xf-books-page .book-card-title {
          margin: 0;
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
        .xf-books-page .book-card-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
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
        .xf-books-page .book-card-detail-link { flex-shrink: 0; color: #7C3AED; font-weight: 800; }
        @media (max-width: 768px) {
          .xf-books-page .books-mobile-main { padding-top: 70px !important; padding-bottom: calc(120px + env(safe-area-inset-bottom)) !important; }
          .xf-books-page .books-mobile-hero { padding: 16px !important; border-radius: 20px !important; }
          .xf-books-page .book-card-title { font-size: 18px !important; }
          .xf-books-page .book-card-cover-shell { min-height: 148px; }
          .xf-books-page .book-card-cover-image { max-height: 280px; }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(118,83,205,0.09)_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>
      <GlobalPublicNav compactMobile showExpertsEntry showProgramEntry showSearch searchPlaceholder="搜索书名、作者、出版社、推荐人" searchValue={keyword} onSearchChange={setKeyword} />
      <main className="books-mobile-main mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8">
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
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#6f62a3] sm:text-base">
              基于节目实践沉淀的书籍清单。可先按推荐人聚合浏览，再结合年级和关键词快速筛选。
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label className="books-hero-search inline-flex flex-1 items-center gap-2 border border-[#d8d0ef] bg-white px-4 shadow-sm">
              <span className="material-symbols-outlined text-[#8f7bd6]">search</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索书名、作者、出版社、推荐人"
                className="materials-search-input w-full border-0 bg-transparent text-sm outline-none ring-0 focus:outline-none focus:ring-0"
              />
            </label>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-14 items-center justify-center rounded-2xl border border-[#cfc2ee] bg-white px-5 text-sm font-bold text-[#654f88] transition hover:border-[#5e17eb] hover:text-[#5e17eb]"
            >
              清空筛选
            </button>
          </div>
        </section>

        <section className="books-mobile-filter mt-6 rounded-[1.8rem] border border-[#e0d9f2] bg-white p-5 shadow-[0_16px_50px_rgba(80,62,125,0.06)] sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start mb-4">
            <div className="books-mobile-label w-[72px] pt-1 text-sm font-black tracking-[0.1em] text-[#6b5fa0]">标签</div>
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                {displayCategoryOptions.map((category) => {
                  const active = selectedCategories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleFilter(category, selectedCategories, setSelectedCategories)}
                      className={`books-filter-chip rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-[#5e17eb] bg-[#5e17eb] text-white"
                          : "border-[#d8c8ef] bg-white text-[#6b5fa0] hover:border-[#5e17eb] hover:bg-[#faf8ff]"
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
                {displayCategoryOptions.length === 0 ? <span className="text-sm text-[#8b7db6]">暂无可筛选标签</span> : null}
              </div>
            </div>
          </div>

          {levelOptions.length > 0 ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-start mb-4">
            <div className="books-mobile-label w-[72px] pt-1 text-sm font-black tracking-[0.1em] text-[#6b5fa0]">难度</div>
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                {levelOptions.map((level) => {
                  const active = selectedLevels.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleFilter(level, selectedLevels, setSelectedLevels)}
                      className={`books-filter-chip rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-[#5e17eb] bg-[#5e17eb] text-white"
                          : "border-[#d8c8ef] bg-white text-[#6b5fa0] hover:border-[#5e17eb] hover:bg-[#faf8ff]"
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          ) : null}

          {fictionOptions.length > 0 ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-start">
            <div className="books-mobile-label w-[72px] pt-1 text-sm font-black tracking-[0.1em] text-[#6b5fa0]">类型</div>
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                {fictionOptions.map((fiction) => {
                  const active = selectedFictions.includes(fiction);
                  return (
                    <button
                      key={fiction}
                      type="button"
                      onClick={() => toggleFilter(fiction, selectedFictions, setSelectedFictions)}
                      className={`books-filter-chip rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-[#5e17eb] bg-[#5e17eb] text-white"
                          : "border-[#d8c8ef] bg-white text-[#6b5fa0] hover:border-[#5e17eb] hover:bg-[#faf8ff]"
                      }`}
                    >
                      {fiction}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          ) : null}
        </section>

        <section className="mt-6">
          {loading ? (
            <div className="rounded-[1.5rem] border border-[#e2dcf0] bg-white p-10 text-center text-sm font-bold text-[#7b6bb8]">正在加载及阅...</div>
          ) : error ? (
            <div className="rounded-[1.5rem] border border-[#ffd4d4] bg-white p-10 text-center text-sm font-bold text-[#b42318]">{error}</div>
          ) : visibleBooks.length === 0 ? (
            <div className="rounded-[1.5rem] border border-[#e2dcf0] bg-white p-10 text-center text-sm font-bold text-[#7b6bb8]">当前页没有匹配的图书。</div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleBooks.map((item, index) => (
                <ExternalBookCard key={item.id || `${item.title}-${index}`} item={item} imageIndex={index} />
              ))}
            </div>
          )}
        </section>

        {!hasActiveFilters && pages > 1 ? (
        <div className="mt-8">
          <Pagination currentPage={page} totalPages={pages} onPageChange={setPage} />
        </div>
        ) : null}
      </main>
    </div>
  );
};

export default ExternalBookLibraryPage;
