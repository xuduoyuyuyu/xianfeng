import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import GlobalPublicNav from "../components/GlobalPublicNav";
import Pagination from "../components/Pagination";

const FALLBACK_COVER = "https://xianfeng.xinzhi.info/uploads/images/1778322922471-0tkcrxd2.png";

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
  dictionaryEntries?: Array<{ term?: string }>;
  deepDive?: {
    curatedReading?: Array<{ title?: string }>;
  };
  publishedAt?: string;
  createdAt?: string;
  status?: "draft" | "published" | "group-only";
}

function fmtDate(value?: string) {
  if (!value) return "未发布";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "未发布";
  return d.toLocaleDateString("zh-CN");
}

const PROGRAM_LIST_HERO_DISMISSED_KEY = "program_list_hero_dismissed_v1";

const ProgramListPage: React.FC = () => {
  const { user: currentUser, token } = useSelector((state: RootState) => state.user);
  const isLoggedIn = !!currentUser && !!token;
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [showHero, setShowHero] = useState(false);
  const pageSize = 20;

  const keyword = useMemo(() => {
    try {
      return String(new URLSearchParams(window.location.search).get("q") || "").trim().toLowerCase();
    } catch (_e) {
      return "";
    }
  }, []);

  useEffect(() => {
    try {
      setShowHero(window.localStorage.getItem(PROGRAM_LIST_HERO_DISMISSED_KEY) !== "1");
    } catch (_err) {
      setShowHero(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/programs?page=${currentPage}&pageSize=${pageSize}`)
      .then((res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then((raw: any) => {
        if (!alive) return;
        const data: Program[] = Array.isArray(raw?.programs) ? raw.programs : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setPrograms(data);
        setTotalPages(raw?.totalPages || 1);
        setTotal(raw?.total || data.length);
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch((err: any) => {
        if (!alive) return;
        setPrograms([]);
        setError(err?.message || "加载节目列表失败");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [currentPage]);

  const visiblePrograms = useMemo(() => {
    if (!keyword) return programs;
    return programs.filter((item) => {
      const haystack = [item.title || "", item.description || "", item.programCode || "", item._id || ""].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [keyword, programs]);

  const dismissHero = () => {
    setShowHero(false);
    try {
      window.localStorage.setItem(PROGRAM_LIST_HERO_DISMISSED_KEY, "1");
    } catch (_err) {}
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#1f1d1a]">
      {/* ProgramList: diagonal grid lines + pulsing orbs */}
      <style>{`
        @keyframes progOrb1 {
          0%,100% { transform: translate3d(0,0,0) scale(1); opacity: .65; }
          40% { transform: translate3d(2%,-3%,0) scale(1.15); opacity: .9; }
          70% { transform: translate3d(-1.5%,2%,0) scale(.92); opacity: .7; }
        }
        @keyframes progOrb2 {
          0%,100% { transform: translate3d(0,0,0) scale(.9); opacity: .5; }
          50% { transform: translate3d(-3%,2%,0) scale(1.2); opacity: .85; }
        }
        @keyframes progOrb3 {
          0%,100% { transform: translate3d(0,0,0) scale(1.1); opacity: .55; }
          30% { transform: translate3d(1.8%,-2%,0) scale(.85); opacity: .75; }
          75% { transform: translate3d(-2.2%,1.5%,0) scale(1.25); opacity: .9; }
        }
      `}</style>

      {/* Background: diagonal grid */}
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, rgba(118,83,205,0.06) 0px, rgba(118,83,205,0.06) 1px, transparent 1px, transparent 18px), repeating-linear-gradient(-45deg, rgba(118,83,205,0.04) 0px, rgba(118,83,205,0.04) 1px, transparent 1px, transparent 32px)`,
          }}
        />
      </div>

      {/* Animated orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-24 -left-20 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(129,75,255,0.18),transparent_62%)]"
          style={{ animation: "progOrb1 13s ease-in-out infinite" }}
        />
        <div
          className="absolute top-[40%] -right-28 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(153,102,255,0.13),transparent_60%)]"
          style={{ animation: "progOrb2 17s ease-in-out infinite" }}
        />
        <div
          className="absolute -bottom-20 left-[30%] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(109,52,226,0.11),transparent_58%)]"
          style={{ animation: "progOrb3 15s ease-in-out infinite 2s" }}
        />
      </div>

      <GlobalPublicNav
        compactMobile
        showSearch
        showAiOnline
        showLogout
        showProgramList
        showExpertsEntry
        searchPlaceholder="搜索节目标题/简介"
      />

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-[76px] sm:px-6 lg:px-8">
        {showHero ? (
          <section className="group relative overflow-hidden rounded-[2rem] border border-[#d8d0ef] bg-[radial-gradient(circle_at_18%_0%,_rgba(143,100,255,0.14),_transparent_36%),radial-gradient(circle_at_76%_22%,_rgba(124,58,237,0.08),_transparent_32%),linear-gradient(135deg,_#f4f1fd_0%,_#f9f7ff_45%,_#f0ebff_100%)] p-8 shadow-[0_24px_80px_rgba(80,62,125,0.12)] sm:p-10">
            <button
              type="button"
              onClick={dismissHero}
              aria-label="关闭引导卡片"
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#cfc2ee] bg-white/75 text-[#6d57a3] opacity-0 transition hover:bg-white hover:text-[#4e36a0] group-hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 max-sm:opacity-100"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#5b3fa1]">
                Programs
              </div>
              <h1 className="mt-5 text-4xl font-black leading-[1.14] tracking-tight text-[#24180a] sm:text-5xl">
                从完整节目索引中，快速定位你此刻最需要的内容
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6f665d] sm:text-base">
                这里汇总已发布节目，按时间倒序呈现。你可以直接搜索标题与简介，并通过标签和内容类型快速判断每一期是否值得立即深听。
              </p>
            </div>
          </section>
        ) : null}

        {error ? <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-500">{error}</div> : null}

        <section className={`${showHero ? "mt-8" : "mt-2"} space-y-5`}>
          {loading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="animate-pulse rounded-[1.7rem] border border-[#e2dcf0] bg-white p-5 sm:p-6">
                <div className="h-6 w-1/3 rounded bg-[#ece3f7]" />
                <div className="mt-4 h-4 w-2/3 rounded bg-[#ece3f7]" />
                <div className="mt-6 h-24 rounded bg-[#ece3f7]" />
              </div>
            ))
          ) : visiblePrograms.length === 0 ? (
            <div className="rounded-[1.7rem] border border-dashed border-[#d2c5ee] bg-white px-6 py-12 text-center text-sm text-[#8e81b3]">
              暂无已发布节目。
            </div>
          ) : (
            <>
              {visiblePrograms.map((program, idx) => {
                const routeId = program.programCode || program._id;

                const tags = Array.isArray(program.summary?.tags)
                  ? program.summary.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 4)
                  : [];

                return (
                  <a
                    key={program._id}
                    href={`/programs/${encodeURIComponent(routeId)}`}
                    className="group block overflow-hidden rounded-[1.7rem] border border-[#e1daf0] bg-white p-5 shadow-[0_20px_60px_rgba(63,38,112,0.06)] transition hover:-translate-y-1 hover:border-[#b79bff] hover:shadow-[0_28px_80px_rgba(63,38,112,0.14)] sm:p-6"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row">
                      <div className="w-full overflow-hidden rounded-[1.2rem] bg-[linear-gradient(135deg,_#1f143a,_#4b1db2_44%,_#b79bff)] lg:w-[280px] lg:shrink-0">
                        <img
                          src={program.coverImage || FALLBACK_COVER}
                          alt={program.title || "节目封面"}
                          className="h-52 w-full object-cover transition duration-700 group-hover:scale-105 lg:h-full"
                          onError={(event) => {
                            event.currentTarget.src = FALLBACK_COVER;
                          }}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {program.status === "group-only" && (
                            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold text-orange-600">群友特供</span>
                          )}
                          {program.status === "published" && (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">公开发布</span>
                          )}
                          <span className="text-xs font-medium text-[#8b8177]">{fmtDate(program.publishedAt || program.createdAt)}</span>
                        </div>

                        <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-[#24180a] sm:text-[1.75rem]">
                          {program.title || "未命名节目"}
                        </h2>

                        <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#6f665d]">
                          {program.description || "暂无简介，后续可在后台补充节目摘要、show notes 与学习线索。"}
                        </p>

                        {tags.length > 0 ? (
                          <div className="mt-5 flex flex-wrap gap-2">
                            {tags.map((tag, tagIndex) => (
                              <span
                                key={`${program._id}-tag-${tagIndex}`}
                                className="rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#5e17eb]"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        ) : null}


                      </div>
                    </div>
                  </a>
                );
              })}

              <div className="flex justify-center pt-4 pb-2">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={(page) => {
                    if (!isLoggedIn) {
                      document.dispatchEvent(new CustomEvent('xf-show-login-modal', { detail: { title: '登录后可翻页', description: '登录后即可浏览全部节目、翻页查看往期内容。' } }));
                      return;
                    }
                    setCurrentPage(page);
                  }}
                />
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default ProgramListPage;
