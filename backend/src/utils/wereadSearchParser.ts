import type { MetadataCandidate } from "./bookMetadataSampleMatcher";

type WereadState = {
  searchBooksStoreModule?: {
    bookInfos?: Array<{
      bookInfo?: {
        bookId?: string;
        title?: string;
        author?: string;
        cover?: string;
        intro?: string;
        publisher?: string;
        newRating?: number;
        newRatingCount?: number;
        newRatingDetail?: { title?: string };
      };
    }>;
  };
};

export function parseWereadSearchCandidates(html: string): MetadataCandidate[] {
  const match = String(html || "").match(/window\.__INITIAL_STATE__=(.*?);\(function\(\)/s);
  if (!match?.[1]) return [];

  let state: WereadState;
  try {
    state = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const items = Array.isArray(state?.searchBooksStoreModule?.bookInfos)
    ? state.searchBooksStoreModule.bookInfos
    : [];
  return items
    .map((item) => {
      const book = item?.bookInfo;
      if (!book?.title) return null;
      return {
        title: String(book.title || "").trim(),
        author: String(book.author || "").trim(),
        publisher: String(book.publisher || "").trim(),
        cover: String(book.cover || "").trim(),
        description: String(book.intro || "").trim(),
        sourceId: String(book.bookId || "").trim(),
        rating: typeof book.newRating === "number" ? book.newRating : undefined,
        ratingCount: typeof book.newRatingCount === "number" ? book.newRatingCount : undefined,
        ratingLabel: String(book.newRatingDetail?.title || "").trim(),
        isbn: "",
        source: "weread_web",
      } satisfies MetadataCandidate;
    })
    .filter(Boolean) as MetadataCandidate[];
}
