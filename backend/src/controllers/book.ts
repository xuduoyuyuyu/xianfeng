import { Request, Response } from "express";
import mongoose from "mongoose";
import Book from "../models/Book";
import GuestModel from "../models/Guest";
import Program from "../models/Program";
import {
  findApprovedBookMetadataByBookId,
  listApprovedBookMetadataByBookIds,
  listBookMetadataByBookIds,
  listBookMetadataForReview,
  reviewBookMetadata,
} from "../services/bookMetadataService";
import { getOrCreateExternalBookDescriptionTranslation } from "../services/externalBookDescriptionTranslation";

type BookCoverProxyCacheEntry = {
  contentType: string;
  buffer: Buffer;
  expiresAt: number;
  size: number;
};

type ExternalBookLibraryRecord = {
  id: string;
  title: string;
  coverPic: string;
  author: string;
  publisher: string;
  isbn: string;
  pubDate: string;
  pages: number | null;
  words: string;
  lexile: string;
  ar: string;
  tags: string;
  category: string;
  series: string;
  fiction: string;
  levelRange: string;
  description: string;
};

const BOOK_COVER_PROXY_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const BOOK_COVER_PROXY_CACHE_MAX_BYTES = 80 * 1024 * 1024;
const BOOK_COVER_BROWSER_CACHE_HEADER = "public, max-age=604800, stale-while-revalidate=86400";
const READLY_BOOK_PAGE_URL = "https://api.shuyu.xin/readly/api/ma/book/page";
const bookCoverProxyCache = new Map<string, BookCoverProxyCacheEntry>();
let bookCoverProxyCacheBytes = 0;

function setBookCoverProxyCacheHeaders(res: Response, contentType: string, hit: boolean) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", BOOK_COVER_BROWSER_CACHE_HEADER);
  res.setHeader("X-Book-Cover-Proxy-Cache", hit ? "HIT" : "MISS");
}

function deleteBookCoverProxyCacheEntry(key: string) {
  const existing = bookCoverProxyCache.get(key);
  if (!existing) return;
  bookCoverProxyCacheBytes = Math.max(0, bookCoverProxyCacheBytes - existing.size);
  bookCoverProxyCache.delete(key);
}

function getCachedBookCoverProxyResponse(key: string): BookCoverProxyCacheEntry | null {
  const existing = bookCoverProxyCache.get(key);
  if (!existing) return null;
  if (existing.expiresAt <= Date.now()) {
    deleteBookCoverProxyCacheEntry(key);
    return null;
  }
  bookCoverProxyCache.delete(key);
  bookCoverProxyCache.set(key, existing);
  return existing;
}

function storeBookCoverProxyResponse(key: string, contentType: string, buffer: Buffer) {
  if (buffer.length > BOOK_COVER_PROXY_CACHE_MAX_BYTES) return;
  deleteBookCoverProxyCacheEntry(key);
  const entry = {
    contentType,
    buffer,
    expiresAt: Date.now() + BOOK_COVER_PROXY_CACHE_TTL_MS,
    size: buffer.length,
  };
  bookCoverProxyCache.set(key, entry);
  bookCoverProxyCacheBytes += entry.size;

  while (bookCoverProxyCacheBytes > BOOK_COVER_PROXY_CACHE_MAX_BYTES) {
    const oldestKey = bookCoverProxyCache.keys().next().value;
    if (!oldestKey) break;
    deleteBookCoverProxyCacheEntry(oldestKey);
  }
}

