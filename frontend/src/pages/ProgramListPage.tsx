import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import GlobalPublicNav from "../components/GlobalPublicNav";
import Pagination from "../components/Pagination";
import { useIsMobilePager } from "../hooks/useIsMobilePager";
import { useXiaowanziEmbeddedLayer } from "../utils/xiaowanziLayer";


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

function mergeById<T extends { _id: string }>(current: T[], next: T[]) {
  const seen = new Set(current.map((item) => item._id));
  return [...current, ...next.filter((item) => !seen.has(item._id))];
}

function isMiniProgramWebView() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const wechatEnvironment = String((window as any).__wxjs_environment || "").toLowerCase();
  const userAgent = window.navigator?.userAgent || "";
  const detected = params.get("xf_mp") === "1" || params.has("xf_tab") || window.sessionStorage.getItem("xf_mp_webview") === "1" || wechatEnvironment === "miniprogram" || /miniprogram/i.test(userAgent);
  if (detected) {
    window.sessionStorage.setItem("xf_mp_webview", "1");
    document.documentElement.classList.add("xf-mp-webview");
  }
  return detected;
}

const ProgramListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser, token } = useSelector((state: RootState) => state.user);
  const isLoggedIn = !!currentUser && !!token;
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const pageSize = 20;
  const [searchParams, setSearchParams] = useSearchParams();
  const superModePage = useXiaowanziEmbeddedLayer();
  const isMobilePager = useIsMobilePager();
  const miniProgramWebView = isMiniProgramWebView();
  const showInitialLoading = loading && (!isMobilePager || currentPage <= 1);

  const keyword = useMemo(() => String(searchParams.get("q") || "").trim(), [searchParams]);
  const xiaowanziBackButton = superModePage ? (
    <button
      type="button"
      aria-label="返回小玩子"
      onClick={() => {
        if (window.history.length > 1) {
          navigate(-1);
          return;
        }
        navigate("/programs/list?xw_restore=xiaowanzi");
      }}
      className="fixed left-4 top-[calc(14px+env(safe-area-inset-top))] z-[120] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#11143b] shadow-[0_10px_24px_rgba(70,73,132,0.14)]"
    >
      <span className="material-symbols-outlined text-[28px]">arrow_back</span>
    </button>
  ) : null;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      page: String(currentPage),
      pageSize: String(pageSize),
    });
    if (keyword) query.set("q", keyword);
    fetch(`/api/programs?${query.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then((raw: any) => {
        if (!alive) return;
        const data: Program[] = Array.isArray(raw?.programs) ? raw.programs : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setPrograms((prev) => (isMobilePager && currentPage > 1 ? mergeById(prev, data) : data));
        setTotalPages(raw?.totalPages || 1);
        setTotal(raw?.total || data.length);
        if (!isMobilePager) window.scrollTo({ top: 0, behavior: "smooth" });
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
  }, [currentPage, isMobilePager, keyword]);

  return (
    <div className={`xf-program-list-page ${miniProgramWebView ? "xf-mp-webview" : ""} relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#1f1d1a]`}>
      {/* ProgramList: diagonal grid lines + pulsing orbs */}
      <style>{`
        .xf-program-list-page { background: #f3f2f8; color: #1f1d1a; min-height: 100vh; overflow-x: hidden; }
        .xf-program-main { position: relative; z-index: 10; width: min(100% - 32px, 1280px); margin: 0 auto; padding-bottom: 64px; }
        .xf-program-main.with-nav { padding-top: 76px; }
        .xf-program-main.without-nav { padding-top: 24px; }
        html.xf-mp-webview .xf-program-main {
          --xf-mp-outer-gutter: clamp(8px, 2.4vw, 10px);
          --xf-mp-inner-gutter: clamp(3px, 1vw, 4px);
          width: calc(100% - var(--xf-mp-outer-gutter)) !important;
          padding-left: var(--xf-mp-inner-gutter) !important;
          padding-right: var(--xf-mp-inner-gutter) !important;
          padding-top: 12px !important;
          padding-bottom: 0 !important;
        }
        .xf-program-hero { position: relative; overflow: hidden; border: 1px solid #d8d0ef; border-radius: 32px; background: radial-gradient(circle at 18% 0%, rgba(143,100,255,.14), transparent 36%), radial-gradient(circle at 76% 22%, rgba(124,58,237,.08), transparent 32%), linear-gradient(135deg,#f4f1fd 0%,#f9f7ff 45%,#f0ebff 100%); padding: 32px; box-shadow: 0 24px 80px rgba(80,62,125,.12); }
        .xf-program-eyebrow { display: inline-flex; border: 1px solid #cfc2ef; border-radius: 999px; background: #f3eefc; padding: 4px 16px; color: #5b3fa1; font-size: 11px; font-weight: 900; letter-spacing: .28em; text-transform: uppercase; }
        .xf-program-title { margin: 20px 0 0; max-width: 760px; color: #24180a; font-size: clamp(28px, 7vw, 48px); line-height: 1.14; font-weight: 900; letter-spacing: 0; }
        .xf-program-intro { margin: 16px 0 0; max-width: 680px; color: #6f665d; font-size: 15px; line-height: 1.85; }
        .xf-program-list { margin-top: 32px; display: grid; gap: 20px; }
        .xf-program-card { display: block; overflow: hidden; border: 1px solid #e1daf0; border-radius: 27px; background: #fff; padding: 20px; color: inherit; text-decoration: none; box-shadow: 0 20px 60px rgba(63,38,112,.06); }
        .xf-program-card:hover { border-color: #b79bff; box-shadow: 0 28px 80px rgba(63,38,112,.14); }
        .xf-program-card-inner { display: flex; flex-direction: column; gap: 20px; }
        .xf-program-cover { width: 100%; min-height: 180px; overflow: hidden; border-radius: 19px; background: linear-gradient(135deg,#1f143a,#4b1db2 44%,#b79bff); }
        .xf-program-cover img { width: 100%; height: 208px; object-fit: cover; display: block; }
        .xf-program-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .xf-program-pill { border-radius: 999px; padding: 3px 10px; font-size: 10px; font-weight: 800; }
        .xf-program-pill.group-only { background: #ffedd5; color: #ea580c; }
        .xf-program-pill.published { background: #d1fae5; color: #059669; }
        .xf-program-date { color: #8b8177; font-size: 12px; font-weight: 500; }
        .xf-program-card-title { margin: 16px 0 0; color: #24180a; font-size: 24px; line-height: 1.2; font-weight: 850; letter-spacing: 0; }
        .xf-program-desc { margin: 16px 0 0; color: #6f665d; font-size: 14px; line-height: 1.85; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .xf-program-tags { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 8px; }
        .xf-program-tag { border: 1px solid #d9c8ff; border-radius: 999px; background: #f6f0ff; padding: 4px 12px; color: #5e17eb; font-size: 11px; font-weight: 800; }
        .xf-program-empty { border: 1px dashed #d2c5ee; border-radius: 27px; background: #fff; padding: 48px 24px; text-align: center; color: #8e81b3; font-size: 14px; }
        .xf-program-loading { border: 1px solid #e2dcf0; border-radius: 27px; background: #fff; padding: 20px; }
        .xf-program-loading div { border-radius: 8px; background: #ece3f7; }
        .xf-program-error { margin-top: 24px; border: 1px solid #fee2e2; border-radius: 16px; background: #fef2f2; padding: 16px 20px; color: #ef4444; font-size: 14px; }
        .xf-program-pager { display: flex; justify-content: center; padding: 16px 0 8px; }
        @media (min-width: 1024px) {
          .xf-program-card-inner { flex-direction: row; }
          .xf-program-cover { width: 280px; flex: 0 0 280px; }
          .xf-program-cover img { height: 100%; min-height: 220px; }
        }
        @media (max-width: 768px) {
          .xf-program-main { width: calc(100% - 24px); padding-bottom: 28px; }
          .xf-program-main.with-nav { padding-top: 68px; }
          html.xf-mp-webview .xf-program-main {
            --xf-mp-outer-gutter: clamp(8px, 2.4vw, 10px);
            --xf-mp-inner-gutter: clamp(3px, 1vw, 4px);
            width: calc(100% - var(--xf-mp-outer-gutter)) !important;
            padding-left: var(--xf-mp-inner-gutter) !important;
            padding-right: var(--xf-mp-inner-gutter) !important;
            padding-top: 12px !important;
            padding-bottom: 0 !important;
          }
          .xf-program-hero { border-radius: 24px; padding: 22px 20px; }
          .xf-program-card { border-radius: 22px; padding: 16px; }
          .xf-program-cover { min-height: 150px; border-radius: 16px; }
          .xf-program-cover img { height: 174px; }
          .xf-program-card-title { font-size: 20px; }
        }
        html.xf-mp-webview .xf-program-list-page {
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
        }
        html.xf-mp-webview .xf-program-pill {
          font-size: 10px !important;
          font-weight: 800 !important;
        }
        html.xf-mp-webview .xf-program-date {
          font-size: 12px !important;
          font-weight: 500 !important;
        }
        html.xf-mp-webview .xf-program-card-title {
          font-size: 20px !important;
          font-weight: 400 !important;
          line-height: 1.2 !important;
        }
        html.xf-mp-webview .xf-program-desc {
          font-size: 14px !important;
          font-weight: 400 !important;
          line-height: 1.85 !important;
        }
        html.xf-mp-webview .xf-program-tag {
          font-size: 11px !important;
          font-weight: 800 !important;
        }
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

      {xiaowanziBackButton}

      {!superModePage ? (
        <GlobalPublicNav
          compactMobile
          showSearch
          showAiOnline
          showLogout
          showProgramList
          showExpertsEntry
          searchPlaceholder="搜索节目标题/简介"
          searchValue={keyword}
          onSearchChange={(value) => {
            const next = new URLSearchParams(searchParams);
            const trimmed = String(value || "").trim();
            if (trimmed) next.set("q", trimmed);
            else next.delete("q");
            next.delete("page");
            setCurrentPage(1);
            setSearchParams(next);
          }}
        />
      ) : null}

      <main className={`xf-program-main ${superModePage ? "without-nav" : "with-nav"} relative z-10 mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8 ${superModePage ? "pt-6" : "pt-[76px]"}`}>
        <section className="xf-program-hero group relative overflow-hidden rounded-[2rem] border border-[#d8d0ef] bg-[radial-gradient(circle_at_18%_0%,_rgba(143,100,255,0.14),_transparent_36%),radial-gradient(circle_at_76%_22%,_rgba(124,58,237,0.08),_transparent_32%),linear-gradient(135deg,_#f4f1fd_0%,_#f9f7ff_45%,_#f0ebff_100%)] p-8 shadow-[0_24px_80px_rgba(80,62,125,0.12)] sm:p-10">
            <div className="max-w-3xl">
              <div className="xf-program-eyebrow inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#5b3fa1]">
                Programs
              </div>
              <h1 className="xf-program-title mt-5 text-4xl font-black leading-[1.14] tracking-tight text-[#24180a] sm:text-5xl">
                从完整节目索引中，快速定位你此刻最需要的内容
              </h1>
              <p className="xf-program-intro mt-4 max-w-2xl text-sm leading-7 text-[#6f665d] sm:text-base">
                这里汇总已发布节目，按时间倒序呈现。你可以直接搜索标题与简介，并通过标签和内容类型快速判断每一期是否值得立即深听。
              </p>
            </div>
        </section>

        {error ? <div className="xf-program-error mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-500">{error}</div> : null}

        <section className="xf-program-list mt-8 space-y-5">
          {showInitialLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="xf-program-loading animate-pulse rounded-[1.7rem] border border-[#e2dcf0] bg-white p-5 sm:p-6">
                <div className="h-6 w-1/3 rounded bg-[#ece3f7]" />
                <div className="mt-4 h-4 w-2/3 rounded bg-[#ece3f7]" />
                <div className="mt-6 h-24 rounded bg-[#ece3f7]" />
              </div>
            ))
          ) : programs.length === 0 ? (
            <div className="xf-program-empty rounded-[1.7rem] border border-dashed border-[#d2c5ee] bg-white px-6 py-12 text-center text-sm text-[#8e81b3]">
              暂无已发布节目。
            </div>
          ) : (
            <>
              {programs.map((program) => {
                const routeId = program.programCode || program._id;

                const tags = Array.isArray(program.summary?.tags)
                  ? program.summary.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 4)
                  : [];

                return (
                  <a
                    key={program._id}
                    href={`/programs/${encodeURIComponent(routeId)}${miniProgramWebView ? "?xf_mp=1" : superModePage ? "?xw_layer=1" : ""}`}
                    className="xf-program-card group block overflow-hidden rounded-[1.7rem] border border-[#e1daf0] bg-white p-5 shadow-[0_20px_60px_rgba(63,38,112,0.06)] transition hover:-translate-y-1 hover:border-[#b79bff] hover:shadow-[0_28px_80px_rgba(63,38,112,0.14)] sm:p-6"
                  >
                    <div className="xf-program-card-inner flex flex-col gap-5 lg:flex-row">
                      <div className="xf-program-cover w-full overflow-hidden rounded-[1.2rem] bg-[linear-gradient(135deg,_#1f143a,_#4b1db2_44%,_#b79bff)] lg:w-[280px] lg:shrink-0">
                        {program.coverImage ? (
                          <img
                            src={program.coverImage}
                            alt={program.title || "节目封面"}
                            className="h-52 w-full object-cover transition duration-700 group-hover:scale-105 lg:h-full"
                            onError={(event) => {
                              (event.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="xf-program-meta flex flex-wrap items-center gap-2">
                          {program.status === "group-only" && (
                            <span className="xf-program-pill group-only rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold text-orange-600">群友特供</span>
                          )}
                          {program.status === "published" && (
                            <span className="xf-program-pill published rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">公开发布</span>
                          )}
                          <span className="xf-program-date text-xs font-medium text-[#8b8177]">{fmtDate(program.publishedAt || program.createdAt)}</span>
                        </div>

                        <h2 className="xf-program-card-title mt-4 text-2xl font-extrabold leading-tight tracking-tight text-[#24180a] sm:text-[1.75rem]">
                          {program.title || "未命名节目"}
                        </h2>

                        <p className="xf-program-desc mt-4 line-clamp-3 text-sm leading-7 text-[#6f665d]">
                          {program.description || "暂无简介，后续可在后台补充节目摘要、show notes 与学习线索。"}
                        </p>

                        {tags.length > 0 ? (
                          <div className="xf-program-tags mt-5 flex flex-wrap gap-2">
                            {tags.map((tag, tagIndex) => (
                              <span
                                key={`${program._id}-tag-${tagIndex}`}
                                className="xf-program-tag rounded-full border border-[#d9c8ff] bg-[#f6f0ff] px-3 py-1 text-[11px] font-bold text-[#5e17eb]"
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

              <div className="xf-program-pager flex justify-center pt-4 pb-2">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  mobileAutoLoad
                  mobileHasMore={currentPage < totalPages}
                  mobileLoading={loading && isMobilePager && currentPage > 1}
                  onMobileLoadMore={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
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
