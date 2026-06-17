import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PublicGuest } from "../services/api";
import { resolveGuestAvatar } from "../utils/guestAvatar";

const HOMEPAGE_XIAOWANZI_ENTRY_HREFS = new Set(["/index-xiaowanzi.html"]);
const XIAOWANZI_DESKTOP_FULLSCREEN_BREAKPOINT = 769;
const HOMEPAGE_MOBILE_BREAKPOINT = 768;
const heoSectionOrder = [
  { label: "内容", href: "/programs/list", anchor: "primary-entry" },
  { label: "阅读", href: "/reading", anchor: "site-entry-list" },
  { label: "资料", href: "/materials", anchor: "site-entry-list" },
  { label: "规划", href: "/planning", anchor: "site-entry-list" },
  { label: "决策", href: "/topics", anchor: "site-entry-list" },
] as const;
type HeoSectionNavItem = (typeof heoSectionOrder)[number];

function toText(value: unknown): string {
  return String(value || "").trim();
}

function isHomepageXiaowanziEntry(href: string): boolean {
  return HOMEPAGE_XIAOWANZI_ENTRY_HREFS.has(href);
}

type EntryTone = "deep" | "mint" | "lemon" | "sky" | "pink" | "lavender";

type SiteEntryItem = {
  title: string;
  desc: string;
  href: string;
  action: string;
  badge: string;
  meta: string;
  tone: EntryTone;
};

type SiteEntryGroup = {
  title: string;
  subtitle: string;
  items: SiteEntryItem[];
};

type TopicDirectoryRecord = {
  slug?: string;
  title?: string;
  subtitle?: string;
  shortSummary?: string;
  tags?: string[] | string;
  questionCount?: number;
  nodeCount?: number;
};

type WorthBuyDirectoryRecord = {
  brand?: string;
  query?: string;
  status?: string;
  result?: {
    brand?: string;
    title?: string;
    reason?: string;
    summary?: string;
    verdict?: string;
    recommendation?: string;
    buyAdvice?: string;
    score?: number;
  };
};

const HOMEPAGE_DIRECTORY_PREVIEW_LIMIT = 12;
const HOMEPAGE_MOBILE_DIRECTORY_CARD_LIMIT = 6;

function clampEntryText(value: unknown, fallback: string, max = 34): string {
  const text = toText(value) || fallback;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parseEntryTags(raw: TopicDirectoryRecord["tags"]): string[] {
  if (Array.isArray(raw)) return raw.map(toText).filter(Boolean);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(toText).filter(Boolean) : [];
  } catch {
    return toText(raw).split(/[,\s，、]+/).map(toText).filter(Boolean);
  }
}

function buildTopicDirectoryItems(records: TopicDirectoryRecord[]): SiteEntryItem[] {
  return records
    .map((topic, index): SiteEntryItem | null => {
      const title = clampEntryText(topic.title, "", 18);
      const slug = toText(topic.slug);
      if (!title || !slug) return null;
      const tags = parseEntryTags(topic.tags);
      const count = Number(topic.questionCount || topic.nodeCount || 0);
      return {
        title,
        desc: clampEntryText(topic.shortSummary || topic.subtitle, "从真实问题进入回答与知识树", 42),
        href: `/topics/${encodeURIComponent(slug)}`,
        action: "查看",
        badge: tags[0] || "问题",
        meta: count > 0 ? `${count} 条线索` : "知识树",
        tone: (["sky", "mint", "lavender"] as EntryTone[])[index % 3],
      };
    })
    .filter((item): item is SiteEntryItem => Boolean(item))
    .slice(0, HOMEPAGE_DIRECTORY_PREVIEW_LIMIT);
}

function resolveWorthBuyTitle(item: WorthBuyDirectoryRecord): string {
  return toText(item.result?.brand) || toText(item.result?.title) || toText(item.brand) || toText(item.query);
}

function resolveWorthBuyDesc(item: WorthBuyDirectoryRecord): string {
  return (
    toText(item.result?.recommendation) ||
    toText(item.result?.buyAdvice) ||
    toText(item.result?.reason) ||
    toText(item.result?.summary) ||
    toText(item.result?.verdict) ||
    "从真实使用场景看产品、服务与购买判断"
  );
}

function buildWorthBuyDirectoryItems(records: WorthBuyDirectoryRecord[]): SiteEntryItem[] {
  return records
    .map((item, index): SiteEntryItem | null => {
      const query = toText(item.query) || toText(item.brand) || resolveWorthBuyTitle(item);
      const title = clampEntryText(resolveWorthBuyTitle(item), "", 18);
      if (!title || !query) return null;
      const score = Number(item.result?.score);
      return {
        title,
        desc: clampEntryText(resolveWorthBuyDesc(item), "从真实使用场景看产品、服务与购买判断", 42),
        href: `/worthbuy/${encodeURIComponent(query)}`,
        action: "查看",
        badge: Number.isFinite(score) ? `${score}分` : "分析",
        meta: item.status === "published" ? "公开" : "知物",
        tone: (["lemon", "pink", "sky"] as EntryTone[])[index % 3],
      };
    })
    .filter((item): item is SiteEntryItem => Boolean(item))
    .slice(0, HOMEPAGE_DIRECTORY_PREVIEW_LIMIT);
}

const fallbackTopicDirectoryItems: SiteEntryItem[] = [
  {
    title: "告别拖延症",
    desc: "把孩子无法启动的问题拆成执行功能、家庭节奏与今日行动",
    href: "/topics",
    action: "提问",
    badge: "执行力",
    meta: "12 条线索",
    tone: "sky",
  },
  {
    title: "儿童蛀牙防治",
    desc: "从口腔习惯、饮食频次和家庭执行看一口好牙怎么养成",
    href: "/topics",
    action: "提问",
    badge: "健康",
    meta: "8 条线索",
    tone: "mint",
  },
  {
    title: "隔代教养沟通",
    desc: "老人发脾气时先建立沟通机制，而不是只做对错裁判",
    href: "/topics",
    action: "提问",
    badge: "沟通",
    meta: "15 条线索",
    tone: "lavender",
  },
  {
    title: "孩子注意力不集中",
    desc: "区分生理性分心与环境干扰，从执行功能角度寻找可操作策略",
    href: "/topics",
    action: "提问",
    badge: "学习力",
    meta: "10 条线索",
    tone: "deep",
  },
  {
    title: "青春期沟通困境",
    desc: "当孩子关上房门，家长如何找到新的对话入口",
    href: "/topics",
    action: "提问",
    badge: "青春期",
    meta: "9 条线索",
    tone: "pink",
  },
  {
    title: "幼小衔接准备",
    desc: "不只看知识储备，更要关注习惯、情绪与社会适应能力",
    href: "/topics",
    action: "提问",
    badge: "入学",
    meta: "14 条线索",
    tone: "lemon",
  },
  {
    title: "写作业总磨蹭",
    desc: "从任务拆分、启动提示和奖励反馈重建每天的作业节奏",
    href: "/topics",
    action: "提问",
    badge: "作业",
    meta: "11 条线索",
    tone: "sky",
  },
  {
    title: "孩子沉迷短视频",
    desc: "先处理替代活动和家庭规则，而不是只靠反复训斥",
    href: "/topics",
    action: "提问",
    badge: "屏幕",
    meta: "13 条线索",
    tone: "mint",
  },
  {
    title: "兄弟姐妹总冲突",
    desc: "拆开争抢、偏爱感和家庭边界，重新安排相处结构",
    href: "/topics",
    action: "提问",
    badge: "关系",
    meta: "9 条线索",
    tone: "lavender",
  },
  {
    title: "孩子不愿去幼儿园",
    desc: "从分离焦虑、同伴关系和晨间节奏判断问题卡点",
    href: "/topics",
    action: "提问",
    badge: "适应",
    meta: "10 条线索",
    tone: "deep",
  },
  {
    title: "英语启蒙怎么开始",
    desc: "把资源选择、输入频率和家庭陪伴成本放在一起看",
    href: "/topics",
    action: "提问",
    badge: "启蒙",
    meta: "12 条线索",
    tone: "pink",
  },
  {
    title: "孩子总是顶嘴",
    desc: "先区分情绪爆发和边界试探，再决定回应方式",
    href: "/topics",
    action: "提问",
    badge: "边界",
    meta: "8 条线索",
    tone: "lemon",
  },
];

const fallbackWorthBuyDirectoryItems: SiteEntryItem[] = [
  {
    title: "小猿学练机",
    desc: "把教育硬件的卖点放回孩子作业、反馈和长期使用场景里判断",
    href: "/worthbuy",
    action: "分析",
    badge: "硬件",
    meta: "知物",
    tone: "lemon",
  },
  {
    title: "小天才电话手表",
    desc: "从安全、社交和家庭管理边界判断儿童智能设备是否适合",
    href: "/worthbuy",
    action: "分析",
    badge: "设备",
    meta: "消费参考",
    tone: "pink",
  },
  {
    title: "斑马AI课年卡",
    desc: "把启蒙课程的持续使用、孩子兴趣和家庭陪伴成本一起看",
    href: "/worthbuy",
    action: "分析",
    badge: "课程",
    meta: "知物分析",
    tone: "sky",
  },
  {
    title: "作业帮学习笔",
    desc: "扫描查词功能是否真的帮到学习，还是养成了依赖习惯",
    href: "/worthbuy",
    action: "分析",
    badge: "工具",
    meta: "知物",
    tone: "mint",
  },
  {
    title: "网易有道词典笔",
    desc: "对比同类学习笔，从查词精度、内容生态和使用频次进行判断",
    href: "/worthbuy",
    action: "分析",
    badge: "对比",
    meta: "消费参考",
    tone: "lavender",
  },
  {
    title: "儿童安全座椅选购",
    desc: "从碰撞测试、安装便利性和孩子年龄段匹配度来做决策",
    href: "/worthbuy",
    action: "分析",
    badge: "安全",
    meta: "知物分析",
    tone: "deep",
  },
  {
    title: "贝亲宽口径奶瓶",
    desc: "从奶嘴适配、清洗便利性和长期替换成本判断是否值得买",
    href: "/worthbuy",
    action: "分析",
    badge: "喂养",
    meta: "消费参考",
    tone: "lemon",
  },
  {
    title: "科大讯飞学习机",
    desc: "把课程生态、题库质量和家长陪跑成本放回真实使用场景",
    href: "/worthbuy",
    action: "分析",
    badge: "学习机",
    meta: "知物",
    tone: "pink",
  },
  {
    title: "步步高词典笔",
    desc: "对比扫描识别速度、释义质量和孩子独立使用体验",
    href: "/worthbuy",
    action: "分析",
    badge: "词典笔",
    meta: "消费参考",
    tone: "sky",
  },
  {
    title: "babygo儿童推车",
    desc: "把重量、折叠便利性和日常通勤场景放在一起判断",
    href: "/worthbuy",
    action: "分析",
    badge: "出行",
    meta: "知物分析",
    tone: "mint",
  },
  {
    title: "德国宝得适安全座椅",
    desc: "从安装稳定性、年龄覆盖段和车内空间占用做横向比较",
    href: "/worthbuy",
    action: "分析",
    badge: "对比",
    meta: "知物",
    tone: "lavender",
  },
  {
    title: "儿童电动牙刷",
    desc: "不只看清洁力，也看噪音、刷头成本和孩子接受度",
    href: "/worthbuy",
    action: "分析",
    badge: "健康",
    meta: "消费参考",
    tone: "deep",
  },
];

