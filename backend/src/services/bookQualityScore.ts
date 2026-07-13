export type BookQualityTier = "normal" | "missing_description" | "fallback_cover";

export type BookQualityLevel = "完整可信" | "较完整" | "待补充" | "低完整" | "强降级";

export interface BookQualityScore {
  totalScore: number;
  rawScore: number;
  contentScore: number;
  confidenceScore: number;
  tier: BookQualityTier;
  level: BookQualityLevel;
  reasons: string[];
}

const TIER_ORDER: Record<BookQualityTier, number> = {
  normal: 0,
  missing_description: 1,
  fallback_cover: 2,
};

export function compareBookQualityScores(left: BookQualityScore, right: BookQualityScore): number {
  const tierDiff = TIER_ORDER[left.tier] - TIER_ORDER[right.tier];
  if (tierDiff !== 0) return tierDiff;
  return right.totalScore - left.totalScore;
}

type BookQualityInput = {
  title?: unknown;
  author?: unknown;
  publisher?: unknown;
  isbn?: unknown;
  publishedDate?: unknown;
  grade?: unknown;
  categoryLabel?: unknown;
  topic?: unknown;
  coverImage?: unknown;
  description?: unknown;
  sourceName?: unknown;
  sourceGuestId?: unknown;
};

type BookMetadataQualityInput = {
  cover?: unknown;
  description?: unknown;
  source?: unknown;
  sourceId?: unknown;
  matchScore?: unknown;
  reviewedAt?: unknown;
} | null | undefined;

const PLACEHOLDER_TAGS = new Set(["未标注", "暂无", "其他", "无", "-"]);

function text(value: unknown): string {
  return String(value || "").trim();
}

function hasValue(value: unknown): boolean {
  return Boolean(text(value));
}

export function hasRealBookCover(value: unknown): boolean {
  const normalized = text(value).toLowerCase();
  return Boolean(normalized)
    && !normalized.includes("via.placeholder.com")
    && !normalized.includes("placeholder")
    && !normalized.includes("jiyue-logo.png");
}

function effectiveDescription(book: BookQualityInput, metadata: BookMetadataQualityInput): string {
  return text(metadata?.description || book.description);
}

function effectiveCover(book: BookQualityInput, metadata: BookMetadataQualityInput): string {
  const metadataCover = text(metadata?.cover);
  return hasRealBookCover(metadataCover) ? metadataCover : text(book.coverImage);
}

function descriptionLength(value: string): number {
  return value.replace(/\s/g, "").length;
}

function validTags(book: BookQualityInput): string[] {
  const values = [book.grade, book.categoryLabel, book.topic]
    .flatMap((value) => text(value).split(/[,，、/|;；]+/))
    .map((value) => value.trim())
    .filter((value) => value && !PLACEHOLDER_TAGS.has(value));
  return [...new Set(values)];
}

function levelForScore(score: number): BookQualityLevel {
  if (score >= 90) return "完整可信";
  if (score >= 75) return "较完整";
  if (score >= 60) return "待补充";
  if (score >= 31) return "低完整";
  return "强降级";
}

function normalizedMatchScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const percentage = parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.min(100, Math.max(0, percentage));
}

function calculateConfidenceScore(book: BookQualityInput, metadata: BookMetadataQualityInput, reasons: string[]): number {
  if (metadata?.reviewedAt) return 25;
  if (metadata) {
    const matchPoints = Math.round(normalizedMatchScore(metadata.matchScore) * 0.2);
    const hasSource = hasValue(metadata.source);
    const hasSourceId = hasValue(metadata.sourceId);
    const sourcePoints = hasSource && hasSourceId ? 5 : hasSource ? 3 : 0;
    const score = Math.min(25, matchPoints + sourcePoints);
    if (!hasSource) reasons.push("无详情来源证据");
    if (!matchPoints) reasons.push("无有效匹配置信度");
    return score;
  }
  if (hasValue(book.sourceGuestId)) return 15;
  if (hasValue(book.sourceName)) return 10;
  reasons.push("无来源证据");
  return 0;
}

export function calculateBookQualityScore(
  book: BookQualityInput,
  metadata: BookMetadataQualityInput
): BookQualityScore {
  const reasons: string[] = [];
  const cover = effectiveCover(book, metadata);
  const description = effectiveDescription(book, metadata);
  const introLength = descriptionLength(description);
  const tags = validTags(book);
  let contentScore = 0;

  if (hasRealBookCover(cover)) contentScore += 20;
  else reasons.push("缺少真实封面");

  if (introLength >= 50) contentScore += 20;
  else if (introLength >= 20) {
    contentScore += 12;
    reasons.push("简介少于50字");
  } else if (introLength > 0) {
    contentScore += 5;
    reasons.push("简介少于20字");
  } else reasons.push("简介为空");

  const tagPoints = tags.length >= 4 ? 15 : tags.length === 3 ? 11 : tags.length === 2 ? 7 : tags.length === 1 ? 3 : 0;
  contentScore += tagPoints;
  if (tags.length < 4) reasons.push(`有效标签仅${tags.length}个`);

  const source = metadata?.source || book.sourceName;
  const coreFields: Array<[unknown, number, string]> = [
    [book.title, 2, "标题"],
    [book.author, 4, "作者"],
    [book.publisher, 3, "出版社"],
    [book.isbn, 3, "ISBN"],
    [book.publishedDate, 2, "出版日期"],
    [book.grade, 2, "年级/年龄"],
    [book.categoryLabel, 1, "分类"],
    [book.topic, 1, "主题"],
    [source, 2, "来源"],
  ];
  for (const [value, points, label] of coreFields) {
    if (hasValue(value)) contentScore += points;
    else reasons.push(`缺${label}`);
  }

  const confidenceScore = calculateConfidenceScore(book, metadata, reasons);
  const rawScore = contentScore + confidenceScore;
  const hasCover = hasRealBookCover(cover);
  let tier: BookQualityTier = "normal";
  let totalScore = rawScore;

  if (!hasCover) {
    tier = "fallback_cover";
    const cap = introLength > 0 ? 15 : 10;
    totalScore = Math.min(rawScore, cap);
    reasons.push(introLength > 0
      ? "兜底封面，强制末位并封顶15分"
      : "兜底封面且简介为空，强制末位并封顶10分");
  } else if (!introLength) {
    tier = "missing_description";
    totalScore = Math.min(rawScore, 30);
    reasons.push("简介为空，进入倒数第二组并封顶30分");
  }

  return {
    totalScore,
    rawScore,
    contentScore,
    confidenceScore,
    tier,
    level: levelForScore(totalScore),
    reasons,
  };
}
