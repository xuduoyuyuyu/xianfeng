import fs from "node:fs/promises";
import path from "node:path";

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

const REMOTE_BOOKS_API = process.env.REMOTE_BOOKS_API || "https://xianfeng.xinzhi.info/api/books";
const OUTPUT_FILE = process.env.BOOK_METADATA_OUTPUT || path.resolve(process.cwd(), "tmp/book-metadata-sample-report.json");
const HIGH_CONFIDENCE_OUTPUT_FILE =
  process.env.BOOK_METADATA_HIGH_CONFIDENCE_OUTPUT ||
  path.resolve(process.cwd(), "tmp/book-metadata-sample-high-confidence.json");
const SAMPLE_LIMIT = Number(process.env.BOOK_METADATA_SAMPLE_LIMIT || 5);
const HIGH_CONFIDENCE_THRESHOLD = Number(process.env.BOOK_METADATA_HIGH_CONFIDENCE_THRESHOLD || 0.85);
const PREFERRED_TITLES = ["秘密花园", "时间机器", "三国演义", "呼兰河传", "牧羊少年奇幻之旅"];

function parseArgs() {
  const titlesArg = process.argv.find((arg) => arg.startsWith("--titles="));
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const titles = titlesArg
    ? titlesArg
        .slice("--titles=".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) || SAMPLE_LIMIT : SAMPLE_LIMIT;
  return { titles, limit };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
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
    if (selected.length >= limit) break;
    if (usedIds.has(item._id)) continue;
    selected.push(item);
    usedIds.add(item._id);
  }

  return selected.slice(0, limit);
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
  const keyword = [book.title, buildSearchAuthor(book.author)].filter(Boolean).join(" ");
  const url = `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return parseWereadSearchCandidates(await response.text());
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

async function matchBook(book: RemoteBook) {
  const source: SourceBook = {
    title: book.title,
    author: book.author,
    publisher: book.publisher || "",
  };

  const errors: string[] = [];
  let candidates: MetadataCandidate[] = [];

  try {
    candidates = candidates.concat(await searchWereadWeb(source));
  } catch (error: any) {
    errors.push(`weread_web:${error?.message || String(error)}`);
  }

  try {
    candidates = candidates.concat(await searchGoogleBooks(source));
  } catch (error: any) {
    errors.push(`google_books:${error?.message || String(error)}`);
  }

  try {
    candidates = candidates.concat(await searchOpenLibrary(source));
  } catch (error: any) {
    errors.push(`open_library:${error?.message || String(error)}`);
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

async function main() {
  const { titles, limit } = parseArgs();
  const books = await fetchJson<RemoteBook[]>(REMOTE_BOOKS_API);
  const sampleBooks = pickSampleBooks(Array.isArray(books) ? books : [], titles, limit);
  const results: SampleMatchResult[] = [];

  for (const book of sampleBooks) {
    console.log(`[sample-match] ${book.title} / ${book.author}`);
    results.push(await matchBook(book));
  }

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        remoteBooksApi: REMOTE_BOOKS_API,
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
    HIGH_CONFIDENCE_OUTPUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        remoteBooksApi: REMOTE_BOOKS_API,
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
        output: OUTPUT_FILE,
        highConfidenceOutput: HIGH_CONFIDENCE_OUTPUT_FILE,
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
