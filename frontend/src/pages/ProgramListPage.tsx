import React, { useEffect, useState } from "react";
import GlobalPublicNav from "../components/GlobalPublicNav";

const FALLBACK_COVER = "/assets/podcast-cover-1.svg";

interface Program {
  _id: string;
  programCode?: string;
  title?: string;
  description?: string;
  coverImage?: string;
  summary?: {
    tags?: string[];
  };
  transcript?: Array<{ text?: string }>;
  termGlossary?: Array<{ term?: string }>;
  dictionaryEntries?: Array<{ term?: string }>;
  deepDive?: {
    curatedReading?: Array<{ title?: string }>;
  };
  contentPack?: {
    quickView?: Array<{ summary?: string }>;
    minutes?: { text?: string };
    showNotes?: { renderedText?: string };
  };
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

function fmtDate(value?: string) {
  if (!value) return "未发布";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "未发布";
  return d.toLocaleDateString("zh-CN");
}

function safeText(value?: string) {
  return String(value || "")
    .replace(/[&<>"']/g, (char) => {
      const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[char];
    });
}

function getProgramTimestamp(program: Program) {
  const value = program.publishedAt || program.createdAt;
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNonEmptyText(value?: string) {
  return String(value || "").trim().length > 0;
}

const ProgramListPage: React.FC = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 7;
  const keyword = (() => {
    try {
      return String(new URLSearchParams(window.location.search).get("q") || "").trim().toLowerCase();
    } catch (_e) {
      return "";
    }
  })();

  useEffect(() => {
    fetch("/api/programs")
      .then((res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then((data: Program[]) => {
        const sorted = [...(Array.isArray(data) ? data : [])].sort(
          (a, b) => getProgramTimestamp(b) - getProgramTimestamp(a),
        );
        setPrograms(sorted);
        setCurrentPage(1);
      })
      .catch(() => {
        setPrograms([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const visiblePrograms = keyword
    ? programs.filter((item) => {
        const haystack = [
          item.title || "",
          item.description || "",
          item.programCode || "",
          item._id || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      })
    : programs;

  const totalPages = Math.max(1, Math.ceil(visiblePrograms.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pagedPrograms = visiblePrograms.slice(start, start + PAGE_SIZE);

  const highlightText = (text?: string) => {
    const raw = String(text || "");
    if (!keyword) return safeText(raw);
    const regex = new RegExp(`(${escapeRegExp(keyword)})`, "ig");
    const parts = raw.split(regex);
    return parts.map((part, idx) =>
      part.toLowerCase() === keyword.toLowerCase() ? (
        <mark key={idx} className="rounded bg-[#ede9fe] px-0.5 text-[#5e17eb]">
          {safeText(part)}
        </mark>
      ) : (
        <React.Fragment key={idx}>{safeText(part)}</React.Fragment>
      ),
    );
  };

  const renderUnifiedCard = (program: Program, index: number) => {
    const routeId = safeText(program.programCode || program._id);
    const badge = safeText((program.programCode || "ep" + String(index + 1)).toUpperCase());
    const detailHref = `/programs/${routeId}`;
    const hasTranscript = Array.isArray(program.transcript) && program.transcript.length > 0;
    const hasDictionary = (Array.isArray(program.dictionaryEntries) ? program.dictionaryEntries : []).some((entry) =>
      hasNonEmptyText(entry?.term),
    );
    const hasReading = (Array.isArray(program.deepDive?.curatedReading) ? program.deepDive?.curatedReading : []).some((item) =>
      hasNonEmptyText(item?.title),
    );
    const programTags = Array.isArray(program.summary?.tags)
      ? program.summary!.tags!.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 4)
      : [];
    const contentPills = [
      hasTranscript ? { icon: "description", label: "逐字稿" } : null,
      hasDictionary ? { icon: "book_2", label: "教育词典" } : null,
      hasReading ? { icon: "menu_book", label: "书单" } : null,
    ].filter(Boolean) as Array<{ icon: string; label: string }>;
    return (
      <a
        key={program._id}
        href={detailHref}
        className="block"
        onClick={(e) => {
          const topWindow = window.top;
          if (topWindow && window.self !== topWindow) {
            e.preventDefault();
            topWindow.location.href = detailHref;
          }
        }}
      >
        <article className="magazine-card group w-full cursor-pointer rounded-[1.35rem] p-4 sm:p-7">
          <div className="flex flex-col gap-4 sm:gap-7 xl:flex-row">
            <div className="w-full flex-shrink-0 xl:w-[294px]">
              <div className="relative w-full overflow-hidden rounded-xl shadow-md">
                <img
                  alt="Podcast Cover"
                  className="h-auto w-full object-contain transition-transform duration-700 group-hover:scale-105"
                  src={safeText(program.coverImage || FALLBACK_COVER)}
                />
              </div>
            </div>
            <div className="flex flex-col justify-center xl:w-[574px]">
              <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-[#5e17eb]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-[#5e17eb]">
                  EPISODE {highlightText(badge)}
                </span>
                <span className="text-[11px] font-medium text-[#64748b]">
                  {fmtDate(program.publishedAt || program.createdAt)}
                </span>
              </div>
              <h2 className="mb-3 text-[1.12rem] font-extrabold leading-tight transition-colors group-hover:text-[#5e17eb] sm:text-[1.3rem]">
                {highlightText(program.title)}
              </h2>
              <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-[#64748b] sm:mb-6 sm:text-sm">
                {highlightText(program.description || "")}
              </p>
              {programTags.length > 0 ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {programTags.map((tag, tagIndex) => (
                    <span
                      key={`${program._id}-tag-${tagIndex}`}
                      className="inline-flex items-center rounded-full border border-[#5e17eb]/20 bg-[#5e17eb]/5 px-2.5 py-1 text-[10px] font-bold text-[#5e17eb]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {contentPills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {contentPills.map((pill) => (
                    <span
                      key={`${program._id}-${pill.label}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-bold text-[#1a1a1b] sm:px-3.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">{pill.icon}</span>
                      {pill.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </article>
      </a>
    );
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-['Plus_Jakarta_Sans','PingFang_SC','Microsoft_YaHei',sans-serif] text-[#1a1a1b]">
      <GlobalPublicNav
        showSearch
        showAiOnline
        showLogout
        showProgramList
        showExpertsEntry
        searchPlaceholder="搜索节目标题/简介"
      />
      <style>{`
        .magazine-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
        }
        .magazine-card:hover {
          border-color: #5e17eb;
          transform: translateY(-4px);
          box-shadow: 0 20px 40px -15px rgba(94, 23, 235, 0.1);
        }
      `}</style>

      <main className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pt-22 lg:px-8 lg:pt-24">
        <section>

          <div className="space-y-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <div className="relative h-8 w-8">
                  <div className="absolute inset-0 rounded-full border-4 border-[#5e17eb]/10"></div>
                  <div className="animate-spin absolute inset-0 rounded-full border-4 border-t-[#5e17eb]"></div>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748b]">正在加载更多精彩...</p>
              </div>
            ) : visiblePrograms.length === 0 ? (
              <div className="magazine-card rounded-2xl p-8 text-sm text-[#64748b]">暂无已发布节目</div>
            ) : (
              <>
                {pagedPrograms.map((program, idx) => renderUnifiedCard(program, start + idx))}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                      const active = p === safePage;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          style={{ fontSize: "9.1px", lineHeight: 1 }}
                          className={`h-7 w-7 rounded-full text-[7px] font-bold transition ${
                            active
                              ? "bg-[#5e17eb] text-white shadow-lg shadow-[#5e17eb]/25"
                              : "border border-[#5e17eb]/25 bg-white text-[#5e17eb] hover:bg-[#5e17eb]/5"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProgramListPage;
