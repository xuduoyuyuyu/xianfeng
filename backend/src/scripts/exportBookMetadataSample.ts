import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSearchAuthor,
  type MetadataCandidate,
  pickBestCandidate,
  scoreCandidates,
  type SourceBook,
} from "../utils/bookMetadataSampleMatcher";
import { buildHighConfidenceMatches, type SampleMatchResult } from "../utils/bookMetadataSampleExport";
import { parseWereadSearchCandidates } from "../utils/wereadSearchParser";

type RemoteBook = {
  _id: string;
  title: string;
  author: string;
  publisher?: string;
  coverImage?: string;
  status?: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REMOTE_BOOKS_API = process.env.REMOTE_BOOKS_API || "https://xianfeng.xinzhi.info/api/books";
const DEFAULT_OUTPUT_FILE = path.resolve(__dirname, "../../tmp/book-metadata-sample-report.json");
const DEFAULT_HIGH_CONFIDENCE_OUTPUT_FILE = path.resolve(
  __dirname,
  "../../tmp/book-metadata-sample-high-confidence.json"
);
const SAMPLE_LIMIT = Number(process.env.BOOK_METADATA_SAMPLE_LIMIT || 0);
const HIGH_CONFIDENCE_THRESHOLD = Number(process.env.BOOK_METADATA_HIGH_CONFIDENCE_THRESHOLD || 0.85);
const REQUEST_TIMEOUT_MS = Number(process.env.BOOK_METADATA_REQUEST_TIMEOUT_MS || 10_000);
const MATCH_CONCURRENCY = Math.max(1, Number(process.env.BOOK_METADATA_MATCH_CONCURRENCY || 4));
const DEFAULT_SOURCES = (process.env.BOOK_METADATA_SOURCES || "weread,google_books,open_library")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const PREFERRED_TITLES = ["秘密花园", "时间机器", "三国演义", "呼兰河传", "牧羊少年奇幻之旅"];
const TRAILING_TITLE_BRACKET_SUFFIX_PATTERN = /(?:[（(【\[][^）)】\]]+[）)】\]])+$/gu;

function parseArgs() {
  const titlesArg = process.argv.find((arg) => arg.startsWith("--titles="));
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const sourcesArg = process.argv.find((arg) => arg.startsWith("--sources="));
  const titles = titlesArg
    ? titlesArg
        .slice("--titles=".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) || 0 : SAMPLE_LIMIT;
  const sources = sourcesArg
    ? sourcesArg
        .slice("--sources=".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : DEFAULT_SOURCES;
  return { titles, limit, sources: new Set(sources) };
}

function isPrimaryWereadFullExport(sources: Set<string>, limit: number, titles: string[]) {
  return sources.size === 1 && sources.has("weread") && limit <= 0 && titles.length === 0;
}

function buildOutputPaths(sources: Set<string>, limit: number, titles: string[]) {
  const explicitOutput = process.env.BOOK_METADATA_OUTPUT;
  const explicitHighConfidenceOutput = process.env.BOOK_METADATA_HIGH_CONFIDENCE_OUTPUT;
  const sourceSlug = Array.from(sources).sort().join("-") || "unknown";
  const scopeSlug = limit > 0 ? `limit-${limit}` : titles.length ? `titles-${titles.length}` : "full";

  if (isPrimaryWereadFullExport(sources, limit, titles)) {
    return {
      outputFile: explicitOutput || DEFAULT_OUTPUT_FILE,
      highConfidenceOutputFile: explicitHighConfidenceOutput || DEFAULT_HIGH_CONFIDENCE_OUTPUT_FILE,
    };
  }

  return {
    outputFile:
      explicitOutput ||
      path.resolve(__dirname, `../../tmp/book-metadata-sample-report.${sourceSlug}.${scopeSlug}.json`),
    highConfidenceOutputFile:
      explicitHighConfidenceOutput ||
      path.resolve(__dirname, `../../tmp/book-metadata-sample-high-confidence.${sourceSlug}.${scopeSlug}.json`),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "User-Agent": "xianfeng-book-metadata-sample/1.0",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function pickSampleBooks(allBooks: RemoteBook[], requestedTitles: string[], limit: number) {
  const published = allBooks.filter((item) => item.status === "published");
  if (!requestedTitles.length && limit <= 0) return published;

  const selected: RemoteBook[] = [];
  const usedIds = new Set<string>();
  const titles = requestedTitles.length > 0 ? requestedTitles : PREFERRED_TITLES;

  for (const title of titles) {
    const found = published.find((item) => item.title === title);
    if (found && !usedIds.has(found._id)) {
      selected.push(found);
      usedIds.add(found._id);
    }
  }

  for (const item of published) {
    if (limit > 0 && selected.length >= limit) break;
    if (usedIds.has(item._id)) continue;
    selected.push(item);
    usedIds.add(item._id);
  }

  return limit > 0 ? selected.slice(0, limit) : selected;
}

async function searchGoogleBooks(book: SourceBook): Promise<MetadataCandidate[]> {
  const author = buildSearchAuthor(book.author);
  const q = [`intitle:${book.title}`, author ? `inauthor:${author}` : ""].filter(Boolean).join("+");
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books&langRestrict=zh`;
  const payload = await fetchJson<any>(url);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((item: any) => ({
    title: String(item?.volumeInfo?.title || "").trim(),
    author: Array.isArray(item?.volumeInfo?.authors) ? item.volumeInfo.authors.join(" / ") : "",
    publisher: String(item?.volumeInfo?.publisher || "").trim(),
    isbn:
      item?.volumeInfo?.industryIdentifiers?.find((row: any) => row?.type === "ISBN_13")?.identifier ||
      item?.volumeInfo?.industryIdentifiers?.[0]?.identifier ||
      "",
    cover:
      item?.volumeInfo?.imageLinks?.thumbnail ||
      item?.volumeInfo?.imageLinks?.smallThumbnail ||
      "",
    source: "google_books",
  }));
}

async function searchWereadWeb(book: SourceBook): Promise<MetadataCandidate[]> {
  const primaryKeyword = [book.title, buildSearchAuthor(book.author)].filter(Boolean).join(" ");
  const titleKeyword = String(book.title || "").replace(TRAILING_TITLE_BRACKET_SUFFIX_PATTERN, "").trim();
  const keywords = Array.from(new Set([primaryKeyword, titleKeyword, book.title].filter(Boolean)));
  const candidates: MetadataCandidate[] = [];

  for (const keyword of keywords) {
    const url = `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(keyword)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`${url} -> ${response.status}`);
    }
    candidates.push(...parseWereadSearchCandidates(await response.text()));
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.sourceId || `${candidate.title}::${candidate.author}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchOpenLibrary(book: SourceBook): Promise<MetadataCandidate[]> {
  const author = buildSearchAuthor(book.author);
  const params = new URLSearchParams({
    title: book.title,
    limit: "5",
  });
  if (author) params.set("author", author);
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  const payload = await fetchJson<any>(url);
  const docs = Array.isArray(payload?.docs) ? payload.docs : [];
  return docs.map((item: any) => ({
    title: String(item?.title || "").trim(),
    author: Array.isArray(item?.author_name) ? item.author_name.join(" / ") : "",
    publisher: Array.isArray(item?.publisher) ? String(item.publisher[0] || "").trim() : "",
    isbn: Array.isArray(item?.isbn) ? String(item.isbn[0] || "").trim() : "",
    cover: item?.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg` : "",
    source: "open_library",
  }));
}

