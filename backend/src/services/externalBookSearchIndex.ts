import ExternalBookSearchDocument from "../models/ExternalBookSearchDocument";
import SystemSetting from "../models/SystemSetting";

export const READLY_BOOK_PAGE_URL = "https://api.shuyu.xin/readly/api/ma/book/page";
export const EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY = "external_book_search_index_v1";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 4;

type ExternalBookPage = {
  records: any[];
  total: number;
  size: number;
  current: number;
  pages: number;
};

type ExternalBookSearchIndexPage = ExternalBookPage;

type ExternalBookSearchIndexSyncOptions = {
  pageSize?: number;
  concurrency?: number;
  fetchPage?: (current: number, size: number) => Promise<ExternalBookPage>;
  onProgress?: (progress: { completedPages: number; totalPages: number }) => void;
};

function text(value: unknown): string {
  return String(value || "").trim();
}

async function fetchExternalBookIndexPage(current: number, size: number): Promise<ExternalBookPage> {
  const upstreamUrl = new URL(READLY_BOOK_PAGE_URL);
  upstreamUrl.searchParams.set("current", String(current));
  upstreamUrl.searchParams.set("size", String(size));
  const response = await fetch(upstreamUrl, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`外部书库返回 ${response.status}`);
  const payload = await response.json() as any;
  const data = payload && typeof payload === "object" ? payload.data : null;
  const records = Array.isArray(data?.records) ? data.records : [];
  return {
    records,
    total: Number(data?.total || 0),
    size: Number(data?.size || size),
    current: Number(data?.current || current),
    pages: Number(data?.pages || 0),
  };
}

function toSearchDocument(record: any, syncedAt: Date) {
  const externalBookId = text(record?.id || record?._id);
  const title = text(record?.title || record?.name);
  if (!externalBookId || !title) return null;
  return {
    externalBookId,
    title,
    author: text(record?.author),
    publisher: text(record?.publisher),
    tags: text(record?.tags),
    category: text(record?.category),
    series: text(record?.series),
    record,
    syncedAt,
  };
}

async function storeExternalBookPages(pages: ExternalBookPage[], syncedAt: Date): Promise<void> {
  const documents = pages.flatMap((page) => page.records.map((record) => toSearchDocument(record, syncedAt)).filter(Boolean));
  if (!documents.length) return;
  await ExternalBookSearchDocument.bulkWrite(
    documents.map((document: any) => ({
      updateOne: {
        filter: { externalBookId: document.externalBookId },
        update: { $set: document },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

export async function searchExternalBookIndex(current: number, size: number, keyword: string): Promise<ExternalBookSearchIndexPage | null> {
  const normalizedKeyword = text(keyword).slice(0, 80);
  if (!normalizedKeyword) return null;
  try {
    const state = await SystemSetting.findOne({ key: EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY }).lean();
    if (!(state?.value as any)?.ready) return null;
    const safeKeyword = normalizedKeyword.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
    const textSearchQuery = safeKeyword.includes(" ") ? `"${safeKeyword}"` : safeKeyword;
    const filter = { $text: { $search: textSearchQuery } };
    const [documents, total] = await Promise.all([
      ExternalBookSearchDocument.find(filter, { record: 1, score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .skip(Math.max(0, (current - 1) * size))
        .limit(size)
        .lean(),
      ExternalBookSearchDocument.countDocuments(filter),
    ]);
    return {
      records: documents.map((document: any) => document.record),
      total,
      size,
      current,
      pages: Math.max(1, Math.ceil(total / size)),
    };
  } catch (_error) {
    return null;
  }
}

let activeSync: Promise<{ indexedCount: number; total: number; pages: number }> | null = null;

export async function syncExternalBookSearchIndex(options: ExternalBookSearchIndexSyncOptions = {}) {
  if (activeSync) return activeSync;
  const work = (async () => {
    const pageSize = Math.max(1, Math.min(Number(options.pageSize || DEFAULT_PAGE_SIZE), 100));
    const concurrency = Math.max(1, Math.min(Number(options.concurrency || DEFAULT_CONCURRENCY), 8));
    const fetchPage = options.fetchPage || fetchExternalBookIndexPage;
    await ExternalBookSearchDocument.createIndexes();
    const previousState = await SystemSetting.findOne({ key: EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY }).lean();
    const previousValue = (previousState?.value || {}) as any;
    const firstPage = await fetchPage(1, pageSize);
    const totalPages = Math.max(1, Number(firstPage.pages || Math.ceil(firstPage.total / pageSize) || 1));
    const isResuming = ["syncing", "failed"].includes(previousValue.status)
      && Number(previousValue.nextPage || 0) > 1
      && previousValue.startedAt;
    let nextPage = isResuming
      ? Math.max(1, Math.min(Number(previousValue.nextPage || 1), totalPages))
      : 1;
    const syncedAt = isResuming ? new Date(previousValue.startedAt) : new Date();

    await SystemSetting.findOneAndUpdate(
      { key: EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY },
      {
        $set: {
          value: {
            ready: Boolean(previousValue.ready),
            status: "syncing",
            nextPage,
            total: firstPage.total,
            pages: totalPages,
            startedAt: syncedAt,
            lastError: "",
          },
        },
      },
      { upsert: true }
    );

    try {
      while (nextPage <= totalPages) {
        const pageNumbers = Array.from(
          { length: Math.min(concurrency, totalPages - nextPage + 1) },
          (_value, index) => nextPage + index
        );
        const pages = await Promise.all(pageNumbers.map((pageNumber) => (
          pageNumber === 1 ? firstPage : fetchPage(pageNumber, pageSize)
        )));
        await storeExternalBookPages(pages, syncedAt);
        nextPage = pageNumbers[pageNumbers.length - 1] + 1;
        await SystemSetting.updateOne(
          { key: EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY },
          { $set: { "value.nextPage": nextPage, "value.updatedAt": new Date() } }
        );
        options.onProgress?.({ completedPages: nextPage - 1, totalPages });
      }

      await ExternalBookSearchDocument.deleteMany({ syncedAt: { $lt: syncedAt } });
      const indexedCount = await ExternalBookSearchDocument.countDocuments({});
      await SystemSetting.updateOne(
        { key: EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY },
        {
          $set: {
            value: {
              ready: true,
              status: "ready",
              nextPage: totalPages + 1,
              total: firstPage.total,
              pages: totalPages,
              indexedCount,
              completedAt: new Date(),
              lastError: "",
            },
          },
        }
      );
      return { indexedCount, total: firstPage.total, pages: totalPages };
    } catch (error: any) {
      await SystemSetting.updateOne(
        { key: EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY },
        {
          $set: {
            "value.ready": Boolean(previousValue.ready),
            "value.status": "failed",
            "value.nextPage": nextPage,
            "value.lastError": text(error?.message || error),
            "value.failedAt": new Date(),
          },
        }
      );
      throw error;
    }
  })();
  activeSync = work;
  try {
    return await work;
  } finally {
    activeSync = null;
  }
}
