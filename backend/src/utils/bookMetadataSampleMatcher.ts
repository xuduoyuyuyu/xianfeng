export type SourceBook = {
  title: string;
  author: string;
  publisher?: string;
};

export type MetadataCandidate = {
  title: string;
  author: string;
  publisher?: string;
  isbn?: string;
  cover?: string;
  description?: string;
  sourceId?: string;
  rating?: number;
  ratingCount?: number;
  ratingLabel?: string;
  source: string;
};

export type ScoredCandidate = MetadataCandidate & {
  matchScore: number;
  matchReason: string[];
};

const TITLE_FULL_MATCH_SCORE = 0.65;
const TITLE_PARTIAL_MATCH_SCORE = 0.35;
const AUTHOR_MATCH_SCORE = 0.25;
const AUTHOR_PARTIAL_MATCH_SCORE = 0.12;
const PUBLISHER_MATCH_SCORE = 0.1;
const TITLE_PARTIAL_AUTHOR_PUBLISHER_TRUST_SCORE = 0.88;
const TITLE_PARTIAL_AUTHOR_PARTIAL_PUBLISHER_TRUST_SCORE = 0.86;
const TITLE_EXACT_AUTHOR_PARTIAL_TRUST_SCORE = 0.86;
const TITLE_EXACT_AUTHOR_CLOSE_TRUST_SCORE = 0.86;
const TITLE_EXACT_AUTHOR_TRANSLITERATED_TRUST_SCORE = 0.85;
const AUTHOR_CLOSE_MATCH_SCORE = 0.16;
const AUTHOR_CLOSE_SIMILARITY_THRESHOLD = 0.7;
const AUTHOR_TRANSLITERATED_MATCH_SCORE = 0.12;
const AUTHOR_TRANSLITERATED_SIMILARITY_THRESHOLD = 0.5;
const AUTHOR_TRANSLITERATED_MIN_LENGTH = 5;
const TRAILING_TITLE_BRACKET_SUFFIX_PATTERN = /(?:[（(【\[][^）)】\]]+[）)】\]])+$/gu;
const AUTHOR_PREFIX_PATTERN = /^[\[(（【][^\])）】]{1,8}[\])）】]\s*/gu;
const AUTHOR_SUFFIX_PATTERN = /(著|编|绘|主编|口述)\s*$/gu;
const PUBLISHER_BRACKETED_CITY_PATTERN = /[（(【\[][^\])）】]{1,8}[\])）】]/gu;
const PUBLISHER_CORPORATE_SUFFIX_PATTERN = /(有限责任公司|有限公司|出版传媒集团|出版集团|集团|股份有限公司|股份)$/gu;

export function normalizeBookText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[（()【】\[\]]/g, "")
    .replace(/[·•・:：,，.。/／\-—_\s]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function firstAuthorChunk(author: string): string {
  return String(author || "")
    .split(/[\/／,，;；]/)[0]
    .replace(AUTHOR_PREFIX_PATTERN, "")
    .replace(AUTHOR_SUFFIX_PATTERN, "")
    .trim();
}

function normalizeTitleForMatch(title: string): string {
  return normalizeBookText(String(title || "").replace(TRAILING_TITLE_BRACKET_SUFFIX_PATTERN, "").trim());
}

function normalizeAuthorForMatch(author: string): string {
  return normalizeBookText(firstAuthorChunk(author));
}

function normalizePublisherForMatch(publisher: string): string {
  return normalizeBookText(
    String(publisher || "")
      .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
      .replace(PUBLISHER_BRACKETED_CITY_PATTERN, "")
      .replace(PUBLISHER_CORPORATE_SUFFIX_PATTERN, "")
      .replace(/^21世纪/, "二十一世纪")
  );
}

function calculateEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function calculateSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (!maxLength) return 0;
  return 1 - calculateEditDistance(a, b) / maxLength;
}

