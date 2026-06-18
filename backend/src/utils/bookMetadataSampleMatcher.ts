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
    .replace(/\b(著|编|绘|主编|口述)\b/gu, "")
    .trim();
}

function scoreCandidate(source: SourceBook, candidate: MetadataCandidate): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  const sourceTitle = normalizeBookText(source.title);
  const candidateTitle = normalizeBookText(candidate.title);
  const sourceAuthor = normalizeBookText(firstAuthorChunk(source.author));
  const candidateAuthor = normalizeBookText(firstAuthorChunk(candidate.author));
  const sourcePublisher = normalizeBookText(source.publisher || "");
  const candidatePublisher = normalizeBookText(candidate.publisher || "");

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
    }
  }

  if (sourcePublisher && candidatePublisher && sourcePublisher === candidatePublisher) {
    score += PUBLISHER_MATCH_SCORE;
    reasons.push("publisher:exact");
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