function resolveTopicEmoji(title: string, badge: string): string {
  const map: Record<string, string> = {
    "拖延": "⏰", "注意力": "🎯", "青春期": "🧑‍🎓", "蛀牙": "🦷",
    "隔代": "👴", "衔接": "🎒", "沟通": "💬", "学习": "📖",
    "健康": "❤️", "情绪": "🌈", "执行力": "⚡", "入学": "🏫",
  };
  for (const [key, emoji] of Object.entries(map)) {
    if (title.includes(key) || badge.includes(key)) return emoji;
  }
  // 按 badge 二级匹配
  const badgeMap: Record<string, string> = {
    "沟通": "💬", "学习力": "📖", "执行力": "⚡", "青春期": "🧑‍🎓",
  };
  if (badgeMap[badge]) return badgeMap[badge];
  return "💡";
}

function resolveWorthBuyEmoji(title: string, badge: string): string {
  const map: Record<string, string> = {
    "手表": "⌚", "学练机": "📱", "学习机": "🖥️", "学习笔": "🖊️",
    "词典笔": "🖊️", "AI课": "📚", "安全座椅": "🚗", "奶瓶": "🍼",
    "课程": "📚", "硬件": "📱", "设备": "⌚", "安全": "🛡️",
    "对比": "⚖️", "复读机": "🎧", "吸尘器": "🧹",
  };
  for (const [key, emoji] of Object.entries(map)) {
    if (title.includes(key) || badge.includes(key)) return emoji;
  }
  return "📦";
}

