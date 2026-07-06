import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import { Book, LearningMaterial, Program, PublicGuest, publicApi } from "../services/api";

type SearchTab = "all" | "programs" | "topics" | "books" | "materials" | "experts" | "worthbuy";

type SearchItem = {
  id: string;
  tab: Exclude<SearchTab, "all">;
  title: string;
  description: string;
  url: string;
  image?: string;
  meta?: string;
  tags?: string[];
};

type TopicItem = {
  _id?: string;
  id?: string;
  slug: string;
  title: string;
  subtitle?: string;
  shortSummary?: string;
  coverEmoji?: string;
  tags?: string[];
};

const WORTHBUY_HISTORY_KEY = "xf_worthbuy_history";
const tabs: Array<{ key: SearchTab; label: string }> = [
  { key: "all", label: "全部" },
  { key: "programs", label: "节目" },
  { key: "topics", label: "请教" },
  { key: "books", label: "及阅" },
  { key: "materials", label: "资料" },
  { key: "experts", label: "智库" },
  { key: "worthbuy", label: "知物" },
];

const tabLabels: Record<Exclude<SearchTab, "all">, string> = {
  programs: "播客节目",
  topics: "请教一下",
  books: "及阅书单",
  materials: "学习资料",
  experts: "先疯智库",
  worthbuy: "知物分析",
};

const tabIcons: Record<Exclude<SearchTab, "all">, string> = {
  programs: "podcasts",
  topics: "psychology",
  books: "local_florist",
  materials: "inventory_2",
  experts: "person",
  worthbuy: "verified",
};

function includesQuery(text: string, query: string) {
  if (!query) return false;
  return text.toLowerCase().includes(query.toLowerCase());
}

function buildMaterialSearchUrl(title: string) {
  const clean = String(title || "").trim();
  if (!clean) return "/materials";
  const params = new URLSearchParams({ q: clean });
  return `/materials?${params.toString()}`;
}

function readWorthBuyHistory(): SearchItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORTHBUY_HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 20).map((item: any, index: number) => {
      const query = String(item?.query || item?.brand || "知物分析").trim();
      return {
        id: `worthbuy-${query || index}`,
        tab: "worthbuy" as const,
        title: query || "知物分析",
        description: item?.result?.summary || item?.result?.verdict || "查看这条商品/品牌分析记录。",
        url: `/worthbuy/${encodeURIComponent(query || "分析结果")}`,
        meta: "历史分析",
        tags: [item?.result?.category, item?.result?.recommendation].filter(Boolean),
      };
    });
  } catch (_err) {
    return [];
  }
}

function isMiniProgramSearchWebView() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("xf_mp") === "1" || window.sessionStorage.getItem("xf_mp_webview") === "1";
}

