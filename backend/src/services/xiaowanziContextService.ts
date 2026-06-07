export type XiaowanziSiteCardType = "topic" | "program" | "guest" | "material" | "book";

export type XiaowanziSiteCard = {
  type: XiaowanziSiteCardType;
  typeLabel: string;
  title: string;
  summary: string;
  href: string;
};

export type XiaowanziTraceStep = {
  label: string;
  status: "hit" | "miss" | "fallback";
  detail: string;
};

export type XiaowanziRagSummary = {
  status: string;
  provider: string;
  citationCount: number;
};

export type XiaowanziContextPayload = {
  trace: XiaowanziTraceStep[];
  cards: XiaowanziSiteCard[];
  promptBlock: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compact(value: string, max = 160): string {
  const text = asText(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function withXiaowanziReturnParams(href: string): string {
  const clean = asText(href) || "/";
  const [path, hash = ""] = clean.split("#");
  const separator = path.includes("?") ? "&" : "?";
  const hasLayer = /(?:\?|&)xw_layer=/.test(path);
  const hasReturn = /(?:\?|&)xw_return=/.test(path);
  const params = [
    hasLayer ? "" : "xw_layer=1",
    hasReturn ? "" : "xw_return=xiaowanzi",
  ].filter(Boolean).join("&");
  const nextPath = params ? `${path}${separator}${params}` : path;
  return hash ? `${nextPath}#${hash}` : nextPath;
}

export function normalizeSiteCards(cards: XiaowanziSiteCard[]): XiaowanziSiteCard[] {
  return cards
    .map((card) => ({
      type: card.type,
      typeLabel: compact(card.typeLabel, 12),
      title: compact(card.title, 48),
      summary: compact(card.summary, 110),
      href: withXiaowanziReturnParams(card.href),
    }))
    .filter((card) => card.title && card.href)
    .slice(0, 6);
}

export function formatSiteCardsPromptBlock(cards: XiaowanziSiteCard[]): string {
  const normalized = normalizeSiteCards(cards);
  if (!normalized.length) return "";
  return [
    "[站内优先推荐]",
    "以下内容来自家长先疯站内结构化内容，回答时优先参考，并在适合时推荐用户继续阅读这些卡片。",
    ...normalized.map((card, index) => `[${index + 1}] ${card.typeLabel}: ${card.title}\n${card.summary}`),
  ].join("\n");
}

export function buildXiaowanziContextPayload(params: {
  query: string;
  siteCards: XiaowanziSiteCard[];
  rag: XiaowanziRagSummary;
  localPromptBlock: string;
}): XiaowanziContextPayload {
  const cards = normalizeSiteCards(params.siteCards);
  const sitePromptBlock = formatSiteCardsPromptBlock(cards);
  const ragHit = params.rag.provider === "weknora" && params.rag.citationCount > 0 && params.rag.status === "weknora_hit";
  const promptBlock = [sitePromptBlock, asText(params.localPromptBlock)].filter(Boolean).join("\n\n");
  const trace: XiaowanziTraceStep[] = [
    {
      label: "查找站内结构化内容",
      status: cards.length ? "hit" : "miss",
      detail: cards.length ? `命中 ${cards.length} 条站内内容，优先用于回答和推荐阅读` : "站内节目、请教一下、资料等没有明确命中",
    },
    {
      label: "查询关联知识库",
      status: ragHit ? "hit" : "miss",
      detail: ragHit ? `命中 ${params.rag.citationCount} 条知识库片段` : "知识库没有可用命中或当前未启用",
    },
  ];
  if (!cards.length && !ragHit) {
    trace.push({
      label: "宽泛补充",
      status: "fallback",
      detail: "站内和知识库不足时，才使用通用教育经验补充，并提示依据有限",
    });
  }
  return { trace, cards, promptBlock };
}