const LandingPage: React.FC = () => {
  const productRailRef = useRef<HTMLDivElement | null>(null);
  const [guests, setGuests] = useState<PublicGuest[]>([]);
  const [topicDirectoryItems, setTopicDirectoryItems] = useState<SiteEntryItem[]>([]);
  const [worthBuyDirectoryItems, setWorthBuyDirectoryItems] = useState<SiteEntryItem[]>([]);
  const [activeCatalogIndex, setActiveCatalogIndex] = useState(-1);
  const [failedGuestAvatars, setFailedGuestAvatars] = useState<Record<string, boolean>>({});
  const [isMobileHomepage, setIsMobileHomepage] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${HOMEPAGE_MOBILE_BREAKPOINT}px)`);
    const sync = () => {
      setIsMobileHomepage(mediaQuery.matches);
    };
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => {
      mediaQuery.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    fetch("/api/guests?page=1&pageSize=120")
      .then((res) => (res.ok ? res.json() : { guests: [] }))
      .then((data) => {
        if (disposed) return;
        const list = Array.isArray(data) ? data : Array.isArray(data?.guests) ? data.guests : [];
        setGuests(list.filter((guest: PublicGuest) => toText(guest?.name)).slice(0, 120));
      })
      .catch(() => {
        if (!disposed) setGuests([]);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const loadJson = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) return {};
      return res.json().catch(() => ({}));
    };

    Promise.allSettled([
      loadJson(`/api/topic-hub?limit=${HOMEPAGE_DIRECTORY_PREVIEW_LIMIT}`),
      loadJson(`/api/worthbuy/list?limit=${HOMEPAGE_DIRECTORY_PREVIEW_LIMIT}`),
    ]).then(([topicResult, worthBuyResult]) => {
      if (disposed) return;
      const topicData = topicResult.status === "fulfilled" ? topicResult.value : {};
      const worthBuyData = worthBuyResult.status === "fulfilled" ? worthBuyResult.value : {};
      const topics = Array.isArray(topicData?.topics) ? topicData.topics : [];
      const worthBuyItems = Array.isArray(worthBuyData?.items) ? worthBuyData.items : [];
      setTopicDirectoryItems(buildTopicDirectoryItems(topics));
      setWorthBuyDirectoryItems(buildWorthBuyDirectoryItems(worthBuyItems));
    });

    return () => {
      disposed = true;
    };
  }, []);

  const hostDuo = useMemo(() => {
    if (guests.length === 0) return [];
    const jessie = guests.find((g) => {
      const n = toText(g.name).toLowerCase();
      return n === 'jessie' || n.includes('jessie');
    });
    const ali = guests.find((g) => {
      const n = toText(g.name);
      return n === '阿力' || n === 'ali';
    });
    return [jessie, ali].filter(Boolean) as PublicGuest[];
  }, [guests]);

  const guestMarqueeItems = useMemo(() => {
    if (guests.length === 0) return [];
    return [...guests, ...guests];
  }, [guests]);

  const homepageDirectoryCardLimit = isMobileHomepage
    ? HOMEPAGE_MOBILE_DIRECTORY_CARD_LIMIT
    : HOMEPAGE_DIRECTORY_PREVIEW_LIMIT;
  const homepageTopicCards = (topicDirectoryItems.length > 0 ? topicDirectoryItems : fallbackTopicDirectoryItems).slice(
    0,
    homepageDirectoryCardLimit,
  );
  const homepageWorthBuyCards = (worthBuyDirectoryItems.length > 0 ? worthBuyDirectoryItems : fallbackWorthBuyDirectoryItems).slice(
    0,
    homepageDirectoryCardLimit,
  );

  const handleHomepageEntryClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string, afterClick?: () => void) => {
    if (isHomepageXiaowanziEntry(href) && window.innerWidth >= XIAOWANZI_DESKTOP_FULLSCREEN_BREAKPOINT) {
      event.preventDefault();
      document.dispatchEvent(
        new CustomEvent("xf-open-xiaowanzi", {
          detail: { source: "landing-page", mode: "chat", maximized: true },
        })
      );
    }
    afterClick?.();
  };

  const openXiaowanziHome = () => {
    document.dispatchEvent(
      new CustomEvent("xf-open-xiaowanzi", {
        detail: { source: "landing-topbar", mode: "home" },
      })
    );
  };

  const openHomepageLoginModal = () => {
    document.dispatchEvent(
      new CustomEvent("xf-show-login-modal", {
        detail: {
          title: "登录后继续浏览",
          description: "登录后可解锁完整内容、同步孩子档案，并使用小玩子获得个性化建议。",
        },
      })
    );
  };

  const scrollProductRail = (direction: "prev" | "next") => {
    const rail = productRailRef.current;
    if (!rail) return;
    const card = rail.querySelector<HTMLElement>(".heo-product-card");
    const step = card ? card.offsetWidth + 28 : rail.clientWidth * 0.86;
    rail.scrollBy({ left: direction === "next" ? step : -step, behavior: "smooth" });
  };

  const handleNavCategoryClick = (index: number, targetId: string) => {
    setActiveCatalogIndex(index);
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const featureCards = [
    {
      title: "内容",
      headline: "从真实节目，进入问题现场。",
      learnMore: "进一步了解 内容",
      visual: "program",
      status: "推荐",
      action: "进入节目",
      tone: "deep",
      featured: true,
      text: "汇总已发布节目，支持按标题、摘要、标签和内容类型快速定位，适合从真实教育对话进入问题现场。",
      href: "/programs/list",
    },
    {
      title: "阅读",
      headline: "从一份书单，继续理解。",
      learnMore: "进一步了解 阅读",
      visual: "reading",
      status: "推荐",
      action: "继续阅读",
      tone: "mint",
      featured: false,
      text: "基于节目实践沉淀的书籍清单。可先按推荐人聚合浏览，再结合年级和关键词快速筛选。",
      href: "/reading",
    },
    {
      title: "资料",
      headline: "把资料拿走，也把方法用上。",
      learnMore: "进一步了解 资料",
      visual: "materials",
      status: "热门",
      action: "获取资料",
      tone: "lemon",
      featured: false,
      text: "整理可直接打开使用的学习资料。先按阶段和年级缩小范围，再按学科和资料类型精筛。",
      href: "/materials",
    },
    {
      title: "智库",
      headline: "和嘉宾一起，把问题问深。",
      learnMore: "进一步了解 智库",
      visual: "experts",
      status: "推荐",
      action: "看嘉宾",
      tone: "pink",
      featured: false,
      text: "从节目延伸到人物，汇总嘉宾背景、著作、公开参考链接与拓展内容，帮助判断方法是否适合当前问题。",
      href: "/experts",
    },
    {
      title: "规划",
      headline: "把长期目标，拆成下一步。",
      learnMore: "进一步了解 规划",
      visual: "planning",
      status: "规划",
      action: "开始规划",
      tone: "mint",
      featured: false,
      text: "把长期目标放进阶段路径里，围绕升学、能力建设和家庭节奏做更清晰的规划。",
      href: "/planning",
    },
    {
      title: "AI",
      headline: "让小玩子，陪你读页面。",
      learnMore: "进一步了解 小玩子",
      visual: "assistant",
      status: "智能",
      action: "打开助理",
      tone: "sky",
      featured: false,
      text: "在站内内容旁边随时提问，让AI帮你读页面、找线索、整理下一步。",
      href: "/index-xiaowanzi.html",
    },
  ];

  const specialActionCards = [
    {
      title: "请教一下",
      eyebrow: "持续开放",
      headline: "把一个真实困惑，拆成能继续追问的线索",
      text: "提交家庭教育现场里的具体问题，查看站内问题、回答与智能生成的知识树。",
      product: "问题共创",
      productText: "真实提问、回答与知识树入口",
      action: "去提问",
      href: "/topics",
      tone: "ask",
    },
    {
      title: "知物",
      eyebrow: "持续更新",
      headline: "把选择放回场景里，再做判断",
      text: "围绕教育与家庭场景整理品牌、产品和服务分析，让购买和选择多一层参考。",
      product: "知物分析",
      productText: "品牌、产品与服务参考",
      action: "查看分析",
      href: "/worthbuy",
      tone: "worth",
    },
  ];

  const cardColors: Record<string, { accent: string }> = {
    program: { accent: "#2f6df6" },
    reading: { accent: "#10a37f" },
    materials: { accent: "#e88a00" },
    experts: { accent: "#db2777" },
    planning: { accent: "#0f766e" },
    assistant: { accent: "#5F19EC" },
  };

  const navItems = heoSectionOrder.map((item, index) => ({ ...item, index }));

  return (
    <div className="landing-root">
      <style>{`
        .landing-root {
          --lp-bg: #f5f5f7;
          --lp-panel: rgba(255, 255, 255, 0.72);
          --lp-panel-soft: rgba(255, 255, 255, 0.6);
          --lp-panel-border: rgba(0, 0, 0, 0.06);
          --lp-text: #080a12;
          --lp-muted: rgba(8, 10, 18, 0.48);
          --lp-primary: #5F19EC;
          --lp-primary-ink: #6d28d9;
          --lp-pink: #fdf2f8;
          --lp-mint: #f0fdf4;
          --lp-lemon: #fefce8;
          --lp-sky: #f0f9ff;
          --lp-lavender: #faf5ff;
          --lp-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
          --lp-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 2px 4px -2px rgba(0, 0, 0, 0.04);
          min-height: 100vh;
          color: var(--lp-text);
          background: #f5f5f7;
          overflow-x: hidden;
        }
        .landing-shell {
          width: min(1400px, calc(100% - 48px));
          margin: 0 auto;
        }
        .landing-block {
          margin-top: clamp(42px, 6vw, 82px);
        }
        .landing-panel {
          background: var(--lp-panel);
          border: 1px solid var(--lp-panel-border);
          box-shadow: var(--lp-shadow);
        }
        .heo-topbar {
          position: fixed;
          top: 14px;
          left: 0;
          right: 0;
          z-index: 70;
          pointer-events: none;
        }
        .heo-topbar-inner {
          position: relative;
          width: fit-content;
          max-width: calc(100% - 28px);
          margin: 0 auto;
          min-height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(229, 231, 235, 0.5);
          border-radius: 999px;
          padding: 8px 14px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          pointer-events: auto;
        }
        .heo-nav-brand {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border: 0;
          background: transparent;
          padding: 0;
          cursor: pointer;
          transition: transform 0.18s ease;
        }
        .heo-nav-brand:hover {
          transform: translateY(-1px) scale(1.04);
        }
        .heo-nav-avatar {
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 999px;
          background:
            radial-gradient(circle at 50% 18%, rgba(255, 241, 143, 0.98), transparent 30%),
            linear-gradient(135deg, #fbf6d7, #f3e8ff 58%, #ffffff);
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.46),
            0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .heo-nav-avatar img {
          display: block;
          width: 34px;
          height: 34px;
          object-fit: contain;
        }
        .heo-nav-links {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border-radius: 999px;
          padding: 0;
          background: transparent;
        }
        .heo-nav-link,
        .heo-login-link {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-size: 16px;
        }
        .heo-nav-link {
          position: relative;
          z-index: 1;
          border: 0;
          padding: 8px 14px;
          background: transparent;
          color: rgba(0, 0, 0, 0.64);
          font-size: 16px;
          font-weight: 400;
          cursor: pointer;
          font-family: inherit;
          border-radius: 9999px;
          transition: background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .heo-nav-link:hover,
        .heo-nav-link.is-active {
          z-index: 2;
          background: rgba(124, 58, 237, 0.1);
          color: var(--lp-text);
          transform: scale(1.08);
        }
        .heo-nav-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .heo-login-link {
          padding: 0 18px;
          border: 0;
          background: var(--lp-primary);
          color: #fff;
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
          box-shadow: none;
        }
        .heo-login-link:hover {
          transform: translateY(-1px);
        }
        .fade-up {
          opacity: 0;
          transform: translateY(16px);
          animation: fadeUp 0.55s ease forwards;
        }
        .heo-main {
          padding-top: 0;
          padding-bottom: 80px;
        }
        .heo-first-screen {
          --lp-text: #080a12;
          --lp-muted: rgba(8, 10, 18, 0.52);
          position: relative;
          overflow: hidden;
          margin-inline: calc(50% - 50vw);
          padding-inline: calc(50vw - 50%);
          padding-bottom: clamp(88px, 9vw, 148px);
          background: linear-gradient(180deg, #faf5ff 0%, #f5f5f7 30%, #f5f5f7 100%);
          background-size: auto;
          background-repeat: no-repeat;
        }
        .heo-first-screen::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(5, 18, 38, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(5, 18, 38, 0.02) 1px, transparent 1px);
          background-size: 72px 72px;
          pointer-events: none;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, #000 20%, transparent 60%);
          -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, #000 20%, transparent 60%);
        }
        .heo-first-screen::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1px;
          height: 80px;
          background: linear-gradient(180deg, transparent, #f5f5f7 74%);
          pointer-events: none;
        }
        .heo-hero {
          display: block;
          min-height: auto;
          padding-top: clamp(104px, 10vw, 146px);
          padding-bottom: clamp(52px, 6vw, 96px);
          color: #080a12;
          transform: scale(1.14);
          transform-origin: center center;
        }
        .heo-hero-stage {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: clamp(14px, 2vw, 22px);
          overflow: hidden;
          padding: clamp(22px, 3.6vw, 44px);
          background: transparent;
          border: none;
          box-shadow: none;
        }
        .heo-hero-copy {
          position: relative;
          z-index: 1;
          max-width: 960px;
          margin: 0 auto;
          text-align: center;
        }
        .heo-hero-copy::after {
          content: "";
          position: absolute;
          inset: -80px auto auto 50%;
          width: 420px;
          height: 420px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(95, 25, 236, 0.08), transparent 68%);
          transform: translateX(-50%);
          pointer-events: none;
        }
        .heo-hero-wordmark {
          position: absolute;
          z-index: 0;
          left: 50%;
          top: 0px;
          width: min(1300px, 96%);
          transform: translateX(-50%);
          color: rgba(8, 10, 18, 0.025);
          font-size: clamp(48px, 9vw, 130px);
          line-height: 0.78;
          font-weight: 1000;
          letter-spacing: -0.04em;
          text-align: center;
          text-transform: uppercase;
          pointer-events: none;
          user-select: none;
        }
        .heo-kicker {
          display: inline-flex;
          width: fit-content;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 8px 14px;
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(8, 10, 18, 0.1);
          color: rgba(8, 10, 18, 0.54);
          font-size: 11px;
          font-weight: 750;
          letter-spacing: 0.06em;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
        .heo-title {
          max-width: 960px;
          margin: 12px auto 14px;
          font-size: clamp(60px, 8vw, 150px);
          line-height: 0.78;
          letter-spacing: -0.095em;
          font-weight: 950;
          color: #080a12;
        }
        .heo-title span {
          display: block;
        }
        .heo-title-logo {
          display: block;
          width: 100%;
          max-width: 480px;
          height: auto;
          margin: 0 auto;
        }

        .heo-lead {
          max-width: 620px;
          margin: 0 auto;
          color: rgba(8, 10, 18, 0.56);
          font-size: clamp(16px, 1.8vw, 19px);
          line-height: 1.8;
          font-weight: 500;
        }
        .heo-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 14px;
          margin-top: 28px;
        }
        .heo-button {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          padding: 0 22px;
          background: #fff;
          color: var(--lp-primary-ink);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .heo-button:hover {
          transform: translateY(-1px);
          border-color: rgba(95, 25, 236, 0.3);
          background: #faf5ff;
          box-shadow: 0 4px 16px rgba(95, 25, 236, 0.12);
        }
        .heo-button.primary {
          border-color: transparent;
          background: var(--lp-primary);
          color: #fff;
          box-shadow: 0 2px 12px rgba(95, 25, 236, 0.3);
        }
        .heo-button.primary:hover {
          box-shadow: 0 4px 20px rgba(95, 25, 236, 0.4);
        }
        .heo-manifesto-section {
          margin-top: 14px;
        }
        .heo-manifesto-card {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #fff;
          padding: clamp(24px, 3vw, 36px) clamp(22px, 2.5vw, 36px);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 20px rgba(0, 0, 0, 0.06);
        }
        .heo-manifesto-card p {
          margin: 0;
          color: var(--lp-text);
          font-size: clamp(17px, 2vw, 24px);
          line-height: 1.55;
          font-weight: 600;
          letter-spacing: -0.01em;
          text-align: center;
          max-width: 620px;
        }
        .heo-manifesto-card p em {
          color: var(--lp-primary);
          font-style: normal;
          font-weight: 800;
        }
        .heo-manifesto-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          border-radius: 16px;
          background: #faf5ff;
          padding: 12px 20px;
        }
        .heo-manifesto-profile b {
          color: var(--lp-text);
          font-size: 16px;
          font-weight: 800;
          white-space: nowrap;
        }
        .heo-manifesto-profile span {
          color: var(--lp-muted);
          font-size: 13px;
          line-height: 1.45;
          font-weight: 600;
          white-space: nowrap;
        }
        .heo-manifesto-profile img {
          width: 48px;
          height: 32px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .heo-duo-section {
          margin-top: clamp(40px, 6vw, 92px);
          max-width: 640px;
          margin-inline: auto;
          padding-inline: clamp(16px, 2vw, 24px);
          padding-bottom: clamp(6px, 1vw, 12px);
        }
        .heo-duo-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          background: transparent;
          padding: 0;
        }
        .heo-duo-avatars {
          display: flex;
          align-items: center;
        }
        .heo-duo-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
          flex-shrink: 0;
        }
        .heo-duo-avatar + .heo-duo-avatar {
          margin-left: -14px;
        }
        .heo-duo-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .heo-duo-quote {
          margin: 0;
          color: var(--lp-text);
          font-size: clamp(18px, 1.9vw, 26px);
          line-height: 1.4;
          font-weight: 700;
          letter-spacing: -0.01em;
          text-align: center;
        }
        .heo-duo-names {
          color: var(--lp-muted);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .heo-banner {
          margin-top: clamp(28px, 4vw, 52px);
        }
        .heo-banner-card {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(24px, 3vw, 48px);
          align-items: center;
          border-radius: 24px;
          background: linear-gradient(145deg, #5F19EC 0%, #4c14c4 50%, #3a0f96 100%);
          padding: clamp(32px, 4vw, 56px) clamp(28px, 3vw, 48px);
          overflow: hidden;
        }
        .heo-banner-copy {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .heo-banner-copy small {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          padding: 5px 14px;
          background: rgba(255, 255, 255, 0.15);
          color: #fbbf24;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .heo-banner-copy b {
          color: #fff;
          font-size: clamp(24px, 3vw, 36px);
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .heo-banner-copy p {
          margin: 0;
          color: rgba(255, 255, 255, 0.6);
          font-size: clamp(14px, 1.5vw, 16px);
          line-height: 1.7;
        }
        .heo-banner-mockup {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
        }
        .heo-banner-mockup-top {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .heo-banner-mockup-top .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.4);
        }
        .heo-banner-mockup-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .heo-banner-mockup-head {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .heo-banner-mockup-head .circle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.15);
          flex-shrink: 0;
        }
        .heo-banner-mockup .line {
          height: 6px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.15);
        }
        .heo-banner-mockup .line.s { width: 60px; }
        .heo-banner-mockup .line.m { width: 100px; margin-top: 6px; }
        .heo-banner-mockup .line.xs { width: 70%; margin-top: 6px; }
        .heo-banner-mockup-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .heo-banner-mockup-item {
          border-radius: 10px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.06);
        }
        .heo-banner-mockup-item .block {
          height: 38px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.1);
          margin-bottom: 8px;
        }
        .guest-marquee-section {
          margin-top: clamp(92px, 10vw, 164px);
          overflow: hidden;
          padding: 0;
          background: none;
          border: none;
          box-shadow: none;
        }
        .guest-marquee-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 0 24px;
        }
        .guest-marquee-head b {
          display: block;
          color: var(--lp-text);
          font-size: clamp(22px, 3vw, 34px);
          line-height: 1.1;
          font-weight: 1000;
        }
        .guest-marquee-head span {
          color: var(--lp-muted);
          font-size: 13px;
          font-weight: 850;
        }
        .guest-marquee-head a {
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 8px 16px;
          background: var(--lp-primary);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
        }
        .guest-marquee-window {
          overflow: hidden;
          mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
        }
        .guest-marquee-track {
          display: flex;
          width: max-content;
          gap: 6px;
          padding: 4px 0;
          animation: guestMarquee 140s linear infinite;
        }
        .guest-marquee-window:hover .guest-marquee-track {
          animation-play-state: paused;
        }
        .guest-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.04);
          background: rgba(255, 255, 255, 0.72);
          color: var(--lp-text);
          padding: 6px 16px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s;
        }
        .guest-pill:hover {
          border-color: rgba(95, 25, 236, 0.3);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 2px 8px rgba(95, 25, 236, 0.1);
        }
        .guest-pill-avatar {
          width: 24px;
          height: 24px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
        }
        .guest-pill-avatar img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }
        .guest-pill-avatar img.is-fallback-avatar {
          object-fit: contain;
          padding: 2px;
          background: rgba(255, 255, 255, 0.9);
        }
        .guest-pill-name {
          max-width: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .heo-section {
          margin-top: clamp(40px, 5vw, 80px);
          scroll-margin-top: 100px;
        }
        .heo-section-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 16px;
        }
        .heo-section-head h2 {
          margin: 0;
          color: var(--lp-text);
          font-size: clamp(28px, 3vw, 36px);
          line-height: 1.15;
          font-weight: 700;
        }
        .heo-section-head p {
          max-width: 430px;
          margin: 0;
          color: var(--lp-muted);
          line-height: 1.7;
          font-weight: 500;
        }
        .heo-section-kicker {
          display: block;
          margin-top: 10px;
          color: #1499e8;
          font-size: clamp(20px, 2vw, 28px);
          line-height: 1.1;
          font-weight: 900;
        }
        #primary-entry .heo-section-head {
          align-items: flex-start;
          margin-bottom: 0;
        }
        #primary-entry .heo-section-head h2 {
          max-width: 820px;
          font-size: clamp(38px, 4.8vw, 58px);
          line-height: 1.08;
          font-weight: 950;
          letter-spacing: -0.045em;
        }
        .heo-product-list {
          display: flex;
          gap: 28px;
          margin-inline: calc((min(1160px, calc(100vw - 28px)) - 100vw) / 2);
          overflow-x: auto;
          overscroll-behavior-x: contain;
          padding: 42px 0 22px;
          scroll-padding-inline: max(14px, calc((100vw - 1160px) / 2));
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
        }
        .heo-product-list::-webkit-scrollbar {
          display: none;
        }
        .heo-product-card {
          --card-bg: #ffffff;
          --card-fg: #080a12;
          --card-muted: rgba(8, 10, 18, 0.5);
          --card-chip: rgba(95, 25, 236, 0.08);
          --card-accent: var(--lp-primary);
          position: relative;
          display: flex;
          flex: 0 0 min(340px, calc(100vw - 56px));
          min-height: 420px;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          border-radius: 20px;
          background: var(--card-bg);
          color: var(--card-fg);
          padding: clamp(20px, 2.5vw, 28px);
          margin-inline: 10px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 20px rgba(0, 0, 0, 0.06);
          scroll-snap-align: start;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          text-decoration: none;
        }
        .heo-product-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06), 0 10px 30px rgba(0, 0, 0, 0.08);
        }
        .tone-deep {
          --card-accent: #2563eb;
        }
        .tone-mint {
          --card-accent: #059669;
        }
        .tone-lemon {
          --card-accent: #d97706;
        }
        .tone-sky {
          --card-accent: #0891b2;
        }
        .tone-pink {
          --card-accent: #db2777;
        }
        .tone-lavender {
          --card-accent: #5F19EC;
        }
        .heo-product-copy {
          position: relative;
          z-index: 2;
          min-width: 0;
          display: grid;
          gap: 14px;
          max-width: 430px;
        }
        .heo-product-title-line {
          display: flex;
          align-items: flex-start;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
        }
        .heo-product-title-line b {
          min-width: 0;
          font-size: clamp(28px, 2.8vw, 38px);
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .heo-product-text {
          max-width: 360px;
          color: var(--card-muted);
          font-size: 15px;
          line-height: 1.75;
          font-weight: 780;
        }
        .heo-badge {
          display: inline-flex;
          border-radius: 999px;
          padding: 5px 10px;
          background: rgba(95, 25, 236, 0.08);
          border: 1px solid rgba(95, 25, 236, 0.12);
          color: var(--lp-primary);
          font-size: 11px;
          font-weight: 700;
        }
        .heo-product-status {
          flex: 0 0 auto;
          display: inline-flex;
          border-radius: 999px;
          padding: 6px 12px;
          background: color-mix(in srgb, var(--card-accent) 12%, rgba(255,255,255,0.8));
          color: var(--card-accent);
          font-size: 12px;
          font-weight: 700;
          backdrop-filter: blur(10px);
        }
        .heo-product-action {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 999px;
          background: var(--lp-primary);
          color: #fff;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(95, 25, 236, 0.25);
        }
        .heo-carousel-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 10px;
        }
        .heo-carousel-button {
          position: relative;
          width: 40px;
          height: 40px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
        }
        .heo-carousel-button:hover {
          transform: translateY(-1px);
          border-color: rgba(95, 25, 236, 0.3);
          background: rgba(255, 255, 255, 0.95);
        }
        .heo-carousel-button::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 10px;
          height: 10px;
          border-left: 3px solid #374151;
          border-bottom: 3px solid #374151;
          transform: translate(-40%, -50%) rotate(45deg);
        }
        .heo-carousel-button.next::before {
          transform: translate(-60%, -50%) rotate(225deg);
        }
        .heo-card-art {
          position: relative;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          min-height: 230px;
          margin: 16px -12px -18px;
        }
        .heo-card-art::before {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 8px;
          width: min(320px, 78%);
          height: 34px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.16);
          filter: blur(14px);
          transform: translateX(-50%);
        }
        .heo-jiyue-bird-art {
          position: absolute;
          left: 50%;
          bottom: 16px;
          width: min(240px, 68%);
          height: min(240px, 68%);
          border-radius: 36px;
          object-fit: contain;
          filter: drop-shadow(0 26px 42px rgba(0, 0, 0, 0.28));
          transform: translateX(-50%) rotate(-4deg);
        }
        .heo-xiaowanzi-art {
          position: absolute;
          left: 50%;
          bottom: 12px;
          width: min(250px, 70%);
          height: min(250px, 70%);
          object-fit: contain;
          filter: drop-shadow(0 26px 42px rgba(0, 0, 0, 0.24));
          transform: translateX(-50%);
        }
        .heo-visual-scene {
          position: absolute;
          left: 50%;
          bottom: 18px;
          width: min(340px, 84%);
          height: 190px;
          transform: translateX(-50%);
        }
        .heo-scene-panel,
        .heo-scene-card,
        .heo-scene-node,
        .heo-scene-line {
          position: absolute;
          display: block;
        }
        .heo-scene-panel {
          left: 50%;
          bottom: 0;
          width: 78%;
          height: 136px;
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), color-mix(in srgb, var(--card-accent) 5%, white));
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          transform: translateX(-50%);
        }
        .heo-scene-panel::before {
          content: "";
          position: absolute;
          inset: 18px;
          border-radius: 18px;
          background: radial-gradient(circle at 28% 32%, rgba(95, 25, 236, 0.06), transparent 20%), rgba(255, 255, 255, 0.1);
        }
        .heo-scene-card {
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: 0 1px 3px rgba(16, 24, 40, 0.04);
          backdrop-filter: blur(10px);
        }
        .heo-scene-card.one {
          left: 4%;
          bottom: 40px;
          width: 84px;
          height: 106px;
        }
        .heo-scene-card.two {
          right: 2%;
          bottom: 24px;
          width: 110px;
          height: 128px;
        }
        .heo-scene-node {
          width: 54px;
          height: 54px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: 0 1px 3px rgba(16, 24, 40, 0.04);
        }
        .heo-scene-node.one {
          left: 44%;
          bottom: 128px;
        }
        .heo-scene-node.two {
          left: 50%;
          bottom: -4px;
          transform: translateX(-50%);
        }
        .heo-scene-line {
          height: 8px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--card-accent) 20%, rgba(255,255,255,0.6));
          box-shadow: 0 2px 8px rgba(16, 24, 40, 0.05);
        }
        .visual-program .heo-scene-panel::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 54px;
          height: 54px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.9);
          transform: translate(-50%, -50%);
        }
        .visual-program .heo-scene-card.one::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 0;
          height: 0;
          border-top: 14px solid transparent;
          border-bottom: 14px solid transparent;
          border-left: 22px solid var(--card-accent);
          transform: translate(-35%, -50%);
        }
        .visual-materials .heo-scene-card.one,
        .visual-materials .heo-scene-card.two {
          border-radius: 12px 12px 22px 22px;
        }
        .visual-materials .heo-scene-card.one::before,
        .visual-materials .heo-scene-card.two::before {
          content: "";
          position: absolute;
          left: 18px;
          right: 18px;
          top: 26px;
          height: 8px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--card-accent) 46%, white);
          box-shadow: 0 18px 0 rgba(31, 41, 55, 0.12), 0 36px 0 rgba(31, 41, 55, 0.09);
        }
        .visual-experts .heo-scene-panel {
          width: 210px;
          height: 150px;
          border-radius: 42px;
        }
        .visual-experts .heo-scene-node {
          background: linear-gradient(135deg, #7dd3fc, #f9a8d4);
        }
        .visual-experts .heo-scene-line.one {
          left: 26%;
          bottom: 86px;
          width: 145px;
          transform: rotate(-18deg);
        }
        .visual-experts .heo-scene-line.two {
          right: 22%;
          bottom: 64px;
          width: 120px;
          transform: rotate(18deg);
        }
        .visual-planning .heo-scene-line.one,
        .visual-planning .heo-scene-line.two,
        .visual-planning .heo-scene-line.three {
          height: 10px;
          background: color-mix(in srgb, var(--card-accent) 60%, white);
        }
        .visual-planning .heo-scene-line.one {
          left: 16%;
          bottom: 58px;
          width: 90px;
          transform: rotate(-16deg);
        }
        .visual-planning .heo-scene-line.two {
          left: 41%;
          bottom: 95px;
          width: 94px;
          transform: rotate(17deg);
        }
        .visual-planning .heo-scene-line.three {
          right: 12%;
          bottom: 62px;
          width: 74px;
          transform: rotate(-20deg);
        }
        .heo-special-actions {
          margin-top: clamp(30px, 4vw, 60px);
        }
        .heo-special-grid {
          display: flex;
          flex-direction: column;
          gap: 24px;
          margin-top: 8px;
        }
        .heo-special-card {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(24px, 3vw, 48px);
          align-items: center;
          overflow: hidden;
          border-radius: 24px;
          padding: clamp(32px, 4vw, 56px) clamp(28px, 3vw, 48px);
          text-decoration: none;
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.04);
        }
        .heo-special-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.08);
        }
        .heo-special-card.tone-ask {
          grid-template-columns: minmax(0, 0.92fr) minmax(360px, 0.98fr);
          align-items: end;
          gap: clamp(24px, 3vw, 54px);
          text-align: left;
          width: min(1960px, calc(100vw - clamp(32px, 3.5vw, 72px)));
          max-width: none;
          margin-left: 50%;
          transform: translateX(-50%);
          min-height: clamp(560px, 40vw, 720px);
          padding: clamp(40px, 4vw, 72px) clamp(34px, 5vw, 78px) 0;
          border-radius: 30px;
          background:
            radial-gradient(circle at 75% 15%, rgba(255, 255, 255, 0.18), transparent 23%),
            linear-gradient(135deg, #6f19f3 0%, #5F19EC 42%, #3a0f96 100%);
          box-shadow: 0 22px 56px rgba(95, 25, 236, 0.2);
        }
        .heo-special-card.tone-ask:hover {
          transform: translateX(-50%) translateY(-4px);
        }
        .heo-special-card.tone-worth {
          grid-template-columns: 1fr;
          justify-items: center;
          align-content: start;
          gap: clamp(34px, 4vw, 58px);
          text-align: center;
          width: min(1960px, calc(100vw - clamp(32px, 3.5vw, 72px)));
          max-width: none;
          margin-left: 50%;
          transform: translateX(-50%);
          min-height: clamp(640px, 46vw, 820px);
          padding: clamp(40px, 4vw, 72px) clamp(34px, 5vw, 78px) 0;
          border-radius: 30px;
          background: linear-gradient(145deg, #db2777 0%, #be185d 50%, #831843 100%);
          box-shadow: 0 24px 62px rgba(190, 24, 93, 0.22);
        }
        .heo-special-card.tone-worth:hover {
          transform: translateX(-50%) translateY(-4px);
        }
        .heo-special-copy {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .tone-ask .heo-special-copy {
          align-items: flex-start;
          align-self: start;
          max-width: 640px;
          margin: 0;
          padding-top: clamp(8px, 1vw, 20px);
          text-align: left;
        }
        .tone-ask .heo-special-section-title {
          color: #fff;
        }
        .tone-ask .heo-special-section-summary {
          color: rgba(255, 255, 255, 0.88);
        }
        .tone-worth .heo-special-copy {
          align-items: center;
          max-width: 760px;
          margin: 0 auto;
          text-align: center;
        }
        .tone-worth .heo-special-section-title {
          color: #fff;
          font-size: clamp(42px, 6vw, 72px);
          font-weight: 800;
          line-height: 0.96;
        }
        .tone-worth .heo-special-section-summary {
          color: rgba(255, 255, 255, 0.72);
          font-size: clamp(18px, 2.2vw, 30px);
          line-height: 1.3;
        }
        .heo-special-copy small {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          padding: 5px 14px;
          background: rgba(255, 255, 255, 0.15);
          color: #fbbf24;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .tone-ask .heo-special-copy small {
          padding: 8px 18px;
          background: rgba(255, 255, 255, 0.14);
          color: #ffd23f;
          font-size: 14px;
          letter-spacing: 0;
        }
        .heo-special-copy b {
          color: #fff;
          font-size: clamp(24px, 3vw, 36px);
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .tone-ask .heo-special-copy b {
          max-width: 620px;
          font-size: clamp(34px, 4.2vw, 58px);
          line-height: 1.08;
          font-weight: 950;
          letter-spacing: -0.045em;
        }
        .heo-special-copy p {
          margin: 0;
          color: rgba(255, 255, 255, 0.6);
          font-size: clamp(14px, 1.5vw, 16px);
          line-height: 1.7;
        }
        .tone-ask .heo-special-copy p {
          max-width: 600px;
          color: rgba(255, 255, 255, 0.68);
          font-size: clamp(16px, 1.6vw, 20px);
          line-height: 1.8;
        }
        .heo-special-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: fit-content;
          margin-top: 4px;
          border-radius: 999px;
          padding: 12px 28px;
          background: #fff;
          font-size: 15px;
          font-weight: 700;
          transition: transform 0.2s ease;
        }
        .heo-special-card.tone-ask .heo-special-action {
          color: #5F19EC;
        }
        .tone-ask .heo-special-action {
          padding: 14px 34px;
          font-size: 17px;
          box-shadow: 0 14px 28px rgba(20, 8, 50, 0.18);
        }
        .heo-special-card.tone-worth .heo-special-action {
          color: #db2777;
        }
        .heo-special-card:hover .heo-special-action {
          transform: scale(1.04);
        }
        .heo-special-preview {
          position: relative;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
        }
        .tone-ask .heo-special-preview {
          align-self: end;
          justify-self: end;
          width: min(820px, 54vw);
          min-height: clamp(320px, 24vw, 430px);
          margin: clamp(18px, 2vw, 36px) 0 -92px auto;
          border-radius: 26px 26px 0 0;
          transform: rotate(-2deg) translateX(24px);
        }
        .heo-special-preview img {
          display: block;
          width: 100%;
          height: auto;
          border-radius: 14px;
        }
        .tone-ask .heo-special-preview img {
          height: clamp(320px, 24vw, 430px);
          border-radius: 20px 20px 0 0;
          object-fit: cover;
          object-position: top center;
        }
        .heo-topics-shot-frame {
          position: relative;
          padding: clamp(14px, 1.5vw, 18px) clamp(14px, 1.5vw, 18px) 0;
          border-radius: 38px 38px 0 0;
          background: linear-gradient(180deg, #17161d 0%, #07070b 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow:
            0 28px 60px rgba(4, 6, 12, 0.38),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .heo-topics-shot-frame::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 7px;
          width: min(180px, 28%);
          height: 5px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          transform: translateX(-50%);
        }
        .heo-topics-shot-screen {
          background: #fff;
          border-radius: 26px 26px 0 0;
          overflow: hidden;
          border: 1px solid rgba(15, 23, 42, 0.08);
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
        }
        .heo-topics-shot-screen img {
          display: block;
          width: 100%;
          height: clamp(400px, 28vw, 520px);
          object-fit: cover;
          object-position: top center;
        }
        .tone-worth .heo-special-preview {
          align-self: center;
          width: min(1120px, 78vw);
          min-height: clamp(400px, 28vw, 520px);
          margin: 0 auto -150px;
          border-radius: 26px 26px 0 0;
        }
        .heo-worthbuy-shot-frame {
          position: relative;
          padding: clamp(14px, 1.5vw, 18px) clamp(14px, 1.5vw, 18px) 0;
          border-radius: 38px 38px 0 0;
          background: linear-gradient(180deg, #17161d 0%, #07070b 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow:
            0 28px 60px rgba(4, 6, 12, 0.38),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .heo-worthbuy-shot-frame::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 7px;
          width: min(180px, 28%);
          height: 5px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          transform: translateX(-50%);
        }
        .heo-worthbuy-shot-screen {
          background: #fff;
          border-radius: 26px 26px 0 0;
          overflow: hidden;
          border: 1px solid rgba(15, 23, 42, 0.08);
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
        }
        .heo-worthbuy-shot-screen img {
          display: block;
          width: 100%;
          height: clamp(400px, 28vw, 520px);
          object-fit: cover;
          object-position: top center;
        }
                .heo-section-more {
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 6px 16px;
          background: var(--lp-primary);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
        }
        .heo-section-more-top {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
          margin-bottom: 20px;
        }

        /* ===== 新版主打推荐卡片 ===== */
        .heo-new-grid-wrap {
          position: relative;
        }
        .heo-new-grid {
          display: flex;
          gap: 28px;
          margin-top: 24px;
          overflow-x: auto;
          scroll-behavior: smooth;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          padding: 30px 0 8px;
        }
        .heo-new-grid::-webkit-scrollbar { display: none; }
        .heo-new-grid > * {
          scroll-snap-align: start;
          flex: 0 0 calc((100% - 56px) / 3);
          min-width: 360px;
        }
        .heo-new-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: 560px;
          overflow: hidden;
          border-radius: 30px;
          background: #fff;
          border: 1px solid #dce6f3;
          box-shadow: 0 14px 36px rgba(15, 23, 42, 0.06);
          color: var(--lp-text);
          padding: clamp(28px, 3vw, 42px);
          text-align: center;
          text-decoration: none;
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
        }
        .heo-new-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.1);
        }
        .heo-new-card-art {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: clamp(210px, 17vw, 270px);
          margin-top: auto;
          overflow: visible;
        }
        .heo-new-card-art::before {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 10px;
          width: min(360px, 86%);
          height: 32px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.14);
          filter: blur(18px);
          transform: translateX(-50%);
        }
        .heo-new-card-art.is-logo-only::before {
          display: none;
        }
        .heo-new-card-art::after {
          display: none;
        }
        .heo-new-card-copy {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          min-height: 190px;
        }
        .heo-new-card-tag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          padding: 6px 12px;
          background: #f1f3f5;
          color: #111827;
          font-size: 13px;
          line-height: 1;
          font-weight: 800;
        }
        .heo-new-card-title {
          color: var(--lp-text);
          max-width: 360px;
          font-size: clamp(28px, 2.8vw, 40px);
          line-height: 1.34;
          font-weight: 900;
          letter-spacing: -0.035em;
          white-space: pre-line;
        }
        .heo-new-card-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          color: #1499e8;
          font-size: 18px;
          line-height: 1;
          font-weight: 900;
          transition: transform 0.2s ease, color 0.2s ease;
        }
        .heo-new-card:hover .heo-new-card-link {
          color: var(--card-accent);
          transform: translateX(3px);
        }
        .heo-product-device,
        .heo-product-side,
        .heo-product-chip,
        .heo-product-line,
        .heo-product-orbit,
        .heo-product-document {
          position: absolute;
          display: block;
        }
        .heo-product-device {
          left: 50%;
          bottom: 18px;
          width: min(372px, 86%);
          height: 154px;
          border: 1px solid rgba(210, 223, 236, 0.9);
          border-radius: 34px;
          background: linear-gradient(180deg, #ffffff 0%, #f4f8fc 100%);
          box-shadow: 0 18px 42px rgba(166, 180, 200, 0.18);
          transform: translateX(-50%);
        }
        .heo-product-device::before {
          display: none;
        }
        .heo-device-screen {
          position: absolute;
          inset: 14px;
          overflow: hidden;
          border-radius: 24px;
          background:
            radial-gradient(circle at 30% 26%, rgba(255, 255, 255, 0.92), transparent 16%),
            linear-gradient(135deg, color-mix(in srgb, var(--card-accent) 42%, white) 0%, color-mix(in srgb, var(--card-accent) 16%, #ffffff) 100%);
        }
        .heo-device-screen::before,
        .heo-device-screen::after {
          content: "";
          position: absolute;
          left: 28px;
          right: 28px;
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.65);
        }
        .heo-device-screen::before {
          bottom: 34px;
        }
        .heo-device-screen::after {
          bottom: 56px;
          right: 92px;
        }
        .heo-product-side {
          width: 78px;
          height: 104px;
          border-radius: 26px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), #edf3fa);
          border: 1px solid rgba(213, 224, 236, 0.94);
          box-shadow: 0 18px 30px rgba(202, 212, 224, 0.28);
        }
        .heo-product-side.one {
          left: 14%;
          bottom: 48px;
        }
        .heo-product-side.two {
          right: 12%;
          bottom: 50px;
          width: 82px;
          height: 112px;
        }
        .heo-product-side.three {
          left: 50%;
          bottom: -2px;
          width: 84px;
          height: 68px;
          transform: translateX(-50%);
        }
        .heo-product-logo {
          position: absolute;
          z-index: 2;
          left: 50%;
          bottom: 58px;
          width: min(150px, 32%);
          height: min(150px, 54%);
          object-fit: contain;
          filter: none;
          transform: translateX(-50%);
        }
        .heo-product-logo.brand {
          width: min(180px, 44%);
          border-radius: 22px;
          background: #fff;
          padding: 14px;
        }
        .heo-square-logo-stack {
          position: absolute;
          z-index: 3;
          left: 50%;
          top: 50%;
          width: min(320px, 76%);
          height: min(220px, 82%);
          transform: translate(-50%, -48%);
        }
        .heo-square-logo-stack img {
          position: absolute;
          display: block;
          width: 132px;
          height: 132px;
          border-radius: 28px;
          object-fit: cover;
          border: 6px solid #fff;
          background: #fff;
          box-shadow: none;
        }
        .is-logo-only .heo-square-logo-stack img {
          width: 148px;
          height: 148px;
          border-radius: 30px;
          box-shadow: none;
        }
        .heo-square-logo-stack .is-xianfeng {
          z-index: 2;
          left: 0;
          bottom: 0;
          transform: rotate(-5deg);
        }
        .heo-square-logo-stack .is-zhiji {
          z-index: 1;
          right: 0;
          top: 6px;
          transform: rotate(7deg);
        }
        .heo-product-logo.assistant {
          top: 50%;
          bottom: auto;
          width: min(190px, 48%);
          height: min(190px, 72%);
          transform: translate(-50%, -48%);
        }
        .heo-product-logo.reading {
          top: 50%;
          bottom: auto;
          width: min(210px, 52%);
          height: min(210px, 76%);
          transform: translate(-50%, -48%);
        }
        .visual-materials .heo-product-device {
          width: min(356px, 86%);
          height: 144px;
        }
        .visual-materials .heo-product-side.one,
        .visual-materials .heo-product-side.two,
        .visual-materials .heo-product-side.three {
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          border-color: rgba(232, 138, 0, 0.08);
        }
        .visual-materials .heo-product-side.one {
          left: 18%;
          bottom: 46px;
          width: 68px;
          height: 102px;
        }
        .visual-materials .heo-product-side.two {
          right: 18%;
          bottom: 46px;
          width: 68px;
          height: 102px;
        }
        .visual-materials .heo-product-side.three {
          width: 78px;
          height: 62px;
          bottom: -4px;
        }
        .visual-materials .heo-device-screen {
          background:
            radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.96), transparent 14%),
            linear-gradient(135deg, #fff4dc 0%, #fff6e7 18%, #f7fbff 100%);
        }
        .visual-materials .heo-product-document {
          display: none;
        }
        .visual-materials .heo-device-screen::before {
          content: "";
          position: absolute;
          inset: 18px 88px 18px 92px;
          border-radius: 18px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0 38%, transparent 38% 100%),
            linear-gradient(180deg, rgba(239, 244, 250, 0.92), rgba(255, 255, 255, 0.94));
          box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.88);
        }
        .visual-materials .heo-device-screen::after {
          left: 116px;
          right: 116px;
          bottom: auto;
          top: 54px;
          height: 5px;
          background: color-mix(in srgb, var(--card-accent) 64%, #fff);
          box-shadow:
            0 15px 0 rgba(177, 191, 208, 0.55),
            0 30px 0 rgba(202, 212, 224, 0.48);
        }
        .visual-experts .heo-product-device,
        .visual-planning .heo-product-device {
          width: min(340px, 82%);
          height: 138px;
          border-radius: 30px;
          background: linear-gradient(180deg, #ffffff 0%, #f6faff 100%);
        }
        .visual-experts .heo-product-chip,
        .visual-planning .heo-product-chip {
          width: 54px;
          height: 54px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--card-accent) 32%, #fff);
          box-shadow: none;
        }
        .visual-experts .heo-product-chip.one {
          left: 24%;
          bottom: 108px;
        }
        .visual-experts .heo-product-chip.two {
          left: 47%;
          bottom: 64px;
        }
        .visual-experts .heo-product-chip.three {
          right: 24%;
          bottom: 110px;
        }
        .visual-experts .heo-product-side.one,
        .visual-experts .heo-product-side.two,
        .visual-experts .heo-product-side.three {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), #fff7fb);
          border-color: rgba(219, 39, 119, 0.09);
        }
        .visual-experts .heo-product-side.one {
          left: 15%;
          bottom: 42px;
        }
        .visual-experts .heo-product-side.two {
          right: 15%;
          bottom: 42px;
        }
        .visual-experts .heo-product-side.three {
          bottom: -2px;
        }
        .visual-experts .heo-device-screen {
          background:
            radial-gradient(circle at 28% 28%, rgba(255, 255, 255, 0.96), transparent 14%),
            linear-gradient(145deg, #fde7f1 0%, #f8d3e8 40%, #f5efff 100%);
        }
        .visual-experts .heo-device-screen::before {
          left: 72px;
          right: 72px;
          bottom: auto;
          top: 38px;
          height: 8px;
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 22px 0 rgba(255, 255, 255, 0.82);
        }
        .visual-experts .heo-device-screen::after {
          left: 122px;
          right: 122px;
          bottom: auto;
          top: 76px;
          height: 8px;
          background: rgba(255, 255, 255, 0.74);
        }
        .visual-planning .heo-product-line {
          height: 9px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--card-accent) 68%, #fff);
          box-shadow: none;
        }
        .visual-planning .heo-product-side.one,
        .visual-planning .heo-product-side.two,
        .visual-planning .heo-product-side.three {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), #f3fbfb);
          border-color: rgba(15, 118, 110, 0.08);
        }
        .visual-planning .heo-product-side.one {
          left: 15%;
          bottom: 48px;
          transform: rotate(-6deg);
        }
        .visual-planning .heo-product-side.two {
          right: 14%;
          bottom: 48px;
          transform: rotate(6deg);
        }
        .visual-planning .heo-product-side.three {
          bottom: -1px;
        }
        .visual-planning .heo-device-screen {
          background:
            radial-gradient(circle at 26% 26%, rgba(255, 255, 255, 0.95), transparent 14%),
            linear-gradient(145deg, #e8fbfa 0%, #d2f3f0 42%, #eff9fd 100%);
        }
        .visual-planning .heo-device-screen::before {
          left: 74px;
          right: 74px;
          bottom: auto;
          top: 48px;
          height: 7px;
          background: rgba(255, 255, 255, 0.82);
          box-shadow: 0 22px 0 rgba(255, 255, 255, 0.72);
        }
        .visual-planning .heo-device-screen::after {
          left: 124px;
          right: 124px;
          bottom: auto;
          top: 84px;
          height: 7px;
          background: rgba(255, 255, 255, 0.66);
        }
        .visual-planning .heo-product-line.one {
          left: 24%;
          bottom: 74px;
          width: 80px;
          transform: rotate(-22deg);
        }
        .visual-planning .heo-product-line.two {
          left: 43%;
          bottom: 106px;
          width: 98px;
          transform: rotate(14deg);
        }
        .visual-planning .heo-product-line.three {
          right: 21%;
          bottom: 72px;
          width: 84px;
          transform: rotate(-18deg);
        }
        .heo-new-nav-arrows {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 16px;
          margin-top: 24px;
        }
        .heo-new-nav-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #fff;
          color: var(--lp-text);
          font-size: 20px;
          cursor: pointer;
          transition: background 0.2s ease, box-shadow 0.2s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        }
        .heo-new-nav-arrow:hover {
          background: var(--lp-primary);
          color: #fff;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        }

        /* ===== 请教一下 Topic Cards ===== */
        .heo-topic-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 22px;
        }
        .heo-topic-card {
          position: relative;
          display: flex;
          flex-direction: column;
          min-height: 128px;
          gap: 12px;
          background: #fff;
          border-radius: 22px;
          border: 1px solid rgba(15, 23, 42, 0.05);
          padding: 22px 72px 22px 24px;
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.07);
          text-decoration: none;
          color: inherit;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .heo-topic-card:hover {
          transform: translateY(-4px);
          border-color: rgba(95, 25, 236, 0.14);
          box-shadow: 0 22px 44px rgba(95, 25, 236, 0.12);
        }
        .heo-topic-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .heo-topic-card-top h3 {
          margin: 0;
          flex: 1;
          font-size: 17px;
          font-weight: 700;
          color: var(--lp-text);
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .heo-topic-emoji {
          position: absolute;
          right: 20px;
          top: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 16px;
          background: #f7f2ff;
          box-shadow: inset 0 0 0 1px rgba(95, 25, 236, 0.08);
          font-size: 27px;
          line-height: 1;
        }
        .heo-topic-desc {
          margin: 0;
          font-size: 12px;
          color: var(--lp-muted);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .heo-topic-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
        }
        .heo-topic-tag {
          display: inline-flex;
          border-radius: 999px;
          padding: 3px 10px;
          background: #f3eeff;
          color: #5F19EC;
          font-size: 11px;
          font-weight: 600;
        }
        .heo-topic-meta small {
          color: #9ca3af;
          font-size: 11px;
          font-weight: 500;
        }
        .heo-worthbuy-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 32px 20px;
        }
        .heo-worthbuy-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #fff;
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          padding: 18px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 20px rgba(0, 0, 0, 0.06);
          text-decoration: none;
          color: inherit;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .heo-worthbuy-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06), 0 10px 30px rgba(0, 0, 0, 0.08);
        }
        .heo-worthbuy-icon {
          font-size: 28px;
          line-height: 1;
        }
        .heo-worthbuy-copy {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .heo-worthbuy-title {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: var(--lp-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
        }
        .heo-worthbuy-tag {
          flex-shrink: 0;
          display: inline-flex;
          border-radius: 8px;
          padding: 2px 8px;
          background: #f3eeff;
          color: #5F19EC;
          font-size: 10px;
          font-weight: 600;
        }
        .heo-worthbuy-desc {
          margin: 0;
          font-size: 12px;
          color: var(--lp-muted);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @keyframes fadeUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes menuDrop {
          from {
            opacity: 0;
            transform: translate(-50%, -10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
        }
        @keyframes guestMarquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        @media (max-width: 768px) {
          .landing-shell {
            width: calc(100% - 18px);
          }
          .landing-block {
            margin-top: 32px;
          }
          .heo-topbar {
            top: 10px;
          }
          .heo-topbar-inner {
            width: fit-content;
            min-height: auto;
            padding: 0;
            background: none;
            border: none;
            box-shadow: none;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            margin-left: auto;
            margin-right: 9px;
          }
          .heo-nav-brand {
            display: none;
          }
          .heo-nav-links {
            display: none;
          }
          .heo-nav-actions {
            gap: 0;
          }
          .heo-login-link {
            padding: 6px 14px;
            font-size: 13px;
            min-height: 32px;
            border-radius: 999px;
          }
          .heo-main {
            padding-top: 0;
          }
          .heo-hero {
            grid-template-columns: 1fr;
            min-height: auto;
          }
          .heo-title {
            font-size: clamp(42px, 14vw, 64px);
          }
          .heo-hero-stage,
          .heo-hero-copy {
            border-radius: 28px;
          }
          .heo-manifesto-card {
            align-items: flex-start;
            padding: 22px 20px;
          }
          .heo-manifesto-card p {
            text-align: left;
            font-size: 16px;
          }
          .heo-manifesto-profile {
            width: fit-content;
          }
          .heo-manifesto-profile span {
            white-space: normal;
          }
          .heo-special-card {
            grid-template-columns: 1fr;
            gap: 24px;
            padding: 28px 24px;
          }
          .heo-first-screen {
            padding-bottom: 72px;
          }
          .heo-hero {
            padding-top: 112px;
            padding-bottom: 38px;
            transform: none;
          }
          .heo-actions {
            gap: 12px;
            margin-top: 22px;
          }
          .heo-duo-section {
            margin-top: 34px;
            padding-inline: 0;
            padding-bottom: 0;
          }
          .heo-duo-quote {
            font-size: 19px;
          }
          .heo-duo-names {
            font-size: 13px;
          }
          .heo-special-card.tone-ask {
            grid-template-columns: 1fr;
            width: auto;
            max-width: none;
            margin-left: 0;
            transform: none;
            justify-items: start;
            align-content: start;
            text-align: left;
            min-height: 0;
            padding: 32px 24px 0;
            border-radius: 26px;
          }
          .heo-special-card.tone-ask:hover {
            transform: none;
          }
          .heo-special-card.tone-worth {
            width: auto;
            max-width: none;
            margin-left: 0;
            transform: none;
            justify-items: center;
            align-content: start;
            text-align: center;
            min-height: 620px;
            padding: 32px 24px 0;
            border-radius: 26px;
          }
          .heo-special-card.tone-worth:hover {
            transform: none;
          }
          .tone-worth .heo-special-section-title {
            font-size: 44px;
          }
          .tone-worth .heo-special-section-summary {
            font-size: 18px;
          }
          .tone-ask .heo-special-copy b {
            font-size: clamp(30px, 9vw, 44px);
          }
          .tone-ask .heo-special-preview {
            width: min(100%, 560px);
            min-height: 320px;
            margin: 12px 0 -34px auto;
            border-radius: 22px 22px 0 0;
            transform: rotate(-1.4deg) translateX(6px);
          }
          .heo-topics-shot-frame {
            padding: 12px 12px 0;
            border-radius: 28px 28px 0 0;
          }
          .heo-topics-shot-screen {
            border-radius: 18px 18px 0 0;
          }
          .heo-topics-shot-screen img {
            height: 320px;
          }
          .tone-worth .heo-special-preview {
            width: 100%;
            min-height: 320px;
            margin: 12px auto -34px;
            border-radius: 22px 22px 0 0;
          }
          .heo-worthbuy-shot-frame {
            padding: 12px 12px 0;
            border-radius: 28px 28px 0 0;
          }
          .heo-worthbuy-shot-screen {
            border-radius: 18px 18px 0 0;
          }
          .heo-worthbuy-shot-screen img {
            height: 320px;
          }
          .heo-special-mockup {
            max-width: 100%;
          }
          .heo-product-list {
            gap: 16px;
            margin-inline: -14px;
            padding: 24px 14px 16px;
            scroll-padding-inline: 14px;
          }
          .heo-topic-cards {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .heo-topic-card {
            min-height: 120px;
            padding: 20px 64px 20px 20px;
          }
          .heo-worthbuy-cards {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .heo-banner-card {
            grid-template-columns: 1fr;
            gap: 24px;
            padding: 28px 24px;
          }
          .heo-banner-mockup {
            max-width: 100%;
          }
          .guest-marquee-section {
            margin-top: 68px;
            border-radius: 28px;
          }
          .guest-marquee-head {
            align-items: flex-start;
            flex-direction: column;
            gap: 12px;
            padding-bottom: 18px;
          }
          .guest-pill {
            font-size: 11px;
          }
          .guest-pill-avatar {
            width: 24px;
            height: 24px;
          }
          .heo-product-card {
            flex-basis: min(300px, calc(100vw - 48px));
            min-height: 380px;
            border-radius: 24px;
            padding: 22px;
          }
          .heo-card-art {
            min-height: 170px;
            margin-bottom: -12px;
          }
          .heo-new-grid > * {
            flex: 0 0 min(340px, calc(100vw - 46px));
            min-width: min(340px, calc(100vw - 46px));
          }
          .heo-new-card {
            min-height: 500px;
            padding: 26px 22px;
            border-radius: 26px;
          }
          .heo-new-card-copy {
            min-height: 168px;
            gap: 16px;
          }
          .heo-new-card-title {
            font-size: 28px;
          }
          .heo-new-card-link {
            font-size: 16px;
          }
          .heo-new-card-art {
            height: 210px;
          }
          .heo-product-device {
            width: min(300px, 92%);
            height: 126px;
            border-width: 8px;
            border-radius: 24px;
          }
          .heo-product-side.one {
            left: 8%;
            width: 60px;
            height: 86px;
          }
          .heo-product-side.two {
            right: 6%;
            width: 68px;
            height: 94px;
          }
          .heo-product-side.three {
            width: 70px;
            height: 58px;
          }
          .heo-square-logo-stack {
            width: 220px;
            height: 150px;
            bottom: 34px;
          }
          .heo-square-logo-stack img {
            width: 110px;
            height: 110px;
            border-radius: 22px;
            border-width: 5px;
          }
          .heo-special-body {
            align-items: start;
            padding: 20px;
          }
          .heo-special-action {
            width: fit-content;
          }
          .heo-jiyue-bird-art {
            width: min(170px, 64%);
            height: min(170px, 64%);
            border-radius: 28px;
            bottom: 10px;
          }
          .heo-xiaowanzi-art {
            width: min(176px, 66%);
            height: min(176px, 66%);
            bottom: 8px;
          }
          .heo-visual-scene {
            width: min(260px, 88%);
            height: 144px;
            bottom: 12px;
          }
          .heo-scene-panel {
            height: 104px;
            border-width: 6px;
            border-radius: 20px;
          }
          .heo-scene-card.one {
            left: 5%;
            width: 62px;
            height: 78px;
          }
          .heo-scene-card.two {
            right: 3%;
            width: 82px;
            height: 96px;
          }
          .heo-scene-node {
            width: 42px;
            height: 42px;
          }
          .heo-section-head {
            align-items: start;
            flex-direction: column;
          }
        }
      `}</style>

      <header className="heo-topbar">
        <div className="heo-topbar-inner">
          <button className="heo-nav-brand" type="button" aria-label="打开节目列表" onClick={() => { window.location.href = "/programs/list"; }}>
            <span className="heo-nav-avatar">
              <img src="/assets/xiaowanzi-nohat.png" alt="" aria-hidden="true" />
            </span>
          </button>
          <nav
            className="heo-nav-links"
            aria-label="首页导航"
            onMouseLeave={() => setActiveCatalogIndex(-1)}
            onPointerLeave={() => setActiveCatalogIndex(-1)}
          >
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`heo-nav-link ${activeCatalogIndex === item.index ? "is-active" : ""}`}
                onMouseEnter={() => setActiveCatalogIndex(item.index)}
                onPointerEnter={() => setActiveCatalogIndex(item.index)}
                onFocus={() => setActiveCatalogIndex(item.index)}
                onClick={(e) => {
                  e.preventDefault();
                  if (item.href === "/programs/list") {
                    window.location.href = item.href;
                    return;
                  }
                  const targetEl = document.getElementById(item.anchor);
                  if (targetEl) {
                    targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
                    setActiveCatalogIndex(item.index);
                  } else {
                    window.location.href = item.href;
                  }
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="heo-nav-actions">
            <button type="button" className="heo-login-link" onClick={openHomepageLoginModal}>登录</button>
          </div>
        </div>
      </header>

      <main className="landing-shell heo-main">
        <div className="heo-first-screen">
          <section className="heo-hero fade-up" style={{ animationDelay: "60ms" }}>
            <div className="heo-hero-stage fade-up" style={{ animationDelay: "140ms" }}>
              <span className="heo-hero-wordmark" aria-hidden="true">JIAZHANG XIANFENG DIGITAL</span>
              <div className="heo-hero-copy">
                <span className="heo-kicker">JIAZHANG XIANFENG / PARENTING CONTENT EST. 2025</span>
                <h1 className="heo-title">
                  <img src="/assets/logo.png" alt="家长先疯" className="heo-title-logo" />
                </h1>
                <p className="heo-lead">
                  把节目、书单、资料、请教、智库、知物和教育规划放进同一个内容现场。我们关心孩子，也关心教育关系里每一个正在做判断的人。
                </p>
                <div className="heo-actions">
                  <a className="heo-button primary" href="/programs/list">进入节目列表</a>
                  <a className="heo-button" href="/topics">请教一下</a>
                  <a className="heo-button" href="/materials">找学习资料</a>
                </div>
              </div>

            </div>
          </section>
          {hostDuo.length === 2 ? (
            <section className="heo-duo-section fade-up" style={{ animationDelay: "180ms" }}>
              <div className="heo-duo-card">
                <div className="heo-duo-avatars">
                  {hostDuo.map((host) => {
                    const hostName = toText(host.name);
                    const avatar = resolveGuestAvatar(host.avatar, !!failedGuestAvatars[host._id]);
                    const avatarSrc = avatar.isFallback ? avatar.src : toText(host.avatar);
                    return (
                      <div className="heo-duo-avatar" key={host._id}>
                        <img
                          src={avatarSrc}
                          alt={hostName}
                          loading="lazy"
                          decoding="async"
                          onError={() => {
                            setFailedGuestAvatars((prev) => (prev[host._id] ? prev : { ...prev, [host._id]: true }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="heo-duo-quote">“教育只有方法，没有答案”</p>
                <span className="heo-duo-names">{hostDuo.map((h) => toText(h.name)).join(' & ')}</span>
              </div>
            </section>
          ) : null}
        </div>

        {guestMarqueeItems.length > 0 ? (
          <section id="guest-marquee" className="guest-marquee-section" aria-label="先疯智库嘉宾">
            <div className="guest-marquee-head">
              <div>
                <span>来自先疯智库</span>
                <b>和这些嘉宾一起，把问题继续问深一点</b>
              </div>
              <a href="/experts">进入智库</a>
            </div>
            <div className="guest-marquee-window">
              <div className="guest-marquee-track">
                {guestMarqueeItems.map((guest, index) => {
                  const guestName = toText(guest.name) || "未命名嘉宾";
                  const avatar = resolveGuestAvatar(guest.avatar, !!failedGuestAvatars[guest._id]);
                  const avatarSrc = avatar.isFallback ? avatar.src : toText(guest.avatar);
                  return (
                    <a className="guest-pill" href={`/experts/${encodeURIComponent(guest._id)}`} key={`${guest._id}-${index}`}>
                      <span className="guest-pill-avatar">
                        <img
                          className={avatar.isFallback ? "is-fallback-avatar" : undefined}
                          src={avatarSrc}
                          alt={guestName}
                          loading="lazy"
                          decoding="async"
                          onError={() => {
                            setFailedGuestAvatars((prev) => (prev[guest._id] ? prev : { ...prev, [guest._id]: true }));
                          }}
                        />
                      </span>
                      <span className="guest-pill-name">{guestName}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {/* ===== 主打推荐 — 全新卡片设计 ===== */}
        <section id="primary-entry" className="heo-section">
          <div className="heo-section-head">
            <div>
              <h2>这是我为你主要推荐的产品</h2>
              <span className="heo-section-kicker">主打推荐</span>
            </div>
          </div>

          <div className="heo-new-grid-wrap">
            <div className="heo-new-grid" ref={(el) => { (window as any).__heoNewGrid = el; }}>
              {featureCards.map((item) => {
                const color = cardColors[item.visual] || cardColors.program;
                return (
                  <a
                    className="heo-new-card"
                    href={item.href}
                    key={item.title}
                    onClick={(event) => handleHomepageEntryClick(event, item.href)}
                    style={{ '--card-accent': color.accent } as React.CSSProperties}
                  >
                    <span className="heo-new-card-copy">
                      <span className="heo-new-card-tag">{item.status}</span>
                      <b className="heo-new-card-title">{item.headline}</b>
                      <span className="heo-new-card-link">{item.learnMore} ›</span>
                    </span>
                    <div className={`heo-new-card-art visual-${item.visual} ${["program", "reading", "assistant"].includes(item.visual) ? "is-logo-only" : ""}`} aria-hidden="true">
                      {!["program", "reading", "assistant"].includes(item.visual) ? (
                        <>
                          <span className="heo-product-device">
                            <span className="heo-device-screen">
                              {item.visual === "materials" ? (
                                <>
                                  <span className="heo-product-document" />
                                  <span className="heo-product-document" />
                                  <span className="heo-product-document" />
                                </>
                              ) : null}
                            </span>
                          </span>
                          <span className="heo-product-side one" />
                          <span className="heo-product-side two" />
                          <span className="heo-product-side three" />
                        </>
                      ) : null}
                      {item.visual === "program" ? (
                        <span className="heo-square-logo-stack">
                          <img className="is-zhiji" src="/assets/zhongnianzhiji-square-logo.png" alt="" loading="lazy" decoding="async" />
                          <img className="is-xianfeng" src="/assets/xianfeng-square-logo.png" alt="" loading="lazy" decoding="async" />
                        </span>
                      ) : null}
                      {item.visual === "reading" ? (
                        <img className="heo-product-logo reading" src="/assets/jiyue-logo.png" alt="" loading="lazy" decoding="async" />
                      ) : null}
                      {item.visual === "assistant" ? (
                        <img className="heo-product-logo assistant" src="/assets/xiaowanzi-nohat.png" alt="" loading="lazy" decoding="async" />
                      ) : null}
                      {item.visual === "experts" ? (
                        <>
                          <span className="heo-product-chip one" />
                          <span className="heo-product-chip two" />
                          <span className="heo-product-chip three" />
                        </>
                      ) : null}
                      {item.visual === "planning" ? (
                        <>
                          <span className="heo-product-line one" />
                          <span className="heo-product-line two" />
                          <span className="heo-product-line three" />
                        </>
                      ) : null}
                    </div>
                  </a>
                );
              })}
            </div>
            <div className="heo-new-nav-arrows">
              <button className="heo-new-nav-arrow" type="button" aria-label="上一个" onClick={() => {
                const el = (window as any).__heoNewGrid;
                if (el) el.scrollBy({ left: -(el.clientWidth - 40), behavior: 'smooth' });
              }}>‹</button>
              <button className="heo-new-nav-arrow" type="button" aria-label="下一个" onClick={() => {
                const el = (window as any).__heoNewGrid;
                if (el) el.scrollBy({ left: el.clientWidth - 40, behavior: 'smooth' });
              }}>›</button>
            </div>
          </div>
        </section>

        <section className="heo-section">
          <a className={`heo-special-card tone-ask`} href="/topics">
            <span className="heo-special-copy">
              <small>持续开放</small>
              <strong className="heo-special-section-title">请教一下</strong>
              <span className="heo-special-section-summary">从真实问题进入回答、线索和知识树</span>
              <b>把一个真实困惑，拆成能继续追问的线索</b>
              <p>提交家庭教育现场里的具体问题，查看站内问题、回答与智能生成的知识树。</p>
              <span className="heo-special-action">去提问</span>
            </span>
            <div className="heo-special-preview" aria-hidden="true">
              <div className="heo-topics-shot-frame" aria-hidden="true">
                <div className="heo-topics-shot-screen">
                  <img src="/assets/preview-topics.png" alt="" loading="lazy" decoding="async" />
                </div>
              </div>
            </div>
          </a>
          <div className="heo-section-more-top">
            <a className="heo-section-more" href="/topics">查看全部 →</a>
          </div>
              <div className="heo-topic-cards">
                {homepageTopicCards.map((item) => (
                  <a
                    className="heo-topic-card"
                    href={item.href}
                key={`${item.href}-${item.title}`}
              >
                <div className="heo-topic-card-top">
                  <h3>{item.title}</h3>
                  <span className="heo-topic-emoji">{resolveTopicEmoji(item.title, item.badge)}</span>
                </div>
                <p className="heo-topic-desc">{item.desc}</p>
                <div className="heo-topic-meta">
                  {item.badge ? <span className="heo-topic-tag">{item.badge}</span> : null}
                  <small>{item.meta}</small>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* ===== 知物 — 大卡片 + 内容列表 ===== */}
        <section className="heo-section">
          <a className={`heo-special-card tone-worth`} href="/worthbuy">
            <span className="heo-special-copy">
              <small>持续更新</small>
              <strong className="heo-special-section-title">知物</strong>
              <span className="heo-special-section-summary">从公开产品与服务分析进入判断</span>
              <b>把选择放回场景里，再做判断</b>
              <p>围绕教育与家庭场景整理品牌、产品和服务分析，让购买和选择多一层参考。</p>
              <span className="heo-special-action">查看分析</span>
            </span>
            <div className="heo-special-preview" aria-hidden="true">
              <div className="heo-worthbuy-shot-frame" aria-hidden="true">
                <div className="heo-worthbuy-shot-screen">
                  <img src="/assets/preview-worthbuy-detail-chair.png" alt="" loading="lazy" decoding="async" />
                </div>
              </div>
            </div>
          </a>
          <div className="heo-section-more-top">
            <a className="heo-section-more" href="/worthbuy">查看全部 →</a>
          </div>
              <div className="heo-worthbuy-cards">
                {homepageWorthBuyCards.map((item) => (
                  <a
                    className="heo-worthbuy-card"
                    href={item.href}
                key={`${item.href}-${item.title}`}
              >
                <span className="heo-worthbuy-icon">{resolveWorthBuyEmoji(item.title, item.badge)}</span>
                <div className="heo-worthbuy-copy">
                  <p className="heo-worthbuy-title">{item.title}</p>
                  <span className="heo-worthbuy-tag">{item.badge}</span>
                </div>
                <p className="heo-worthbuy-desc">{item.desc}</p>
              </a>
            ))}
          </div>
        </section>

      </main>

      <footer id="contact" className="border-t border-[rgba(23,24,31,0.06)] bg-[#f8fafc]/90 py-7">
        <div className="landing-shell flex flex-col items-center justify-between gap-4 md:flex-row">
          <img alt="家和万事 服务家庭 智慧决策" className="h-[30px] w-auto object-contain" src="/assets/jiahe-logo.png" />
          <div className="flex flex-wrap items-center justify-center gap-5 text-xs font-bold text-[rgba(23,24,31,0.44)]">
            <a className="hover:text-[var(--lp-primary)]" href="#">关于我们</a>
            <a className="hover:text-[var(--lp-primary)]" href="#">合作联系</a>
            <a className="hover:text-[var(--lp-primary)]" href="#">隐私政策</a>
            <a className="hover:text-[var(--lp-primary)]" href="/programs/list">节目入口</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
