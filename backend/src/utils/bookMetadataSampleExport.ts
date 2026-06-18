import type { ScoredCandidate } from "./bookMetadataSampleMatcher";

export type SampleMatchResult = {
  sourceBook: {
    _id: string;
    title: string;
    author: string;
    publisher: string;
    coverImage: string;
  };
  bestMatch: ScoredCandidate | null;
  candidates: ScoredCandidate[];
  errors: string[];
};

export function buildHighConfidenceMatches(results: SampleMatchResult[], minScore: number) {
  return results.filter((item) => (item.bestMatch?.matchScore || 0) >= minScore);
}