function scoreCandidate(source: SourceBook, candidate: MetadataCandidate): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  const sourceTitle = normalizeTitleForMatch(source.title);
  const candidateTitle = normalizeTitleForMatch(candidate.title);
  const sourceAuthor = normalizeAuthorForMatch(source.author);
  const candidateAuthor = normalizeAuthorForMatch(candidate.author);
  const sourcePublisher = normalizeBookText(source.publisher || "");
  const candidatePublisher = normalizeBookText(candidate.publisher || "");
  const sourcePublisherEquivalent = normalizePublisherForMatch(source.publisher || "");
  const candidatePublisherEquivalent = normalizePublisherForMatch(candidate.publisher || "");

  if (sourceTitle && candidateTitle) {
    if (sourceTitle === candidateTitle) {
      score += TITLE_FULL_MATCH_SCORE;
      reasons.push("title:exact");
    } else if (candidateTitle.includes(sourceTitle) || sourceTitle.includes(candidateTitle)) {
      score += TITLE_PARTIAL_MATCH_SCORE;
      reasons.push("title:partial");
    }
  }

  if (sourceAuthor && candidateAuthor) {
    if (sourceAuthor === candidateAuthor) {
      score += AUTHOR_MATCH_SCORE;
      reasons.push("author:exact");
    } else if (candidateAuthor.includes(sourceAuthor) || sourceAuthor.includes(candidateAuthor)) {
      score += AUTHOR_PARTIAL_MATCH_SCORE;
      reasons.push("author:partial");
    } else if (calculateSimilarity(sourceAuthor, candidateAuthor) >= AUTHOR_CLOSE_SIMILARITY_THRESHOLD) {
      score += AUTHOR_CLOSE_MATCH_SCORE;
      reasons.push("author:close");
    } else if (
      sourceAuthor.length >= AUTHOR_TRANSLITERATED_MIN_LENGTH &&
      candidateAuthor.length >= AUTHOR_TRANSLITERATED_MIN_LENGTH &&
      calculateSimilarity(sourceAuthor, candidateAuthor) >= AUTHOR_TRANSLITERATED_SIMILARITY_THRESHOLD
    ) {
      score += AUTHOR_TRANSLITERATED_MATCH_SCORE;
      reasons.push("author:transliterated");
    }
  }

  if (sourcePublisher && candidatePublisher && sourcePublisher === candidatePublisher) {
    score += PUBLISHER_MATCH_SCORE;
    reasons.push("publisher:exact");
  } else if (
    sourcePublisherEquivalent &&
    candidatePublisherEquivalent &&
    sourcePublisherEquivalent === candidatePublisherEquivalent
  ) {
    score += PUBLISHER_MATCH_SCORE;
    reasons.push("publisher:normalized");
  }

  if (
    reasons.includes("title:partial") &&
    reasons.includes("author:exact") &&
    (reasons.includes("publisher:exact") || reasons.includes("publisher:normalized"))
  ) {
    score = Math.max(score, TITLE_PARTIAL_AUTHOR_PUBLISHER_TRUST_SCORE);
    reasons.push("trusted:partial-title-author-publisher");
  }

  if (
    reasons.includes("title:partial") &&
    reasons.includes("author:partial") &&
    (reasons.includes("publisher:exact") || reasons.includes("publisher:normalized"))
  ) {
    score = Math.max(score, TITLE_PARTIAL_AUTHOR_PARTIAL_PUBLISHER_TRUST_SCORE);
    reasons.push("trusted:partial-title-partial-author-publisher");
  }

  if (reasons.includes("title:exact") && reasons.includes("author:partial")) {
    score = Math.max(score, TITLE_EXACT_AUTHOR_PARTIAL_TRUST_SCORE);
    reasons.push("trusted:exact-title-partial-author");
  }

  if (reasons.includes("title:exact") && reasons.includes("author:close")) {
    score = Math.max(score, TITLE_EXACT_AUTHOR_CLOSE_TRUST_SCORE);
    reasons.push("trusted:exact-title-close-author");
  }

  if (reasons.includes("title:exact") && reasons.includes("author:transliterated")) {
    score = Math.max(score, TITLE_EXACT_AUTHOR_TRANSLITERATED_TRUST_SCORE);
    reasons.push("trusted:exact-title-transliterated-author");
  }

  return {
    ...candidate,
    matchScore: Math.min(1, Number(score.toFixed(4))),
    matchReason: reasons,
  };
}

export function pickBestCandidate(source: SourceBook, candidates: MetadataCandidate[]): ScoredCandidate | null {
  const scored = candidates
    .map((candidate) => scoreCandidate(source, candidate))
    .sort((a, b) => b.matchScore - a.matchScore);
  return scored[0] || null;
}

export function scoreCandidates(source: SourceBook, candidates: MetadataCandidate[]): ScoredCandidate[] {
  return candidates
    .map((candidate) => scoreCandidate(source, candidate))
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function buildSearchAuthor(author: string): string {
  return firstAuthorChunk(author).replace(/[()\[\]（）【】]/g, "").trim();
}
