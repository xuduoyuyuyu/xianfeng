import { isJdLikeWorthBuyUrl, parseWorthBuyInput, refineWorthBuyTitle } from "./worthBuyInput";

export interface WorthBuyNormalizedResult {
  url?: string | null;
  brand?: string | null;
  score: number;
  isIqTax: boolean;
  reason: string;
  pros: string[];
  cons: string[];
  businessModel: string;
  commentAnalysis: string;
  recommendation: string;
  analyzedAt: string;
  priceRange?: string;
  ratingDimensions?: {
    cost: number;
    quality: number;
    safety: number;
    experience: number;
    afterSales: number;
  };
  dataPoints?: string[];
  references?: { title: string; url: string; type: string }[];
  suitableFor?: string[];
  notSuitableFor?: string[];
  alternatives?: { name: string; price: string; score: number; reason: string }[];
  buyAdvice?: string;
}

function clampScore(value: unknown, fallback = 50): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, number));
}

function asText(value: unknown): string {
  return String(value || "").trim();
}

function toStringArray(value: unknown, max = 5): string[] {
  return Array.isArray(value)
    ? value.map((item) => asText(item)).filter(Boolean).slice(0, max)
    : [];
}

function buildFallbackDataPoints(input: {
  title: string;
  reason: string;
  pros: string[];
  cons: string[];
  recommendation: string;
}): string[] {
  return [
    input.title ? `识别商品：${input.title}` : "",
    input.reason,
    ...input.pros.slice(0, 2),
    ...input.cons.slice(0, 2),
    input.recommendation,
  ].map(asText).filter(Boolean).slice(0, 6);
}

function buildFallbackBusinessModel(title: string, pros: string[], cons: string[]): string {
  const product = title || "该商品";
  const sellingPoint = pros[0] || "品牌、功能或使用场景";
  const risk = cons[0] || "参数和真实体验仍需核实";
  return `${product}的推荐动机通常围绕“${sellingPoint}”展开；如果来自达人种草、平台活动或返佣链接，需要同时核对价格、认证和真实使用反馈，避免只被卖点包装影响。当前主要不确定点是：${risk}。`;
}

function buildFallbackCommentAnalysis(title: string, dataPoints: string[]): string {
  const product = title || "该商品";
  const evidence = dataPoints[0] || "商品标题和现有分析依据";
  return `${product}目前缺少可量化的评论样本，不能仅凭单条分享文案判断口碑。建议重点查看差评、追评和带图评论，尤其核对护眼效果、稳定性、售后和长期使用体验；当前可用依据包括：${evidence}。`;
}

function chooseDetailedTitle(shortTitle: string, fallbackTitle: string): string {
  const refinedShortTitle = refineWorthBuyTitle(shortTitle);
  if (refinedShortTitle && refinedShortTitle !== shortTitle && refinedShortTitle.length >= 4) {
    return refinedShortTitle;
  }
  if (shortTitle && fallbackTitle && shortTitle.includes(fallbackTitle) && shortTitle.length >= fallbackTitle.length + 6) {
    return fallbackTitle;
  }
  if (fallbackTitle && shortTitle && fallbackTitle.includes(shortTitle) && fallbackTitle.length >= shortTitle.length + 6) {
    return fallbackTitle;
  }
  return shortTitle || fallbackTitle;
}

export function resolveWorthBuyDisplayTitle(query: string, result?: any): string {
  const cleanQuery = asText(query);
  const extractedTitle = parseWorthBuyInput(cleanQuery).extractedTitle;
  const rawTitle = asText(result?.brand) || asText(result?.title);
  return extractedTitle || chooseDetailedTitle(rawTitle, cleanQuery) || "分析结果";
}

function isGenericJdText(value: unknown): boolean {
  const compact = asText(value)
    .replace(/\s+/g, "")
    .replace(/[，,。；;:：｜|_\-—–]+/g, "");
  return [
    "多快好省购物上京东",
    "购物上京东",
    "京东",
    "京东JD.COM",
    "JDCOM",
  ].includes(compact);
}

export function isInvalidWorthBuyResultForQuery(query: string, result?: any): boolean {
  const cleanQuery = asText(query);
  const parsedUrl = parseWorthBuyInput(cleanQuery).url;
  const resultUrl = asText(result?.url);
  const url = parsedUrl || (/^https?:\/\//i.test(cleanQuery) ? cleanQuery : resultUrl);
  if (!url || !isJdLikeWorthBuyUrl(url)) return false;

  const hasGenericTitle = isGenericJdText(result?.brand) || isGenericJdText(result?.title);
  const reason = asText(result?.reason);
  const saysNoProduct = /页面无有效商品信息|京东平台通用提示|无法进行分析|无法提取商品信息|无法获取商品信息|页面无法访问|活动火爆|加载失败/.test(reason);
  const zeroScore = Number(result?.score) === 0;
  return hasGenericTitle || saysNoProduct || (zeroScore && /无法|失败|无有效/.test(reason));
}

export function normalizeWorthBuyResult(raw: any, fallbackTitle = "分析结果"): WorthBuyNormalizedResult {
  const pros = toStringArray(raw?.pros?.length ? raw.pros : raw?.strengths, 5);
  const cons = toStringArray(raw?.cons?.length ? raw.cons : raw?.risks, 5);
  const suggestions = toStringArray(raw?.suggestions, 3);
  const evidence = toStringArray(raw?.dataPoints?.length ? raw.dataPoints : raw?.evidence, 8);
  const reason = asText(raw?.reason) || asText(raw?.verdict) || asText(raw?.summary) || "资料不足，需结合实际需求进一步判断。";
  const brand = chooseDetailedTitle(asText(raw?.brand) || asText(raw?.title), fallbackTitle) || "分析结果";
  const recommendation = asText(raw?.recommendation) || suggestions.join("；") || reason;
  const dataPoints = evidence.length ? evidence : buildFallbackDataPoints({ title: brand, reason, pros, cons, recommendation });

  return {
    ...raw,
    brand,
    score: clampScore(raw?.score, 50),
    isIqTax: Boolean(raw?.isIqTax),
    reason,
    pros,
    cons,
    businessModel: asText(raw?.businessModel) || buildFallbackBusinessModel(brand, pros, cons),
    commentAnalysis: asText(raw?.commentAnalysis) || buildFallbackCommentAnalysis(brand, dataPoints),
    recommendation,
    analyzedAt: asText(raw?.analyzedAt) || new Date().toISOString(),
    ratingDimensions: {
      cost: clampScore(raw?.ratingDimensions?.cost, 50),
      quality: clampScore(raw?.ratingDimensions?.quality, 50),
      safety: clampScore(raw?.ratingDimensions?.safety, 50),
      experience: clampScore(raw?.ratingDimensions?.experience, 50),
      afterSales: clampScore(raw?.ratingDimensions?.afterSales, 50),
    },
    dataPoints,
    suitableFor: toStringArray(raw?.suitableFor, 5),
    notSuitableFor: toStringArray(raw?.notSuitableFor, 5),
    alternatives: Array.isArray(raw?.alternatives) ? raw.alternatives : [],
    buyAdvice: asText(raw?.buyAdvice),
  };
}
