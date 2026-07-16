import express from "express";
import Program from "../models/Program";
import Book from "../models/Book";
import LearningMaterial from "../models/LearningMaterial";
import GuestModel from "../models/Guest";
import Topic from "../models/Topic";

const router = express.Router();
const MAX_RESULTS_PER_TYPE = 80;

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

export default router;
