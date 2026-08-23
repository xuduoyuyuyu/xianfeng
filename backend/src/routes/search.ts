import express from "express";
import { createHash } from "node:crypto";
import Program from "../models/Program";
import Book from "../models/Book";
import LearningMaterial from "../models/LearningMaterial";
import GuestModel from "../models/Guest";
import Topic from "../models/Topic";
import SearchAnalyticsEventModel, { SEARCH_RESULT_TYPES, SearchResultCounts } from "../models/SearchAnalyticsEvent";

const router = express.Router();
const MAX_RESULTS_PER_TYPE = 80;
const SENSITIVE_QUERY = /(?:1\d{10}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\d[\s-]*){6,})/i;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function escapeSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchable(fields: string[], expression: RegExp) {
  return { $or: fields.map((field) => ({ [field]: expression })) };
}

function trimText(value: unknown, max = 240): string {
  const text = asText(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function asIdentifier(value: unknown): string {
  const text = asText(value);
  return /^[A-Za-z0-9_-]{12,120}$/.test(text) ? text : "";
}

function normalizeAnalyticsQuery(value: unknown): string {
  return asText(value).replace(/\s+/g, " ").slice(0, 120);
}

function storedAnalyticsQuery(value: unknown): string {
  const query = normalizeAnalyticsQuery(value);
  return SENSITIVE_QUERY.test(query) ? "[敏感内容已隐藏]" : query;
}

function safeResultCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.min(MAX_RESULTS_PER_TYPE, Math.floor(count))) : 0;
}

function parseResultCounts(value: unknown): SearchResultCounts {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    programs: safeResultCount(raw.programs),
    books: safeResultCount(raw.books),
    materials: safeResultCount(raw.materials),
    topics: safeResultCount(raw.topics),
    experts: safeResultCount(raw.experts),
  };
}

function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

router.get("/", async (req, res) => {
  const query = asText(req.query.q);
  if (!query) {
    res.json({ programs: [], books: [], materials: [], topics: [], experts: [] });
    return;
  }

  try {
    const expression = new RegExp(escapeSearchRegex(query), "i");
    const [programs, books, materials, topics, experts] = await Promise.all([
      Program.find({
        status: { $in: ["published", "group-only"] },
        ...searchable(["title", "description", "summary.headline", "summary.body", "summary.tags"], expression),
      })
        .select("programCode title description coverImage summary.headline summary.body summary.tags publishedAt createdAt")
        .sort({ publishedAt: -1, createdAt: -1 })
        .limit(MAX_RESULTS_PER_TYPE)
        .lean(),
      Book.find({
        status: "published",
        ...searchable(["title", "author", "publisher", "topic", "categoryLabel", "grade", "recommendedGuest", "sourceName"], expression),
      })
        .select("title author publisher topic categoryLabel grade recommendedGuest sourceName coverImage wxPurchaseLink")
        .sort({ publishedAt: -1, createdAt: -1 })
        .limit(MAX_RESULTS_PER_TYPE)
        .lean(),
      LearningMaterial.find({
        status: "published",
        ...searchable(["title", "description", "category"], expression),
      })
        .select("title description category fileUrl")
        .sort({ publishedAt: -1, createdAt: -1 })
        .limit(MAX_RESULTS_PER_TYPE)
        .lean(),
      Topic.find({
        status: "published",
        ...searchable(["title", "subtitle", "shortSummary", "description", "tags", "suitableGrades"], expression),
      })
        .select("slug title subtitle shortSummary coverEmoji tags")
        .sort({ createdAt: -1 })
        .limit(MAX_RESULTS_PER_TYPE)
        .lean(),
      GuestModel.find({
        status: "active",
        ...searchable(["name", "title", "bio", "mainAreas", "keywords"], expression),
      })
        .select("name title bio avatar mainAreas keywords")
        .sort({ updatedAt: -1 })
        .limit(MAX_RESULTS_PER_TYPE)
        .lean(),
    ]);

    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({
      programs: programs.map((item: any) => ({ ...item, description: trimText(item.description), summary: item.summary ? { ...item.summary, body: trimText(item.summary.body) } : undefined })),
      books,
      materials: materials.map((item: any) => ({ ...item, description: trimText(item.description) })),
      topics,
      experts: experts.map((item: any) => ({ ...item, bio: trimText(item.bio) })),
    });
  } catch (error) {
    res.status(500).json({ message: "搜索失败，请稍后重试", error });
  }
});

router.post("/events", async (req, res) => {
  const clientEventId = asIdentifier(req.body?.clientEventId);
  const sessionId = asIdentifier(req.body?.sessionId);
  const query = storedAnalyticsQuery(req.body?.query);
  if (!clientEventId || !sessionId || !query) {
    res.status(400).json({ message: "搜索统计参数不完整" });
    return;
  }

  try {
    const resultCounts = parseResultCounts(req.body?.resultCounts);
    const totalResults = SEARCH_RESULT_TYPES.reduce((total, type) => total + resultCounts[type], 0);
    const event = await SearchAnalyticsEventModel.findOneAndUpdate(
      { clientEventId },
      {
        $setOnInsert: {
          clientEventId,
          sessionHash: hashSessionId(sessionId),
          query,
          normalizedQuery: query.toLocaleLowerCase("zh-CN"),
          source: "mini-program",
          resultCounts,
          totalResults,
          searchedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, runValidators: true }
    ).select("_id").lean();
    res.status(200).json({ eventId: String(event?._id || "") });
  } catch (_error) {
    res.status(500).json({ message: "记录搜索统计失败" });
  }
});

router.post("/events/:id/click", async (req, res) => {
  const sessionId = asIdentifier(req.body?.sessionId);
  const resultType = asText(req.body?.resultType);
  const resultId = asText(req.body?.resultId).slice(0, 180);
  if (!sessionId || !SEARCH_RESULT_TYPES.includes(resultType as any) || !resultId) {
    res.status(400).json({ message: "搜索点击参数不完整" });
    return;
  }

  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      res.status(400).json({ message: "搜索事件编号无效" });
      return;
    }
    await SearchAnalyticsEventModel.updateOne(
      {
        _id: req.params.id,
        sessionHash: hashSessionId(sessionId),
        clickedAt: null,
      },
      {
        $set: {
          clickedType: resultType,
          clickedResultId: resultId,
          clickedAt: new Date(),
        },
      }
    );
    res.status(200).json({ ok: true });
  } catch (_error) {
    res.status(500).json({ message: "记录搜索点击失败" });
  }
});

export default router;
