import fs from "node:fs/promises";
import path from "node:path";

import type { SampleMatchResult } from "../utils/bookMetadataSampleExport";
import { normalizeBookText } from "../utils/bookMetadataSampleMatcher";

type HighConfidencePayload = {
  matches?: SampleMatchResult[];
};

const DEFAULT_HIGH_CONFIDENCE_PATH =
  process.env.BOOK_METADATA_HIGH_CONFIDENCE_OUTPUT ||
  path.resolve(process.cwd(), "tmp/book-metadata-sample-high-confidence.json");

export async function loadHighConfidenceBookMetadata(filePath = DEFAULT_HIGH_CONFIDENCE_PATH): Promise<SampleMatchResult[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const payload = JSON.parse(raw) as HighConfidencePayload;
    return Array.isArray(payload?.matches) ? payload.matches : [];
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function findHighConfidenceBookMetadataByBookId(
  bookId: string,
  filePath = DEFAULT_HIGH_CONFIDENCE_PATH
): Promise<SampleMatchResult | null> {
  const matches = await loadHighConfidenceBookMetadata(filePath);
  return matches.find((item) => String(item?.sourceBook?._id || "") === String(bookId || "")) || null;
}

export type BookMetadataLookupSource = {
  _id?: string;
  title?: string;
  author?: string;
  publisher?: string;
  coverImage?: string;
};

function isSameBookByText(source: BookMetadataLookupSource, match: SampleMatchResult): boolean {
  const sourceTitle = normalizeBookText(source.title || "");
  const matchTitle = normalizeBookText(match?.sourceBook?.title || match?.bestMatch?.title || "");
  if (!sourceTitle || !matchTitle || sourceTitle !== matchTitle) return false;

  const sourceAuthor = normalizeBookText(source.author || "");
  const matchAuthor = normalizeBookText(match?.sourceBook?.author || match?.bestMatch?.author || "");
  const sourcePublisher = normalizeBookText(source.publisher || "");
  const matchPublisher = normalizeBookText(match?.sourceBook?.publisher || match?.bestMatch?.publisher || "");

  if (sourceAuthor && matchAuthor && (sourceAuthor.includes(matchAuthor) || matchAuthor.includes(sourceAuthor))) {
    return true;
  }

  return Boolean(sourcePublisher && matchPublisher && sourcePublisher === matchPublisher);
}

export async function findHighConfidenceBookMetadataForBook(
  source: BookMetadataLookupSource,
  filePath = DEFAULT_HIGH_CONFIDENCE_PATH
): Promise<SampleMatchResult | null> {
  const matches = await loadHighConfidenceBookMetadata(filePath);
  return findHighConfidenceBookMetadataInMatches(source, matches);
}

export function findHighConfidenceBookMetadataInMatches(
  source: BookMetadataLookupSource,
  matches: SampleMatchResult[]
): SampleMatchResult | null {
  const id = String(source?._id || "");
  const byId = id ? matches.find((item) => String(item?.sourceBook?._id || "") === id) : null;
  if (byId) return byId;
  return matches.find((item) => isSameBookByText(source, item)) || null;
}

export function remapHighConfidenceBookMetadataMatchesToBooks(
  books: BookMetadataLookupSource[],
  matches: SampleMatchResult[]
): SampleMatchResult[] {
  const seenBookIds = new Set<string>();
  const remapped: SampleMatchResult[] = [];

  for (const book of books) {
    const bookId = String(book?._id || "").trim();
    if (!bookId || seenBookIds.has(bookId)) continue;

    const match = findHighConfidenceBookMetadataInMatches(book, matches);
    if (!match) continue;

    seenBookIds.add(bookId);
    remapped.push({
      ...match,
      sourceBook: {
        ...match.sourceBook,
        _id: bookId,
        title: String(book.title || match.sourceBook?.title || ""),
        author: String(book.author || match.sourceBook?.author || ""),
        publisher: String(book.publisher || match.sourceBook?.publisher || ""),
        coverImage: String(book.coverImage || match.sourceBook?.coverImage || ""),
      },
    });
  }

  return remapped;
}