function pick(row: any, keys: string[]): string {
  const record = row && typeof row === "object" ? row : {};
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function toStatus(v: string): "draft" | "published" {
  const s = (v || "").trim().toLowerCase();
  if (["published", "publish", "已发布", "发布", "上架"].includes(s)) return "published";
  return "draft";
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function pickNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function normalizeExternalBookLibraryRecord(record: any): ExternalBookLibraryRecord {
  return {
    id: pick(record, ["id"]),
    title: pick(record, ["title"]),
    coverPic: pick(record, ["coverPic"]),
    author: pick(record, ["author"]),
    publisher: pick(record, ["publisher"]),
    isbn: pick(record, ["isbn"]),
    pubDate: pick(record, ["pubDate"]),
    pages: pickNumber(record?.pages),
    words: pick(record, ["words"]),
    lexile: pick(record, ["lexile"]),
    ar: pick(record, ["ar"]),
    tags: pick(record, ["tags"]),
    category: pick(record, ["category"]),
    series: pick(record, ["series"]),
    fiction: pick(record, ["fiction"]),
    levelRange: pick(record, ["levelRange"]),
    description: pick(record, ["description"]),
  };
}

/** 构造 _id 查询条件，兼容 string 和 ObjectId 类型 */
function idQuery(id: string | string[]) {
  const sid = Array.isArray(id) ? id[0] : id;
  // 用 $expr + $eq 比较 _id 的字符串表示，绕过 Mongoose schema 的类型自动转换
  return {
    $expr: {
      $or: [
        { $eq: [{ $toString: "$_id" }, sid] },
        { $eq: [{ $toString: "$_id" }, sid.toLowerCase()] },
      ],
    },
  };
}

function normalizeBookPayload(raw: any, defaults?: { sourceName?: string; sourceGuestId?: string; recommendedGuest?: string }) {
  const title = pick(raw, ["书名", "title", "图书名称", "名称"]);
  return {
    title,
    categoryLabel: pick(raw, ["类别", "categoryLabel", "category", "分类"]),
    topic: pick(raw, ["主题", "topic", "标签"]),
    author: pick(raw, ["著作者", "author", "作者", "Author", "作者姓名"]),
    translator: pick(raw, ["译者", "translator"]),
    publisher: pick(raw, ["出版社", "publisher"]),
    isbn: pick(raw, ["isbn", "ISBN"]),
    publishedDate: pick(raw, ["publishedDate", "published_date", "出版日期", "出版时间"]),
    grade: pick(raw, ["年级", "grade"]),
    coverImage: pick(raw, ["封面图片", "coverImage", "封面", "封面图", "图片", "cover"]) ?? "https://via.placeholder.com/240x320/630ed4/ffffff?text=Book",
    recommendedGuest: pick(raw, ["推荐嘉宾", "recommendedGuest"]) || String(defaults?.recommendedGuest || "").trim(),
    sourceName: String(defaults?.sourceName || raw?.sourceName || "").trim(),
    sourceGuestId: defaults?.sourceGuestId && mongoose.Types.ObjectId.isValid(defaults.sourceGuestId)
      ? new mongoose.Types.ObjectId(defaults.sourceGuestId)
      : null,
    // 微信小店字段
    wxProductId: pick(raw, ["wxProductId", "productId"]),
    wxShopName: pick(raw, ["wxShopName"]),
    wxShopAppid: pick(raw, ["wxShopAppid"]),
    wxSalePrice: Number(pick(raw, ["wxSalePrice", "salePrice"]) || 0),
    wxMonthlySales: Number(pick(raw, ["wxMonthlySales", "monthlySales"]) || 0),
    wxShopScore: Number(pick(raw, ["wxShopScore", "shopScore"]) || 0),
    wxHeadImgs: raw?.wxHeadImgs || raw?.headImgs || [],
    wxQrcodeUrl: pick(raw, ["wxQrcodeUrl", "qrcode", "qrcodeUrl"]),
    wxPurchaseLink: pick(raw, ["wxPurchaseLink", "purchaseLink", "wxMiniProgramLink", "miniProgramLink"]),
    status: toStatus(pick(raw, ["status", "状态"])),
  };
}

function statusUpdatePayload(status: "draft" | "published") {
  if (status === "published") {
    return { status, publishedAt: new Date() };
  }
  return { status, publishedAt: null };
}

function hasUsableBookCover(url: unknown): boolean {
  const value = String(url || "").trim();
  if (!value) return false;
  if (value.includes("via.placeholder.com")) return false;
  if (value.includes("placeholder")) return false;
  if (value.includes("/uploads/images/")) return false;
  return true;
}

function normalizeBookCoverUrl(url: unknown): string {
  const value = String(url || "").trim();
  if (!hasUsableBookCover(value)) return "";
  if (!/(cdn\.weread\.qq\.com|rescdn\.qqmail\.com|wfqqreader-\d+\.image\.myqcloud\.com)\/(weread\/)?cover\//i.test(value)) {
    return value;
  }
  return value.replace(/\/(?:s|m|b)_([^/?#]+)(?=([?#]|$))/i, "/t7_$1");
}

function pickPublicBookCover(bookCover: unknown, metadataCover: unknown): string {
  const normalizedMetadataCover = normalizeBookCoverUrl(metadataCover);
  if (normalizedMetadataCover) return normalizedMetadataCover;
  return normalizeBookCoverUrl(bookCover);
}

async function formatPublicBookMetadata(metadata: any, book: any) {
  const payload = {
    bookId: String(metadata?.bookId || book?._id || ""),
    title: String(metadata?.title || book?.title || ""),
    author: String(metadata?.author || book?.author || ""),
    publisher: String(metadata?.publisher || book?.publisher || ""),
    isbn: String(metadata?.isbn || ""),
    cover: String(metadata?.cover || book?.coverImage || ""),
    description: String(metadata?.description || ""),
    source: String(metadata?.source || ""),
    sourceTitle: "",
    sourceId: String(metadata?.sourceId || ""),
    rating: metadata?.rating ?? null,
    ratingCount: metadata?.ratingCount ?? null,
    ratingLabel: String(metadata?.ratingLabel || ""),
    matchScore: Number(metadata?.matchScore || 0),
  };

  const sourceProgram = metadata?.sourceId && mongoose.Types.ObjectId.isValid(String(metadata.sourceId))
    ? await Program.findById(String(metadata.sourceId), { title: 1 }).lean()
    : null;

  if (sourceProgram) {
    payload.sourceTitle = String((sourceProgram as any)?.title || "");
  }

  return payload;
}

function formatAdminBookMetadata(metadata: any) {
  if (!metadata) return null;
  return {
    _id: String(metadata?._id || ""),
    bookId: String(metadata?.bookId || ""),
    title: String(metadata?.title || ""),
    author: String(metadata?.author || ""),
    publisher: String(metadata?.publisher || ""),
    isbn: String(metadata?.isbn || ""),
    cover: String(metadata?.cover || ""),
    description: String(metadata?.description || ""),
    source: String(metadata?.source || ""),
    sourceId: String(metadata?.sourceId || ""),
    rating: metadata?.rating ?? null,
    ratingCount: metadata?.ratingCount ?? null,
    ratingLabel: String(metadata?.ratingLabel || ""),
    matchScore: Number(metadata?.matchScore || 0),
    matchReason: Array.isArray(metadata?.matchReason) ? metadata.matchReason : [],
    status: String(metadata?.status || ""),
    reviewNote: String(metadata?.reviewNote || ""),
    reviewedAt: metadata?.reviewedAt || null,
    createdAt: metadata?.createdAt || null,
    updatedAt: metadata?.updatedAt || null,
  };
}

export class BookController {
  async getExternalLibraryPublic(req: Request, res: Response): Promise<void> {
    try {
      const safeCurrent = clampInteger(req.query.current, 1, 1, 100000);
      const safeSize = clampInteger(req.query.size, 24, 1, 60);
      const query = {
        current: String(safeCurrent),
        size: String(safeSize),
      };
      const upstreamUrl = new URL(READLY_BOOK_PAGE_URL);
      upstreamUrl.searchParams.set("current", query.current);
      upstreamUrl.searchParams.set("size", query.size);

      const response = await fetch(upstreamUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        res.status(502).json({ message: `外部书库返回 ${response.status}` });
        return;
      }

      const payload = await response.json();
      const data = payload && typeof payload === "object" ? payload.data : null;
      const records = Array.isArray(data?.records) ? data.records : [];
      res.status(200).json({
        records: records.map(normalizeExternalBookLibraryRecord),
        total: Number(data?.total || 0),
        size: Number(data?.size || safeSize),
        current: Number(data?.current || safeCurrent),
        pages: Number(data?.pages || 0),
      });
    } catch (error: any) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") {
        res.status(504).json({ message: "外部书库加载超时" });
        return;
      }
      res.status(502).json({ message: "外部书库加载失败", error: error?.message || error });
    }
  }

  async getExternalBookDescriptionTranslationPublic(req: Request, res: Response): Promise<void> {
    try {
      const externalBookId = String(req.params.id || "").trim();
      const title = String(req.body?.title || "").trim();
      const description = String(req.body?.description || "").trim();
      if (!externalBookId) {
        res.status(400).json({ message: "缺少外部图书 ID" });
        return;
      }
      if (!description) {
        res.status(400).json({ message: "缺少可翻译的简介" });
        return;
      }

      const result = await getOrCreateExternalBookDescriptionTranslation({
        externalBookId,
        title,
        description,
      });
      res.status(result.cached ? 200 : 201).json(result);
    } catch (error: any) {
      res.status(502).json({ message: error?.message || "简介翻译失败" });
    }
  }

  async proxyImage(req: Request, res: Response): Promise<void> {
    try {
      const url = String(req.query.url || "").trim();
      if (!url || !/^https?:\/\//.test(url)) {
        res.status(400).json({ error: "缺少有效 url 参数" });
        return;
      }
      const cached = getCachedBookCoverProxyResponse(url);
      if (cached) {
        setBookCoverProxyCacheHeaders(res, cached.contentType, true);
        res.send(cached.buffer);
        return;
      }
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        res.status(502).json({ error: `上游返回 ${resp.status}` });
        return;
      }
      const contentType = resp.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_SIZE) {
        res.status(413).json({ error: "图片过大" });
        return;
      }
      storeBookCoverProxyResponse(url, contentType, buf);
      setBookCoverProxyCacheHeaders(res, contentType, false);
      res.send(buf);
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.name === "TimeoutError") {
        res.status(504).json({ error: "图片加载超时" });
        return;
      }
      res.status(502).json({ error: `代理失败: ${err?.message || err}` });
    }
  }

  async importBatch(req: Request, res: Response): Promise<void> {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const sourceName = String(req.body?.sourceName || "").trim();
      const sourceGuestId = String(req.body?.sourceGuestId || "").trim();
      const overwrite = req.body?.overwrite === true;
      if (!rows.length) {
        res.status(400).json({ message: "导入数据为空" });
        return;
      }
      if (rows.length > 300) {
        res.status(400).json({ message: "单次导入最多 300 条，请分批导入" });
        return;
      }
      if (sourceGuestId && !mongoose.Types.ObjectId.isValid(sourceGuestId)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      if (sourceGuestId) {
        const guest = await GuestModel.findById(sourceGuestId).lean();
        if (!guest) {
          res.status(400).json({ message: "绑定嘉宾不存在" });
          return;
        }
      }

      const sourceGuestName = sourceGuestId
        ? String(((await GuestModel.findById(sourceGuestId, { name: 1 }).lean()) as any)?.name || "")
        : "";

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const skippedDetails: Array<{ index: number; reason: string; title?: string; author?: string }> = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const payload = normalizeBookPayload(row, {
          sourceName,
          sourceGuestId,
          recommendedGuest: sourceGuestName,
        });
        const title = payload.title;
        const author = payload.author;
        if (!title || !author) {
          skipped += 1;
          skippedDetails.push({
            index: i,
            reason: !title && !author ? "缺少书名和作者" : !title ? "缺少书名" : "缺少作者",
            title,
            author,
          });
          continue;
        }
        const exists = await Book.findOne({ title }).lean();
        if (exists) {
          if (!overwrite) {
            skipped += 1;
            skippedDetails.push({
              index: i,
              reason: "同名书籍已存在且未开启覆盖更新",
              title,
              author,
            });
            continue;
          }
          await Book.findByIdAndUpdate((exists as any)._id, payload, { new: false });
          updated += 1;
          continue;
        }
        const book = new Book(payload);
        if (payload.status === "published") {
          (book as any).publishedAt = new Date();
        }
        await book.save();
        created += 1;
      }

      res.status(200).json({
        created,
        updated,
        skipped,
        total: rows.length,
        skippedDetails: skippedDetails.slice(0, 50),
      });
    } catch (error) {
      res.status(400).json({ message: "批量导入书单失败", error });
    }
  }

  async getAllPublic(_req: Request, res: Response): Promise<void> {
    try {
      const books = await Book.find({ status: "published" }).sort({
        publishedAt: -1,
      });
      const metadataRows = await listApprovedBookMetadataByBookIds(books.map((book: any) => String(book?._id || "")));
      const metadataByBookId = new Map(metadataRows.map((item: any) => [String(item?.bookId || ""), item]));
      const enrichedBooks = books.map((book: any) => {
        const plain = typeof book.toObject === "function" ? book.toObject() : book;
        const metadata = metadataByBookId.get(String(plain?._id || ""));
        const metadataCover = normalizeBookCoverUrl(metadata?.cover);
        return {
          ...plain,
          coverImage: pickPublicBookCover(plain?.coverImage, metadataCover),
          hasMetadataDetail: Boolean(metadata),
          metadataCover,
        };
      });
      res.status(200).json(enrichedBooks);
    } catch (error) {
      res.status(500).json({ message: "获取书单列表失败", error });
    }
  }

  async getByIdPublic(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const book = await Book.findOne({ ...idQuery(id), status: "published" }).lean();
      if (!book) {
        res.status(404).json({ message: "书籍不存在或未上架" });
        return;
      }
      const metadata = await findApprovedBookMetadataByBookId(String((book as any)._id || ""));
      const metadataCover = normalizeBookCoverUrl(metadata?.cover);
      res.status(200).json({
        ...book,
        coverImage: pickPublicBookCover((book as any)?.coverImage, metadataCover),
        hasMetadataDetail: Boolean(metadata),
        metadataCover,
      });
    } catch (error) {
      res.status(500).json({ message: "获取书籍失败", error });
    }
  }

  async getMetadataPublic(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const book = await Book.findOne({ ...idQuery(id), status: "published" })
        .select({ _id: 1, title: 1, author: 1, publisher: 1 })
        .lean();
      if (!book) {
        res.status(404).json({ message: "书籍不存在或未上架" });
        return;
      }
      const metadata = await findApprovedBookMetadataByBookId(String((book as any)._id));
      if (!metadata) {
        res.status(404).json({ message: "暂无图书详情数据" });
        return;
      }
      res.status(200).json(await formatPublicBookMetadata(metadata, book));
    } catch (error) {
      res.status(500).json({ message: "获取书籍详情元数据失败", error });
    }
  }

  async getAllAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.query;
      const filter =
        status === "draft" || status === "published" ? { status } : {};
      const books = await Book.find(filter)
        .populate("sourceGuestId", "name title")
        .sort({ updatedAt: -1 });
      const metadataRows = await listBookMetadataByBookIds(books.map((book: any) => String(book?._id || "")));
      const metadataByBookId = new Map(metadataRows.map((item: any) => [String(item?.bookId || ""), item]));
      const enrichedBooks = books.map((book: any) => {
        const plain = typeof book.toObject === "function" ? book.toObject() : book;
        const metadata = metadataByBookId.get(String(plain?._id || ""));
        const metadataDetail = formatAdminBookMetadata(metadata);
        return {
          ...plain,
          hasMetadataDetail: metadataDetail?.status === "auto_approved",
          metadataStatus: metadataDetail?.status || "",
          metadataId: metadataDetail?._id || "",
          metadataDetail,
        };
      });
      res.status(200).json(enrichedBooks);
    } catch (error) {
      res.status(500).json({ message: "获取管理书单失败", error });
    }
  }

  async getMetadataAdmin(req: Request, res: Response): Promise<void> {
    try {
      const status = String(req.query.status || "");
      const rows = await listBookMetadataForReview(status);
      res.status(200).json(rows);
    } catch (error) {
      res.status(500).json({ message: "获取图书详情审核列表失败", error });
    }
  }

  async reviewMetadataAdmin(req: Request, res: Response): Promise<void> {
    try {
      const metadata = await reviewBookMetadata(String(req.params.metadataId || ""), req.body || {});
      if (!metadata) {
        res.status(404).json({ message: "图书详情不存在" });
        return;
      }
      res.status(200).json(metadata);
    } catch (error) {
      res.status(400).json({ message: "更新图书详情审核状态失败", error });
    }
  }

  async getByIdAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const book = await Book.findOne(idQuery(id)).populate("sourceGuestId", "name title");
      if (!book) {
        res.status(404).json({ message: "书籍不存在" });
        return;
      }
      res.status(200).json(book);
    } catch (error) {
      res.status(500).json({ message: "获取书籍失败", error });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body;
      const normalized = normalizeBookPayload(payload, {
        sourceName: payload?.sourceName,
        sourceGuestId: payload?.sourceGuestId,
      });
      if (!normalized.title) {
        res.status(400).json({ message: "书名不能为空" });
        return;
      }
      if (payload.status && !["draft", "published"].includes(payload.status)) {
        res.status(400).json({ message: "无效的状态值" });
        return;
      }
      if (normalized.status === "published" && !payload.publishedAt) {
        (normalized as any).publishedAt = new Date();
      }
      const book = new Book(normalized as any);
      await book.save();
      res.status(201).json(book);
    } catch (error) {
      res.status(400).json({ message: "创建书籍失败", error });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const payload = req.body;
      const existing = await Book.findOne(idQuery(id));
      if (!existing) {
        res.status(404).json({ message: "书籍不存在" });
        return;
      }
      // 合并已有数据，确保 partial update 不丢失必要字段（如 title）
      const merged = { ...(existing.toObject?.() || existing), ...payload };
      const normalized = normalizeBookPayload(merged, {
        sourceName: merged?.sourceName || (existing as any).sourceName,
        sourceGuestId: merged?.sourceGuestId || (existing as any).sourceGuestId?.toString(),
      });
      if (!normalized.title) {
        res.status(400).json({ message: "书名不能为空" });
        return;
      }
      if (payload.status && !["draft", "published"].includes(payload.status)) {
        res.status(400).json({ message: "无效的状态值" });
        return;
      }
      if (normalized.status === "published" && !payload.publishedAt) {
        (normalized as any).publishedAt = new Date();
      }
      if (normalized.status === "draft") {
        (normalized as any).publishedAt = null;
      }
      const book = await Book.findOneAndUpdate(idQuery(id), normalized as any, { new: true });
      res.status(200).json(book);
    } catch (error) {
      res.status(400).json({ message: "更新书籍失败", error });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (status !== "draft" && status !== "published") {
        res.status(400).json({ message: "状态仅允许 draft 或 published" });
        return;
      }
      const book = await Book.findOneAndUpdate(idQuery(id), statusUpdatePayload(status), {
        new: true,
      });
      if (!book) {
        res.status(404).json({ message: "书籍不存在" });
        return;
      }
      res.status(200).json(book);
    } catch (error) {
      res.status(400).json({ message: "更新书籍状态失败", error });
    }
  }

  async batchPublish(req: Request, res: Response): Promise<void> {
    try {
      const { filter, ids } = req.body;
      let query: any = { status: "draft" };
      if (ids && Array.isArray(ids)) {
        query._id = { $in: ids };
      } else if (filter === "with_wx_cover") {
        query.coverImage = { $regex: /wxapp\.tc\.qq\.com|store\.mp\.video\.tencent-cloud/ };
      }
      const now = new Date();
      const result = await Book.updateMany(query, { status: "published", publishedAt: now });
      res.status(200).json({ matched: result.matchedCount, modified: result.modifiedCount });
    } catch (error) {
      res.status(500).json({ message: "批量发布失败", error });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const book = await Book.findOneAndDelete(idQuery(id));
      if (!book) {
        res.status(404).json({ message: "书籍不存在" });
        return;
      }
      res.status(200).json({ message: "书籍删除成功" });
    } catch (error) {
      res.status(500).json({ message: "删除书籍失败", error });
    }
  }
}
