import React, { useEffect, useMemo, useState } from "react";
import GlobalPublicNav from "../components/GlobalPublicNav";

type ProgramItem = {
  _id: string;
  programCode?: string;
  title?: string;
  description?: string;
  coverImage?: string;
  summary?: { tags?: string[] };
  transcript?: Array<{ text?: string }>;
  dictionaryEntries?: Array<{ term?: string }>;
  deepDive?: { curatedReading?: Array<{ title?: string }> };
  contentPack?: { showNotes?: { renderedText?: string } };
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type BookItem = {
  _id: string;
  title?: string;
  description?: string;
  coverImage?: string;
  category?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type MaterialItem = {
  _id: string;
  title?: string;
  description?: string;
  category?: string;
  fileUrl?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type LandingCaseType = "program" | "book" | "material";

type LandingCaseItem = {
  id: string;
  type: LandingCaseType;
  title: string;
  summary: string;
  tags: string[];
  href: string;
  cover?: string;
  score: number;
  updatedTs: number;
};

type CaseFilter = "all" | LandingCaseType;

const FALLBACK_COVER = "/assets/podcast-cover-1.svg";
const CASE_PAGE_SIZE = 6;

const fallbackCases: LandingCaseItem[] = [
  {
    id: "fallback-program-1",
    type: "program",
    title: "第一次做爸妈，没人教，但我们陪你走",
    summary: "围绕冲突、沟通和边界，提供可执行的家庭教育参考。",
    tags: ["节目案例", "逐字稿", "成长对话"],
    href: "/programs",
    cover: FALLBACK_COVER,
    score: 98,
    updatedTs: 0,
  },
  {
    id: "fallback-program-2",
    type: "program",
    title: "升学与择校的真实选择题",
    summary: "聚焦上海本地和高适用策略，用案例帮助家庭在关键节点降低决策焦虑。",
    tags: ["节目案例", "择校规划", "决策支持"],
    href: "/programs",
    cover: FALLBACK_COVER,
    score: 95,
    updatedTs: 0,
  },
  {
    id: "fallback-program-3",
    type: "program",
    title: "当学习问题来到家庭现场",
    summary: "把学习问题拆成可理解、可落地的家庭策略。",
    tags: ["节目案例", "科学学习", "家庭实践"],
    href: "/programs",
    cover: FALLBACK_COVER,
    score: 93,
    updatedTs: 0,
  },
  {
    id: "fallback-book-1",
    type: "book",
    title: "家长阅读清单：从理念到行动",
    summary: "按阶段整理阅读路径，帮助家长从“知道”到“做到”。",
    tags: ["书单案例", "阅读参考", "家长决策"],
    href: "/books",
    score: 86,
    updatedTs: 0,
  },
  {
    id: "fallback-book-2",
    type: "book",
    title: "教育主题精选书目",
    summary: "围绕升学、学习、成长与家庭关系，提供结构化阅读入口。",
    tags: ["书单案例", "主题阅读"],
    href: "/books",
    score: 84,
    updatedTs: 0,
  },
  {
    id: "fallback-material-1",
    type: "material",
    title: "家庭教育资料包",
    summary: "把节目观点转换为可复用的资料模板，方便日常实践和复盘。",
    tags: ["资料案例", "实操模板", "可下载"],
    href: "/materials",
    score: 87,
    updatedTs: 0,
  },
  {
    id: "fallback-material-2",
    type: "material",
    title: "学习与沟通工具集",
    summary: "整理家庭学习与亲子沟通常用工具，提升执行效率。",
    tags: ["资料案例", "在线查看"],
    href: "/materials",
    score: 82,
    updatedTs: 0,
  },
  {
    id: "fallback-program-4",
    type: "program",
    title: "教育里的“人”：家长、老师与孩子",
    summary: "从多方视角看教育关系，避免只盯孩子的单点答案。",
    tags: ["节目案例", "人间教育万象"],
    href: "/programs",
    cover: FALLBACK_COVER,
    score: 91,
    updatedTs: 0,
  },
  {
    id: "fallback-material-3",
    type: "material",
    title: "节目复盘卡",
    summary: "帮助家长把“听过”转成“做过”，形成可追踪的行动闭环。",
    tags: ["资料案例", "复盘"],
    href: "/materials",
    score: 80,
    updatedTs: 0,
  },
  {
    id: "fallback-program-5",
    type: "program",
    title: "健康成长：身体与情绪是底层能力",
    summary: "聚焦身心通畅与家庭节奏，重建长期教育决策的稳定底盘。",
    tags: ["节目案例", "健康成长"],
    href: "/programs",
    cover: FALLBACK_COVER,
    score: 89,
    updatedTs: 0,
  },
  {
    id: "fallback-book-3",
    type: "book",
    title: "家长沟通与边界建立",
    summary: "围绕冲突管理与家庭规则，给出可实操的方法框架。",
    tags: ["书单案例", "沟通"],
    href: "/books",
    score: 81,
    updatedTs: 0,
  },
  {
    id: "fallback-program-6",
    type: "program",
    title: "从焦虑到行动的家庭决策法",
    summary: "不追求完美答案，先做小步验证，再迭代家庭策略。",
    tags: ["节目案例", "策略验证"],
    href: "/programs",
    cover: FALLBACK_COVER,
    score: 88,
    updatedTs: 0,
  },
];

function toText(value: unknown): string {
  return String(value || "").trim();
}

function hasText(value: unknown): boolean {
  return toText(value).length > 0;
}

function toTimestamp(...values: Array<string | undefined>): number {
  for (const value of values) {
    const ts = Date.parse(value || "");
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function buildProgramCase(item: ProgramItem): LandingCaseItem {
  const routeId = toText(item.programCode) || item._id;
  const rawTags = Array.isArray(item.summary?.tags) ? item.summary?.tags : [];
  const hasTranscript = Array.isArray(item.transcript) && item.transcript.some((segment) => hasText(segment?.text));
  const hasDictionary = Array.isArray(item.dictionaryEntries) && item.dictionaryEntries.some((entry) => hasText(entry?.term));
  const hasReading = Array.isArray(item.deepDive?.curatedReading) && item.deepDive?.curatedReading.some((entry) => hasText(entry?.title));
  const hasShownotes = hasText(item.contentPack?.showNotes?.renderedText);

  const enrichTags = [
    "节目案例",
    hasTranscript ? "逐字稿" : "",
    hasDictionary ? "教育词典" : "",
    hasReading ? "延伸阅读" : "",
    hasShownotes ? "节目信息卡" : "",
  ].filter(Boolean);

  const tags = [...rawTags.map((tag) => toText(tag)).filter(Boolean), ...enrichTags].slice(0, 5);
  const score =
    (hasText(item.description) ? 24 : 8) +
    (hasTranscript ? 20 : 0) +
    (hasDictionary ? 16 : 0) +
    (hasReading ? 16 : 0) +
    (hasShownotes ? 16 : 0) +
    tags.length * 5;

  return {
    id: item._id,
    type: "program",
    title: toText(item.title) || "未命名节目",
    summary: toText(item.description) || "暂无节目摘要，点击查看完整内容。",
    tags: tags.length ? tags : ["节目案例"],
    href: routeId ? `/programs/${encodeURIComponent(routeId)}` : "/programs",
    cover: toText(item.coverImage) || FALLBACK_COVER,
    score,
    updatedTs: toTimestamp(item.publishedAt, item.updatedAt, item.createdAt),
  };
}

function buildBookCase(item: BookItem): LandingCaseItem {
  const category = toText(item.category);
  const hasCover = hasText(item.coverImage);
  const tags = ["书单案例", category ? `书单/${category}` : "阅读参考", hasCover ? "封面素材" : "图文摘要"].filter(Boolean);

  return {
    id: item._id,
    type: "book",
    title: toText(item.title) || "未命名书单",
    summary: toText(item.description) || "暂无书单摘要，点击查看完整内容。",
    tags,
    href: "/books",
    cover: hasCover ? toText(item.coverImage) : undefined,
    score: (hasText(item.description) ? 28 : 10) + (category ? 18 : 8) + (hasCover ? 10 : 0),
    updatedTs: toTimestamp(item.publishedAt, item.updatedAt, item.createdAt),
  };
}

function buildMaterialCase(item: MaterialItem): LandingCaseItem {
  const category = toText(item.category);
  const downloadable = hasText(item.fileUrl);
  const tags = ["资料案例", category ? `资料/${category}` : "资料参考", downloadable ? "可下载" : "在线查看"].filter(Boolean);

  return {
    id: item._id,
    type: "material",
    title: toText(item.title) || "未命名资料",
    summary: toText(item.description) || "暂无资料摘要，点击查看完整内容。",
    tags,
    href: "/materials",
    score: (hasText(item.description) ? 26 : 8) + (downloadable ? 20 : 8) + (category ? 12 : 0),
    updatedTs: toTimestamp(item.publishedAt, item.updatedAt, item.createdAt),
  };
}

const LandingPage: React.FC = () => {
  const [items, setItems] = useState<LandingCaseItem[]>(fallbackCases);
  const [loading, setLoading] = useState(true);
  const [caseFilter, setCaseFilter] = useState<CaseFilter>("all");
  const [activeTag, setActiveTag] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    let disposed = false;

    async function loadCases() {
      const [programRes, bookRes, materialRes] = await Promise.allSettled([
        fetch("/api/programs").then((res) => (res.ok ? res.json() : [])),
        fetch("/api/books").then((res) => (res.ok ? res.json() : [])),
        fetch("/api/learning-materials").then((res) => (res.ok ? res.json() : [])),
      ]);

      if (disposed) return;

      const programs = programRes.status === "fulfilled" && Array.isArray(programRes.value) ? (programRes.value as ProgramItem[]) : [];
      const books = bookRes.status === "fulfilled" && Array.isArray(bookRes.value) ? (bookRes.value as BookItem[]) : [];
      const materials = materialRes.status === "fulfilled" && Array.isArray(materialRes.value) ? (materialRes.value as MaterialItem[]) : [];

      const merged = [
        ...programs.map((item) => buildProgramCase(item)),
        ...books.map((item) => buildBookCase(item)),
        ...materials.map((item) => buildMaterialCase(item)),
      ];

      const sorted = merged
        .sort((a, b) => b.score + b.updatedTs / 1e10 - (a.score + a.updatedTs / 1e10))
        .slice(0, 36);

      const hasContent = sorted.length >= 6;
      setItems(hasContent ? sorted : fallbackCases);
      setLoading(false);
    }

    loadCases().catch(() => {
      if (disposed) return;
      setItems(fallbackCases);
      setLoading(false);
    });

    return () => {
      disposed = true;
    };
  }, []);

  const stats = useMemo(() => {
    const programCount = items.filter((item) => item.type === "program").length;
    const bookCount = items.filter((item) => item.type === "book").length;
    const materialCount = items.filter((item) => item.type === "material").length;
    return {
      programCount,
      bookCount,
      materialCount,
      totalCount: items.length,
    };
  }, [items]);

  const tags = useMemo(() => {
    const bucket = new Map<string, number>();
    items.forEach((item) => {
      item.tags.forEach((tag) => {
        const text = toText(tag);
        if (!text) return;
        bucket.set(text, (bucket.get(text) || 0) + 1);
      });
    });
    return Array.from(bucket.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map((entry) => entry[0]);
  }, [items]);

  const filteredItems = useMemo(() => {
    const byType = caseFilter === "all" ? items : items.filter((item) => item.type === caseFilter);
    const byTag =
      activeTag === "all"
        ? byType
        : byType.filter((item) => item.tags.some((tag) => normalizeTag(tag) === normalizeTag(activeTag)));
    return byTag;
  }, [items, caseFilter, activeTag]);

  const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);

  useEffect(() => {
    setVisibleCount(12);
  }, [caseFilter, activeTag]);

  const capabilityCards = [
    {
      title: "节目深度收听",
      text: "每期邀请教育相关从业者，输出观点、经验与真实案例。",
      icon: "podcasts",
    },
    {
      title: "案例快速定位",
      text: "通过标签和结构化摘要，按家庭问题快速检索参考内容。",
      icon: "search",
    },
    {
      title: "书单与资料联动",
      text: "从节目扩展到书单与资料，形成“听-看-用”闭环。",
      icon: "library_books",
    },
    {
      title: "决策支持视角",
      text: "不提供标准答案，提供可验证、可迭代的家庭策略。",
      icon: "alt_route",
    },
    {
      title: "AI 与检索能力",
      text: "结合逐字稿、词典与延伸内容，提升家庭决策效率。",
      icon: "smart_toy",
    },
  ];

  const topicCards = [
    {
      title: "升学择校规划",
      text: "以上海本地升学规划和高适用择校策略为主。",
      stage: "适用阶段：幼升小到高中",
      issue: "典型问题：路径选择、关键节点决策",
      icon: "map_search",
      href: "/programs",
    },
    {
      title: "科学学习指南",
      text: "涉及核心学科学习方法与家庭执行策略。",
      stage: "适用阶段：小学到大学",
      issue: "典型问题：学习效率、习惯与方法",
      icon: "school",
      href: "/programs",
    },
    {
      title: "健康成长手册",
      text: "关注身心健康与长期教育节奏的稳定性。",
      stage: "适用阶段：全阶段",
      issue: "典型问题：情绪、作息、压力管理",
      icon: "favorite",
      href: "/programs",
    },
    {
      title: "人间教育万象",
      text: "不止聊孩子，也聊家长、老师和教育行业中的每个“人”。",
      stage: "适用阶段：全阶段",
      issue: "典型问题：关系、角色与教育认知",
      icon: "diversity_3",
      href: "/programs",
    },
  ];

  return (
    <div className="landing-root">
      <style>{`
        .landing-root {
          --lp-bg: #f8f6f1;
          --lp-bg-soft: #fefcf7;
          --lp-panel: rgba(255, 255, 255, 0.88);
          --lp-panel-solid: #ffffff;
          --lp-panel-border: rgba(32, 53, 96, 0.12);
          --lp-text: #19212c;
          --lp-muted: #5e6878;
          --lp-primary: #5e17eb;
          --lp-primary-ink: #4d12c2;
          --lp-accent: #8b5cf6;
          --lp-shadow: 0 14px 40px rgba(27, 46, 87, 0.08);
          --lp-radius-lg: 24px;
          --lp-radius-md: 16px;
          --lp-space: clamp(16px, 2.4vw, 30px);
          min-height: 100vh;
          color: var(--lp-text);
          background:
            radial-gradient(900px 420px at 0% -8%, rgba(41, 84, 214, 0.12), transparent 60%),
            radial-gradient(780px 340px at 100% -6%, rgba(0, 169, 165, 0.11), transparent 60%),
            linear-gradient(180deg, var(--lp-bg-soft), var(--lp-bg));
          overflow-x: hidden;
        }
        .landing-shell {
          width: min(1220px, calc(100% - 28px));
          margin: 0 auto;
        }
        .landing-block {
          margin-top: clamp(40px, 6vw, 88px);
        }
        .glass {
          background: var(--lp-panel);
          border: 1px solid var(--lp-panel-border);
          box-shadow: var(--lp-shadow);
          backdrop-filter: blur(10px);
        }
        .panel {
          background: var(--lp-panel-solid);
          border: 1px solid var(--lp-panel-border);
          box-shadow: 0 8px 24px rgba(25, 46, 80, 0.06);
        }
        .fade-up {
          opacity: 0;
          transform: translateY(16px);
          animation: fadeUp 0.55s ease forwards;
        }
        .chip-btn {
          min-height: 44px;
          border-radius: 999px;
          border: 1px solid #d6dde8;
          padding: 0 14px;
          font-size: 12px;
          font-weight: 700;
          color: #3d4a62;
          background: #fff;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .chip-btn:hover {
          border-color: #a9b7d0;
          transform: translateY(-1px);
        }
        .chip-btn.on {
          border-color: #2954d6;
          background: #ebf0ff;
          color: #1f43af;
        }
        @keyframes fadeUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (max-width: 768px) {
          .landing-shell {
            width: calc(100% - 18px);
          }
          .landing-block {
            margin-top: 32px;
          }
        }
      `}</style>

      <GlobalPublicNav
        showSearch={false}
        showAiOnline={false}
        showLogout={false}
        showProgramList={false}
        showProgramEntry={false}
        compactMobile
      />

      <main className="landing-shell pb-20 pt-10 sm:pt-12">
        <section className="landing-block mt-0">
          <div className="glass fade-up overflow-hidden rounded-[32px] border p-6 sm:p-10" style={{ animationDelay: "80ms" }}>
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <p className="inline-flex min-h-8 items-center rounded-full border border-[#bfd0f7] bg-[#eaf1ff] px-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#1f43af]">
                  Parenting Talk Show
                </p>
                <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">
                  为孩子发声，替家长发疯
                </h1>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--lp-muted)] sm:text-base">
                  《家长先疯》是一档教育对话节目。我们邀请教育及相关行业从业者，聊观点、经验和真实案例，
                  给家长在育儿路上一个可靠参考。不止聊教育，更聊成长；不止关注孩子，也关注教育中的每个“人”。
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="/programs"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--lp-primary)] px-6 text-sm font-black text-white transition hover:bg-[var(--lp-primary-ink)]"
                  >
                    立即收听节目
                  </a>
                  <a
                    href="#case-wall"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#c8d2e3] bg-white px-6 text-sm font-bold text-[#34445e] transition hover:border-[#2954d6] hover:text-[#1f43af]"
                  >
                    查看案例矩阵
                  </a>
                </div>
              </div>

              <aside className="panel fade-up rounded-[24px] p-5 sm:p-7" style={{ animationDelay: "160ms" }}>
                <p className="text-sm font-black text-[#22314a]">内容规模与信任背书</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[#d9e1ee] bg-[#f8fbff] p-4">
                    <div className="text-2xl font-black text-[#1f43af]">{stats.programCount}+</div>
                    <p className="mt-1 text-xs font-semibold text-[#60718d]">节目案例</p>
                  </div>
                  <div className="rounded-2xl border border-[#d9e1ee] bg-[#f8fbff] p-4">
                    <div className="text-2xl font-black text-[#1f43af]">{stats.bookCount}+</div>
                    <p className="mt-1 text-xs font-semibold text-[#60718d]">书单参考</p>
                  </div>
                  <div className="rounded-2xl border border-[#d9e1ee] bg-[#f8fbff] p-4">
                    <div className="text-2xl font-black text-[#1f43af]">{stats.materialCount}+</div>
                    <p className="mt-1 text-xs font-semibold text-[#60718d]">资料模板</p>
                  </div>
                  <div className="rounded-2xl border border-[#d9e1ee] bg-[#f8fbff] p-4">
                    <div className="text-2xl font-black text-[#1f43af]">0-18+</div>
                    <p className="mt-1 text-xs font-semibold text-[#60718d]">覆盖成长阶段</p>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-6 text-[#5e6e89]">
                  目前我们关注孩子出生到上大学阶段。选题会因嘉宾档期和议题时效动态分布。
                </p>
              </aside>
            </div>
          </div>
        </section>

        <section className="landing-block">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="text-2xl font-black sm:text-3xl">功能概述</h2>
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#72829c]">Capability Strip</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            {capabilityCards.map((card, index) => (
              <article key={card.title} className="panel fade-up rounded-2xl p-4" style={{ animationDelay: `${120 + index * 50}ms` }}>
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf1ff]">
                  <span className="material-symbols-outlined text-[#1f43af]">{card.icon}</span>
                </div>
                <h3 className="text-sm font-black text-[#25324a]">{card.title}</h3>
                <p className="mt-2 text-xs leading-6 text-[#60718d]">{card.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="case-wall" className="landing-block">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black sm:text-3xl">参考案例矩阵</h2>
              <p className="mt-2 text-sm text-[#63718a]">基于当前测试数据实时聚合：节目、书单、资料三类内容。</p>
            </div>
            <a className="text-sm font-bold text-[#1f43af] hover:text-[#152e7a]" href="/programs">
              进入完整内容库 →
            </a>
          </div>

          <div className="panel rounded-3xl p-4 sm:p-6">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {[
                { key: "all", label: "混合精选" },
                { key: "program", label: "节目案例" },
                { key: "book", label: "书单案例" },
                { key: "material", label: "资料案例" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`chip-btn ${caseFilter === item.key ? "on" : ""}`}
                  onClick={() => setCaseFilter(item.key as CaseFilter)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              <button type="button" className={`chip-btn ${activeTag === "all" ? "on" : ""}`} onClick={() => setActiveTag("all")}>
                全部标签
              </button>
              {tags.map((tag) => (
                <button key={tag} type="button" className={`chip-btn ${activeTag === tag ? "on" : ""}`} onClick={() => setActiveTag(tag)}>
                  {tag}
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item, index) => (
                <a
                  key={`${item.type}-${item.id}`}
                  href={item.href}
                  className="fade-up group panel flex min-h-[310px] flex-col overflow-hidden rounded-2xl transition hover:-translate-y-1 hover:border-[#b9c8e4]"
                  style={{ animationDelay: `${160 + index * 40}ms` }}
                >
                  {item.cover ? (
                    <div className="h-40 overflow-hidden border-b border-[#dce4f2] bg-[#eef4ff]">
                      <img src={item.cover} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    </div>
                  ) : null}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#1f43af]">
                      {item.type === "program" ? "Program" : item.type === "book" ? "Booklist" : "Material"}
                    </div>
                    <h3 className="line-clamp-2 text-lg font-black text-[#24314a]">{item.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5f6f89]">{item.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.tags.slice(0, 4).map((tag) => (
                        <span key={`${item.id}-${tag}`} className="rounded-full border border-[#d4deef] bg-[#f8fbff] px-2.5 py-1 text-[11px] font-bold text-[#4b5b76]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {filteredItems.length === 0 ? <p className="mt-4 text-sm text-[#6c7a93]">当前筛选下暂无内容，请切换分类或标签。</p> : null}

            {visibleCount < filteredItems.length ? (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#c5d2e8] bg-white px-6 text-sm font-black text-[#314561] transition hover:border-[#2954d6] hover:text-[#1f43af]"
                  onClick={() => setVisibleCount((count) => count + CASE_PAGE_SIZE)}
                >
                  加载更多案例
                </button>
              </div>
            ) : null}

            {loading ? <p className="mt-4 text-sm text-[#6c7a93]">正在加载案例内容...</p> : null}
          </div>
        </section>

        <section className="landing-block">
          <div className="panel rounded-3xl p-6 sm:p-9">
            <h2 className="text-2xl font-black sm:text-3xl">关于我们</h2>
            <p className="mt-4 text-sm leading-7 text-[#5f6f89] sm:text-base">
              《家长先疯》由“家和万事”团队出品，秉持“服务家庭，智慧决策”的宗旨。我们希望通过优质内容和专业判断，
              为家长在关键选择上提供真实、可靠、可落地的参考。
            </p>
          </div>
        </section>

        <section className="landing-block">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="text-2xl font-black sm:text-3xl">四大内容板块</h2>
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#72829c]">Topics</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {topicCards.map((card, index) => (
              <a
                key={card.title}
                href={card.href}
                className="panel fade-up block rounded-3xl p-6 transition hover:-translate-y-1 hover:border-[#b4c6e4]"
                style={{ animationDelay: `${120 + index * 55}ms` }}
              >
                <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf1ff]">
                  <span className="material-symbols-outlined text-[#1f43af]">{card.icon}</span>
                </div>
                <h3 className="text-lg font-black text-[#26344e]">{card.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#5f6f89]">{card.text}</p>
                <p className="mt-3 text-xs font-semibold text-[#51617d]">{card.stage}</p>
                <p className="mt-1 text-xs font-semibold text-[#51617d]">{card.issue}</p>
              </a>
            ))}
          </div>
        </section>

        <section className="landing-block">
          <h2 className="mb-4 text-2xl font-black sm:text-3xl">常见问题</h2>
          <div className="space-y-3">
            {[
              "适合哪些家庭阶段？我们目前关注孩子出生到上大学阶段的教育议题。",
              "为什么不同阶段内容分布不均？节目选题受嘉宾档期与议题时效影响，会动态调整。",
              "如何开始使用？建议先从案例矩阵按标签筛选，再进入节目详情做针对性复盘。",
            ].map((text, index) => (
              <article key={text} className="panel fade-up rounded-2xl p-5" style={{ animationDelay: `${120 + index * 55}ms` }}>
                <p className="text-sm leading-7 text-[#566783]">{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="mt-16 border-t border-[#d9e1ef] bg-[#f8fafc] py-7">
        <div className="landing-shell flex flex-col items-center justify-between gap-4 md:flex-row">
          <img alt="家和万事 服务家庭 智慧决策" className="h-[30px] w-auto object-contain" src="/assets/jiahe-logo.png" />
          <div className="flex flex-wrap items-center justify-center gap-5 text-xs font-bold text-[#61728d]">
            <a className="hover:text-[#1f43af]" href="#">关于我们</a>
            <a className="hover:text-[#1f43af]" href="#">合作联系</a>
            <a className="hover:text-[#1f43af]" href="#">隐私政策</a>
            <a className="hover:text-[#1f43af]" href="/programs">节目入口</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