const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const miniProgramWebView = isMiniProgramSearchWebView();
  const initialQuery = params.get("q") || "";
  const initialTab = (params.get("tab") || "all") as SearchTab;
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>(tabs.some((tab) => tab.key === initialTab) ? initialTab : "all");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const exitTo = params.get("from") || "/programs/list";

  useEffect(() => {
    setQuery(params.get("q") || "");
    const nextTab = (params.get("tab") || "all") as SearchTab;
    if (tabs.some((tab) => tab.key === nextTab)) setActiveTab(nextTab);
  }, [params]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const [programRes, bookRes, materialRes, guestRes, topicRes] = await Promise.allSettled([
          publicApi.getPrograms({ page: 1, pageSize: 100 }),
          publicApi.getBooks(),
          publicApi.getMaterials(),
          publicApi.getGuests({ page: 1, pageSize: 80 }),
          fetch("/api/topic-hub?limit=100"),
        ]);

        const next: SearchItem[] = [];
        if (programRes.status === "fulfilled") {
          const programs = programRes.value.data.programs || [];
          programs.forEach((program: Program) => {
            next.push({
              id: `program-${program._id}`,
              tab: "programs",
              title: program.title,
              description: program.description || program.summary?.body || "播客节目",
              url: `/programs/${program._id}`,
              image: program.coverImage,
              meta: program.publishedAt ? new Date(program.publishedAt).toLocaleDateString("zh-CN") : "节目",
              tags: program.summary?.tags || [],
            });
          });
        }
        if (bookRes.status === "fulfilled") {
          bookRes.value.data.forEach((book: Book) => {
            next.push({
              id: `book-${book._id}`,
              tab: "books",
              title: book.title,
              description: [book.author, book.publisher, book.topic].filter(Boolean).join(" · ") || "及阅书单",
              url: "/reading",
              image: book.coverImage,
              meta: book.grade || "及阅",
              tags: [book.categoryLabel, book.topic, book.recommendedGuest].filter(Boolean),
            });
          });
        }
        if (materialRes.status === "fulfilled") {
          materialRes.value.data.forEach((material: LearningMaterial) => {
            next.push({
              id: `material-${material._id}`,
              tab: "materials",
              title: material.title,
              description: material.description || material.category || "学习资料",
              url: buildMaterialSearchUrl(material.title),
              meta: material.category || "资料",
            });
          });
        }
        if (guestRes.status === "fulfilled") {
          const guests = guestRes.value.data.guests || [];
          guests.forEach((guest: PublicGuest) => {
            next.push({
              id: `guest-${guest._id}`,
              tab: "experts",
              title: guest.name,
              description: guest.bio || guest.title || "先疯智库专家资料",
              url: `/experts/${guest._id}`,
              image: guest.avatar,
              meta: guest.title || "智库",
              tags: guest.programCount ? [`${guest.programCount}期节目`] : [],
            });
          });
        }
        if (topicRes.status === "fulfilled" && topicRes.value.ok) {
          const data = await topicRes.value.json();
          const topics: TopicItem[] = Array.isArray(data.topics) ? data.topics : [];
          topics.forEach((topic) => {
            next.push({
              id: `topic-${topic.slug || topic._id || topic.id}`,
              tab: "topics",
              title: topic.title,
              description: topic.shortSummary || topic.subtitle || "教育话题知识树",
              url: `/topics/${encodeURIComponent(topic.slug)}`,
              meta: topic.coverEmoji || "请教",
              tags: topic.tags || [],
            });
          });
        }
        next.push(
          {
            id: "worthbuy-new",
            tab: "worthbuy",
            title: "发起知物分析",
            description: "输入商品链接或品牌名称，查看值不值得买。",
            url: "/worthbuy",
            meta: "入口",
            tags: ["消费避坑", "商品分析"],
          },
          ...readWorthBuyHistory()
        );

        if (alive) setItems(next);
      } catch (error: any) {
        if (alive) setLoadError(error?.message || "搜索内容加载失败");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim();
    return items.filter((item) => {
      const tabMatch = activeTab === "all" || item.tab === activeTab;
      const haystack = [item.title, item.description, item.meta, ...(item.tags || [])].join(" ");
      return tabMatch && includesQuery(haystack, q);
    });
  }, [activeTab, items, query]);

  const countByTab = useMemo(() => {
    const q = query.trim();
    return tabs.reduce<Record<SearchTab, number>>((acc, tab) => {
      acc[tab.key] = items.filter((item) => {
        const tabMatch = tab.key === "all" || item.tab === tab.key;
        const haystack = [item.title, item.description, item.meta, ...(item.tags || [])].join(" ");
        return tabMatch && includesQuery(haystack, q);
      }).length;
      return acc;
    }, {} as Record<SearchTab, number>);
  }, [items, query]);

  const groupedItems = useMemo(() => {
    if (activeTab !== "all") return [[activeTab, filteredItems] as const];
    return tabs
      .filter((tab) => tab.key !== "all")
      .map((tab) => [tab.key, filteredItems.filter((item) => item.tab === tab.key).slice(0, 4)] as const)
      .filter(([, list]) => list.length > 0);
  }, [activeTab, filteredItems]);

  const persistentSearchParams = () => {
    const preserved: Record<string, string> = {};
    ["xf_mp", "xf_token", "xw_layer", "xw_return"].forEach((key) => {
      const value = params.get(key);
      if (value) preserved[key] = value;
    });
    return preserved;
  };

  const submitSearch = () => {
    const q = query.trim();
    setParams({ ...persistentSearchParams(), ...(q ? { q } : {}), ...(activeTab !== "all" ? { tab: activeTab } : {}), ...(exitTo ? { from: exitTo } : {}) });
  };

  return (
    <div className="xf-search-page">
      <style>{`
        .xf-search-page{min-height:100vh;background-color:#f3f2f8;background-image:repeating-linear-gradient(45deg,rgba(118,83,205,.06) 0px,rgba(118,83,205,.06) 1px,transparent 1px,transparent 18px),repeating-linear-gradient(-45deg,rgba(118,83,205,.04) 0px,rgba(118,83,205,.04) 1px,transparent 1px,transparent 32px);color:#1f1d1a;font-family:'Noto Sans SC','Plus Jakarta Sans',sans-serif;padding-bottom:calc(104px + env(safe-area-inset-bottom))}
        .xf-search-main{max-width:980px;margin:0 auto;padding:82px 18px 36px}
        html.xf-mp-webview .xf-search-page{padding-bottom:0!important}
        html.xf-mp-webview .xf-search-main{padding-top:var(--xf-mp-nav-height,88px)!important;padding-bottom:0!important}
        .xf-search-head{display:grid;gap:12px}
        .xf-search-title{display:none}
        .xf-search-back{position:absolute;left:0;min-width:54px;height:36px;border:0;background:transparent;color:#7C3AED;font-family:'Noto Sans SC','Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:400;text-align:left}
        .xf-search-bar{display:flex;align-items:center;gap:8px;height:40px;border:1px solid #dbe1ea;border-radius:999px;background:#fff;padding:0 5px 0 15px;box-sizing:border-box;box-shadow:0 8px 22px rgba(31,29,26,.04)}
        .xf-search-query-wrap{display:flex;flex:1 1 auto;align-items:center;justify-content:flex-start;min-width:0}
        .xf-search-bar.is-empty .xf-search-query-wrap{justify-content:center}
        .xf-search-icon{position:relative;width:24px;height:24px;margin-right:10px;flex:0 0 24px}
        .xf-search-icon-circle{position:absolute;top:4px;left:4px;box-sizing:border-box;width:14px;height:14px;border:3px solid #4b5563;border-radius:50%}
        .xf-search-icon-line{position:absolute;right:4px;bottom:5px;width:10px;height:3px;border-radius:999px;background:#4b5563;transform:rotate(45deg);transform-origin:center}
        .xf-search-input{height:38px;min-width:0;flex:1 1 auto;border:0;background:transparent;padding:0;font-size:15px;font-weight:400;color:#1f1d1a;outline:0;line-height:38px}
        .xf-search-bar.is-empty .xf-search-input{flex:0 0 34px;width:34px;text-align:center}
        .xf-search-input::placeholder{color:#8b8792}
        .xf-search-btn{height:34px;min-width:64px;border:0;border-radius:999px;background:#5e17eb;color:#fff;padding:0 14px;font-size:14px;font-weight:900;box-shadow:0 8px 16px rgba(94,23,235,.16)}
        html.xf-mp-webview .xf-search-main{width:calc(100% - 24px)!important;max-width:none!important;padding-left:0!important;padding-right:0!important}
        html.xf-mp-webview .xf-search-bar{width:100%!important;height:40px!important;border:1px solid #dbe1ea!important;border-radius:999px!important;background:#fff!important;padding:0 5px 0 15px!important;gap:8px!important;box-shadow:0 8px 22px rgba(31,29,26,.04)!important}
        html.xf-mp-webview .xf-search-query-wrap{display:flex!important;flex:1 1 auto!important;align-items:center!important;min-width:0!important}
        html.xf-mp-webview .xf-search-icon{width:24px!important;height:24px!important;margin-right:10px!important;flex:0 0 24px!important}
        html.xf-mp-webview .xf-search-input{height:38px!important;min-width:0!important;border:0!important;background:transparent!important;padding:0!important;color:#1f1d1a!important;font-size:15px!important;font-weight:400!important;line-height:38px!important;outline:0!important}
        html.xf-mp-webview .xf-search-input::placeholder{color:#8b8792!important}
        html.xf-mp-webview .xf-search-btn{display:flex!important;align-items:center!important;justify-content:center!important;height:34px!important;min-width:64px!important;margin:0!important;border:0!important;border-radius:999px!important;background:#5e17eb!important;color:#fff!important;padding:0 14px!important;font-size:14px!important;font-weight:900!important;line-height:34px!important;box-shadow:0 8px 16px rgba(94,23,235,.16)!important}
        .xf-search-tabs{display:flex;gap:20px;overflow-x:auto;border-bottom:1px solid rgba(15,23,42,.08);padding:2px 0 0;scrollbar-width:none}
        .xf-search-tabs::-webkit-scrollbar{display:none}
        .xf-search-tab{position:relative;min-height:42px;flex:0 0 auto;border:0;background:transparent;color:#969baa;font-size:12px;font-weight:400;white-space:nowrap}
        .xf-search-tab.on{color:#14142b}
        .xf-search-tab.on::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;border-radius:999px;background:#5e17eb}
        .xf-search-section{display:grid;gap:12px;margin-top:18px;border-radius:0;background:transparent;overflow:visible;box-shadow:none}
        .xf-search-section-head{display:flex;align-items:center;justify-content:space-between;padding:0 8px;border-bottom:0}
        .xf-search-section-title{display:flex;align-items:center;gap:8px;color:#24180a;font-size:13px;font-weight:900}
        .xf-search-section-title .ms{font-family:'Material Symbols Rounded';font-size:18px;color:#5e17eb}
        .xf-search-section-count{font-size:10px;font-weight:800;color:#8b8177}
        .xf-search-result{display:flex;gap:14px;padding:14px;border:1px solid #e1daf0;border-radius:22px;background:#fff;text-decoration:none;color:inherit;box-shadow:0 20px 60px rgba(63,38,112,.06)}
        .xf-search-result:last-child{border-bottom:1px solid #e1daf0}
        .xf-search-thumb{width:68px;height:68px;flex:0 0 68px;border-radius:16px;background:linear-gradient(135deg,#1f143a,#4b1db2 44%,#b79bff);display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;font-family:'Material Symbols Rounded';font-size:28px}
        .xf-search-thumb img{width:100%;height:100%;object-fit:cover}
        .xf-search-result-body{min-width:0;flex:1;display:grid;gap:6px}
        .xf-search-result-top{display:flex;gap:8px;align-items:center}
        .xf-search-result-title{color:#24180a;font-size:15px;font-weight:900;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .xf-search-result-meta{font-size:11px;font-weight:500;color:#8b8177;white-space:nowrap}
        .xf-search-result-desc{font-size:12px;line-height:1.65;color:#6f665d;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .xf-search-tags{display:flex;flex-wrap:wrap;gap:6px}
        .xf-search-tag{border:1px solid #d9c8ff;border-radius:999px;background:#f6f0ff;color:#5e17eb;padding:3px 9px;font-size:10px;font-weight:800}
        .xf-search-empty{margin-top:18px;border:1px dashed #d2c5ee;border-radius:22px;background:#fff;padding:32px 20px;text-align:center;color:#8e81b3;font-size:12px;font-weight:400}
        @media (max-width:768px){.xf-search-main{padding-top:72px}.xf-search-page .tb-mobile-search-sheet{display:none!important}.xf-search-tabs{gap:18px}.xf-search-section{gap:12px}.xf-search-result{padding:14px}.xf-search-thumb{width:64px;height:64px;flex-basis:64px}.xf-search-result-title{font-size:14px}.xf-search-result-desc{font-size:12px}.xf-search-result-meta{display:none}html.xf-mp-webview .xf-search-main{padding-top:var(--xf-mp-nav-height,88px)!important;padding-bottom:0!important}}
      `}</style>
      <GlobalPublicNav compactMobile headless={miniProgramWebView} searchPlaceholder="搜索网站全部内容" searchValue={query} onSearchChange={setQuery} />
      <main className="xf-search-main">
        <div className="xf-search-head">
          <div className={`xf-search-bar ${query.trim() ? "has-query" : "is-empty"}`}>
            <div className="xf-search-query-wrap">
              <span className="xf-search-icon" aria-hidden="true">
                <span className="xf-search-icon-circle"></span>
                <span className="xf-search-icon-line"></span>
              </span>
              <input
                className="xf-search-input"
                value={query}
                placeholder="搜索"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                }}
              />
            </div>
            {query.trim() ? <button type="button" className="xf-search-btn" onClick={submitSearch}>搜索</button> : null}
          </div>
          <div className="xf-search-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`xf-search-tab ${activeTab === tab.key ? "on" : ""}`}
                onClick={() => {
                  setActiveTab(tab.key);
                  const q = query.trim();
                  setParams({ ...persistentSearchParams(), ...(q ? { q } : {}), ...(tab.key !== "all" ? { tab: tab.key } : {}), ...(exitTo ? { from: exitTo } : {}) });
                }}
              >
                {tab.label}{countByTab[tab.key] ? ` ${countByTab[tab.key]}` : ""}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className="xf-search-empty">正在聚合搜索内容...</div> : null}
        {loadError ? <div className="xf-search-empty">{loadError}</div> : null}
        {!loading && !loadError && groupedItems.length === 0 ? (
          <div className="xf-search-empty">{query.trim() ? "没有找到相关内容，可以换个关键词试试。" : "请输入关键词搜索。"}</div>
        ) : null}

        {!loading && !loadError
          ? groupedItems.map(([tab, list]) => (
              <section key={tab} className="xf-search-section">
                <div className="xf-search-section-head">
                  <div className="xf-search-section-title">
                    <span className="ms">{tabIcons[tab as Exclude<SearchTab, "all">]}</span>
                    <span>{tabLabels[tab as Exclude<SearchTab, "all">]}</span>
                  </div>
                  <span className="xf-search-section-count">{list.length} 条</span>
                </div>
                {list.map((item) => (
                  <Link key={item.id} className="xf-search-result" to={item.url}>
                    <span className="xf-search-thumb">{item.image ? <img src={item.image} alt={item.title} /> : <span>{tabIcons[item.tab]}</span>}</span>
                    <span className="xf-search-result-body">
                      <span className="xf-search-result-top">
                        <span className="xf-search-result-title">{item.title}</span>
                        {item.meta ? <span className="xf-search-result-meta">{item.meta}</span> : null}
                      </span>
                      <span className="xf-search-result-desc">{item.description}</span>
                      {item.tags && item.tags.length > 0 ? (
                        <span className="xf-search-tags">
                          {item.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="xf-search-tag">{tag}</span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                ))}
              </section>
            ))
          : null}
      </main>
    </div>
  );
};

export default SearchPage;