function formatFetchError(error: any) {
  const cause = error?.cause;
  return [error?.message || String(error), cause?.code, cause?.hostname].filter(Boolean).join(":");
}

async function matchBook(book: RemoteBook, sources: Set<string>) {
  const source: SourceBook = {
    title: book.title,
    author: book.author,
    publisher: book.publisher || "",
  };

  const errors: string[] = [];
  let candidates: MetadataCandidate[] = [];

  if (sources.has("weread") || sources.has("weread_web")) {
    try {
      candidates = candidates.concat(await searchWereadWeb(source));
    } catch (error: any) {
      errors.push(`weread_web:${formatFetchError(error)}`);
    }
  }

  if (sources.has("google") || sources.has("google_books")) {
    try {
      candidates = candidates.concat(await searchGoogleBooks(source));
    } catch (error: any) {
      errors.push(`google_books:${formatFetchError(error)}`);
    }
  }

  if (sources.has("open_library") || sources.has("openlibrary")) {
    try {
      candidates = candidates.concat(await searchOpenLibrary(source));
    } catch (error: any) {
      errors.push(`open_library:${formatFetchError(error)}`);
    }
  }

  const scored = scoreCandidates(source, candidates).slice(0, 5);
  const best = pickBestCandidate(source, candidates);

  return {
    sourceBook: {
      _id: book._id,
      title: book.title,
      author: book.author,
      publisher: book.publisher || "",
      coverImage: book.coverImage || "",
    },
    bestMatch: best,
    candidates: scored,
    errors,
  };
}

async function matchBooksWithConcurrency(sampleBooks: RemoteBook[], sources: Set<string>) {
  const results: SampleMatchResult[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < sampleBooks.length) {
      const index = nextIndex;
      nextIndex += 1;
      const book = sampleBooks[index];
      console.log(`[sample-match] ${index + 1}/${sampleBooks.length} ${book.title} / ${book.author}`);
      results[index] = await matchBook(book, sources);
    }
  }

  await Promise.all(Array.from({ length: Math.min(MATCH_CONCURRENCY, sampleBooks.length) }, () => worker()));
  return results;
}

async function main() {
  const { titles, limit, sources } = parseArgs();
  const { outputFile, highConfidenceOutputFile } = buildOutputPaths(sources, limit, titles);
  const books = await fetchJson<RemoteBook[]>(REMOTE_BOOKS_API);
  const sampleBooks = pickSampleBooks(Array.isArray(books) ? books : [], titles, limit);
  const results = await matchBooksWithConcurrency(sampleBooks, sources);

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(
    outputFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        remoteBooksApi: REMOTE_BOOKS_API,
        sources: Array.from(sources),
        sampleCount: sampleBooks.length,
        sampleTitles: sampleBooks.map((item) => item.title),
        results,
      },
      null,
      2
    ),
    "utf8"
  );

  const highConfidenceMatches = buildHighConfidenceMatches(results, HIGH_CONFIDENCE_THRESHOLD);
  await fs.writeFile(
    highConfidenceOutputFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        remoteBooksApi: REMOTE_BOOKS_API,
        sources: Array.from(sources),
        threshold: HIGH_CONFIDENCE_THRESHOLD,
        matchCount: highConfidenceMatches.length,
        matches: highConfidenceMatches,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        output: outputFile,
        highConfidenceOutput: highConfidenceOutputFile,
        sampleCount: sampleBooks.length,
        highConfidenceCount: highConfidenceMatches.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[export-book-metadata-sample] failed", error);
  process.exit(1);
});
