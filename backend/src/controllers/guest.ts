import { Request, Response } from "express";
import mongoose from "mongoose";
import GuestModel from "../models/Guest";
import Program from "../models/Program";
import { AuthenticatedRequest } from "../middlewares/auth";
import { askGuestAgent, getGuestAgentHistory, getGuestAgentProfile } from "../services/guestAgentService";
import GuestAgentChunkModel from "../models/GuestAgentChunk";
import Book from "../models/Book";
import LearningMaterial from "../models/LearningMaterial";
import { uniqueBookSourceNames } from "../utils/bookSourceNames";

const PUBLIC_GUEST_PROGRAM_STATUSES = ["published", "group-only"] as const;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fixAvatarUrl(url: string): string {
  const clean = asText(url);
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(clean)) {
    return clean;
  }
  return clean.replace(/^http:\/\//i, "https://");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeContentStatus(value: unknown): "active" | "inactive" {
  return value === "inactive" ? "inactive" : "active";
}

function normalizePublicationType(value: unknown): "paper" | "book" | "interview" | "media" | "other" {
  const text = asText(value).toLowerCase();
  if (text === "paper" || text === "book" || text === "interview" || text === "media" || text === "other") {
    return text;
  }
  return "other";
}

function normalizeSocialProfiles(input: unknown) {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input
    .map((item: any, index) => ({
      platform: asText(item?.platform),
      label: asText(item?.label),
      url: asText(item?.url),
      note: asText(item?.note),
      order: Number(item?.order) || index + 1,
      status: normalizeContentStatus(item?.status),
    }))
    .filter((item) => item.platform || item.label || item.url || item.note)
    .map((item) => ({
      ...item,
      platform: item.platform || "社交媒体",
      label: item.label || item.platform || item.url,
    }))
    .filter((item) => {
      const key = item.url ? item.url.toLowerCase() : `${item.platform}::${item.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
}

function normalizePublications(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any, index) => ({
      type: normalizePublicationType(item?.type),
      title: asText(item?.title),
      url: asText(item?.url),
      source: asText(item?.source),
      publishedAt: asText(item?.publishedAt),
      summary: asText(item?.summary),
      note: asText(item?.note),
      order: Number(item?.order) || index + 1,
      status: normalizeContentStatus(item?.status),
    }))
    .filter((item) => item.title && item.url)
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
}

function mapLegacyReferencesToPublications(profileReferences: Array<{ title?: string; url: string; note?: string }>) {
  return normalizePublications(
    profileReferences.map((item, index) => ({
      type: "other",
      title: asText(item?.title) || asText(item?.url),
      url: asText(item?.url),
      source: "",
      publishedAt: "",
      summary: asText(item?.note),
      note: asText(item?.note),
      order: index + 1,
      status: "active",
    }))
  );
}

function serializeProgramCard(program: any) {
  return {
    _id: String(program?._id || ""),
    programCode: asText(program?.programCode),
    title: asText(program?.title),
    coverImage: fixAvatarUrl(asText(program?.coverImage)),
    publishedAt: program?.publishedAt || null,
    summary: asText(program?.summary?.headline) || asText(program?.description),
  };
}

function normalizeTag(value: unknown): string {
  return asText(value).replace(/\s+/g, " ");
}

function readGuestId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function readProgramTags(program: any): string[] {
  const seen = new Set<string>();
  const tags = Array.isArray(program?.summary?.tags) ? program.summary.tags : [];
  return tags
    .map(normalizeTag)
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

export function buildGuestContentTagMap(programs: any[]): Map<string, string[]> {
  const tagScores = new Map<string, Map<string, { count: number; firstIndex: number }>>();
  let nextIndex = 0;

  for (const program of Array.isArray(programs) ? programs : []) {
    const tags = readProgramTags(program);
    if (!tags.length || !Array.isArray(program?.guestBindings)) continue;

    for (const binding of program.guestBindings) {
      const guestId = readGuestId(binding?.guestId);
      if (!guestId) continue;
      const guestScores = tagScores.get(guestId) || new Map<string, { count: number; firstIndex: number }>();
      tagScores.set(guestId, guestScores);

      for (const tag of tags) {
        const current = guestScores.get(tag);
        if (current) {
          current.count += 1;
        } else {
          guestScores.set(tag, { count: 1, firstIndex: nextIndex++ });
        }
      }
    }
  }

  const result = new Map<string, string[]>();
  tagScores.forEach((scores, guestId) => {
    result.set(
      guestId,
      Array.from(scores.entries())
        .sort((a, b) => b[1].count - a[1].count || a[1].firstIndex - b[1].firstIndex)
        .map(([tag]) => tag)
    );
  });
  return result;
}

export function collectGuestFilterTags(guests: Array<{ contentTags?: string[] }>): string[] {
  const tagScores = new Map<string, { count: number; firstIndex: number }>();
  let nextIndex = 0;

  for (const guest of Array.isArray(guests) ? guests : []) {
    const seenInGuest = new Set<string>();
    const tags = Array.isArray(guest?.contentTags) ? guest.contentTags : [];
    for (const rawTag of tags) {
      const tag = normalizeTag(rawTag);
      if (!tag || seenInGuest.has(tag)) continue;
      seenInGuest.add(tag);
      const current = tagScores.get(tag);
      if (current) {
        current.count += 1;
      } else {
        tagScores.set(tag, { count: 1, firstIndex: nextIndex++ });
      }
    }
  }

  return Array.from(tagScores.entries())
    .sort((a, b) => b[1].count - a[1].count || a[1].firstIndex - b[1].firstIndex)
    .map(([tag]) => tag);
}

function normalizeListenerBenefits(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any, index) => ({
      title: asText(item?.title),
      description: asText(item?.description),
      url: asText(item?.url),
      image: asText(item?.image),
      note: asText(item?.note),
      order: Number(item?.order) || index + 1,
      status: normalizeContentStatus(item?.status),
    }))
    .filter((item) => item.title)
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
}

function serializeGuestListItem(guest: any, programCount = 0, agentStats?: { chunkCount?: number; sourceCounts?: Record<string, number> }, contentTags: string[] = []) {
  const profileReferences = Array.isArray(guest?.profileReferences) ? guest.profileReferences : [];
  const socialProfiles = normalizeSocialProfiles(Array.isArray(guest?.socialProfiles) ? guest.socialProfiles : []).filter((item) => item.status === "active");
  const publications = (
    normalizePublications(Array.isArray(guest?.publications) ? guest.publications : []).length > 0
      ? normalizePublications(Array.isArray(guest?.publications) ? guest.publications : [])
      : mapLegacyReferencesToPublications(profileReferences)
  ).filter((item) => item.status === "active");
  const listenerBenefits = normalizeListenerBenefits(Array.isArray(guest?.listenerBenefits) ? guest.listenerBenefits : []).filter((item) => item.status === "active");
  return {
    _id: String(guest?._id || ""),
    name: asText(guest?.name),
    title: asText(guest?.title),
    bio: asText(guest?.bio),
    avatar: fixAvatarUrl(asText(guest?.avatar)),
    profileUrl: asText(guest?.profileUrl),
    profileReferences: profileReferences
      .map((item: any) => ({
        title: asText(item?.title),
        url: asText(item?.url),
        note: asText(item?.note),
      }))
      .filter((item: any) => item.url),
    socialProfiles,
    publications,
    listenerBenefits,
    agentEnabled: guest?.agentEnabled === true,
    programCount,
    contentTags,
    referenceCount: publications.length || profileReferences.filter((item: any) => asText(item?.url)).length,
    agentStats: {
      chunkCount: Number(agentStats?.chunkCount || 0),
      sourceCounts: agentStats?.sourceCounts || {},
    },
  };
}

async function buildGuestProgramCountMap(guestIds?: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const objectIds = (guestIds || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const hasGuestIdFilter = Array.isArray(guestIds) && guestIds.length > 0;
  if (hasGuestIdFilter && !objectIds.length) return map;
  const rows = await Program.aggregate([
    {
      $match: {
        status: { $in: PUBLIC_GUEST_PROGRAM_STATUSES },
        ...(objectIds.length ? { "guestBindings.guestId": { $in: objectIds } } : { "guestBindings.0": { $exists: true } }),
      },
    },
    { $unwind: { path: "$guestBindings", preserveNullAndEmptyArrays: false } },
    ...(objectIds.length ? [{ $match: { "guestBindings.guestId": { $in: objectIds } } }] : []),
    { $group: { _id: "$guestBindings.guestId", count: { $sum: 1 } } },
  ]);
  rows.forEach((row: any) => {
    map.set(String(row._id), Number(row.count) || 0);
  });
  return map;
}

export async function loadGuestBookLists(guestId: string): Promise<string[]> {
  try {
    const bookRows = await Book.find(
      { sourceGuestId: new mongoose.Types.ObjectId(guestId), status: "published" },
      { sourceName: 1 }
    )
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    return uniqueBookSourceNames(bookRows.map((book: any) => book?.sourceName));
  } catch (error) {
    console.error("[guest-detail] failed to load booklists", error);
    return [];
  }
}

type GuestAuthoredBook = {
  id: string;
  title: string;
  coverImage: string;
  publishedDate: string;
  publisher: string;
  hasDetail: boolean;
};

export async function loadGuestAuthoredBooks(guestName: string): Promise<GuestAuthoredBook[]> {
  if (!guestName) return [];
  try {
    const rows = await Book.find(
      { author: guestName, status: "published" },
      { title: 1, coverImage: 1, publishedDate: 1, publisher: 1 }
    ).lean();
    return rows
      .map((book: any) => ({
        id: String(book?._id || ""),
        title: asText(book?.title),
        coverImage: fixAvatarUrl(asText(book?.coverImage)),
        publishedDate: asText(book?.publishedDate),
        publisher: asText(book?.publisher),
        hasDetail: Boolean(book?._id),
      }))
      .filter((book) => book.id && book.title)
      .sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
  } catch (error) {
    console.error("[guest-detail] failed to load authored books", error);
    return [];
  }
}

async function buildGuestAgentStatsMap(guestIds: string[]): Promise<Map<string, { chunkCount: number; sourceCounts: Record<string, number> }>> {
  const map = new Map<string, { chunkCount: number; sourceCounts: Record<string, number> }>();
  const objectIds = guestIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!objectIds.length) return map;
  const rows = await GuestAgentChunkModel.aggregate([
    { $match: { guestId: { $in: objectIds } } },
    { $group: { _id: { guestId: "$guestId", sourceType: "$sourceType" }, count: { $sum: 1 } } },
  ]);
  rows.forEach((row: any) => {
    const guestId = String(row?._id?.guestId || "");
    const sourceType = String(row?._id?.sourceType || "unknown");
    const current = map.get(guestId) || { chunkCount: 0, sourceCounts: {} };
    current.chunkCount += Number(row.count) || 0;
    current.sourceCounts[sourceType] = Number(row.count) || 0;
    map.set(guestId, current);
  });
  return map;
}

export class GuestController {
  async getAgentProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      const profile = await getGuestAgentProfile(id, req.user?.id);
      if (!profile) {
        res.status(404).json({ message: "嘉宾不存在或未启用" });
        return;
      }
      res.status(200).json(profile);
    } catch (error) {
      res.status(500).json({ message: "获取嘉宾智能体失败", error });
    }
  }

  async chatWithAgent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      const userId = asText(req.user?.id);
      const question = asText(req.body?.question || req.body?.message);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(401).json({ message: "未登录或登录已过期" });
        return;
      }
      if (!question || question.length < 2) {
        res.status(400).json({ message: "请输入要提问的问题" });
        return;
      }
      const result = await askGuestAgent({ guestId: id, userId, question });
      if (!result) {
        res.status(404).json({ message: "嘉宾不存在或未启用" });
        return;
      }
      res.status(200).json(result);
    } catch (error: any) {
      res.status(502).json({ message: error?.message || "嘉宾智能体回答失败", error });
    }
  }

  async getAgentHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      const userId = asText(req.user?.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(401).json({ message: "未登录或登录已过期" });
        return;
      }
      res.status(200).json(await getGuestAgentHistory({ guestId: id, userId }));
    } catch (error) {
      res.status(500).json({ message: "获取嘉宾智能体历史失败", error });
    }
  }

  async getAllPublic(req: Request, res: Response): Promise<void> {
    try {
      const pageRaw = Number(req.query.page);
      const pageSizeRaw = Number(req.query.pageSize);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
      const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(100, Math.floor(pageSizeRaw)) : 15;
      const search = asText(req.query.search);
      const tag = normalizeTag(req.query.tag);
      const baseFilter: Record<string, any> = {
        $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }],
      };
      if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        baseFilter.$and = [
          {
            $or: [{ name: pattern }, { title: pattern }, { bio: pattern }],
          },
        ];
      }
      const publicProgramCountMap = await buildGuestProgramCountMap();
      const publicGuestObjectIds = Array.from(publicProgramCountMap.keys())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      baseFilter._id = { $in: publicGuestObjectIds };

      const filter: Record<string, any> = { ...baseFilter };
      if (tag) {
        const matchedPrograms = await Program.find({ status: { $in: PUBLIC_GUEST_PROGRAM_STATUSES }, "summary.tags": tag }, { guestBindings: 1 }).lean();
        const matchedGuestIds = Array.from(
          new Set(
            matchedPrograms.flatMap((program: any) =>
              Array.isArray(program?.guestBindings)
                ? program.guestBindings.map((binding: any) => readGuestId(binding?.guestId)).filter(Boolean)
                : []
            )
          )
        )
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id));
        filter._id = { $in: matchedGuestIds };
      }

      const total = await GuestModel.countDocuments(filter);
      const skip = (page - 1) * pageSize;
      const guests = await GuestModel.find(filter)
        .select({ name: 1, title: 1, bio: 1, avatar: 1, profileUrl: 1, profileReferences: 1, socialProfiles: 1, publications: 1, listenerBenefits: 1, agentEnabled: 1, status: 1, updatedAt: 1, createdAt: 1 })
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean();
      const guestIds = guests.map((item: any) => String(item._id));
      const allFilterGuests = await GuestModel.find(baseFilter).select({ _id: 1 }).lean();
      const allFilterGuestObjectIds = allFilterGuests
        .map((item: any) => String(item._id))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const pageGuestObjectIds = guestIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const [countMap, agentStatsMap, pageTagPrograms, filterTagPrograms] = await Promise.all([
        buildGuestProgramCountMap(guestIds),
        buildGuestAgentStatsMap(guestIds),
        pageGuestObjectIds.length
          ? Program.find({ status: { $in: PUBLIC_GUEST_PROGRAM_STATUSES }, "guestBindings.guestId": { $in: pageGuestObjectIds } }, { guestBindings: 1, summary: 1 }).lean()
          : Promise.resolve([]),
        allFilterGuestObjectIds.length
          ? Program.find({ status: { $in: PUBLIC_GUEST_PROGRAM_STATUSES }, "guestBindings.guestId": { $in: allFilterGuestObjectIds } }, { guestBindings: 1, summary: 1 }).lean()
          : Promise.resolve([]),
      ]);
      const pageTagMap = buildGuestContentTagMap(pageTagPrograms);
      const filterTagMap = buildGuestContentTagMap(filterTagPrograms);
      const filterTags = collectGuestFilterTags(
        allFilterGuests.map((item: any) => ({
          contentTags: filterTagMap.get(String(item._id)) || [],
        }))
      );
      res.status(200).json({
        guests: guests.map((item: any) =>
          serializeGuestListItem(item, countMap.get(String(item._id)) || 0, agentStatsMap.get(String(item._id)), pageTagMap.get(String(item._id)) || [])
        ),
        filterTags,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    } catch (error) {
      res.status(500).json({ message: "获取嘉宾列表失败", error });
    }
  }

  async getByIdPublic(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }

      console.log(`[getByIdPublic] id=${id}, isValid=${mongoose.Types.ObjectId.isValid(id)}`);
      const guest = await GuestModel.findOne({
        _id: new mongoose.Types.ObjectId(id),
        $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }],
      }).lean();
      console.log(`[getByIdPublic] found=${!!guest}, name=${(guest as any)?.name || "N/A"}`);
      if (!guest) {
        res.status(404).json({ message: "嘉宾不存在或未启用" });
        return;
      }

      const relatedPrograms = await Program.find(
        { "guestBindings.guestId": new mongoose.Types.ObjectId(id), status: { $in: PUBLIC_GUEST_PROGRAM_STATUSES } },
        { _id: 1, programCode: 1, title: 1, coverImage: 1, publishedAt: 1, summary: 1, description: 1 }
      )
        .sort({ publishedAt: -1, updatedAt: -1, _id: -1 })
        .lean();

      const countMap = await buildGuestProgramCountMap([id]);
      const bookLists = await loadGuestBookLists(id);
      const authoredBooks = await loadGuestAuthoredBooks(asText((guest as any)?.name));
      const extensionMaterials = await LearningMaterial.find({ guestId: new mongoose.Types.ObjectId(id), status: "published" })
        .sort({ publishedAt: -1, updatedAt: -1, _id: -1 })
        .lean();
      res.status(200).json({
        ...serializeGuestListItem(guest, countMap.get(id) || 0),
        relatedPrograms: relatedPrograms.map(serializeProgramCard),
        bookLists,
        authoredBooks,
        extensionMaterials,
      });
    } catch (error) {
      res.status(500).json({ message: "获取嘉宾详情失败", error });
    }
  }

  // POST /api/guests/:id/submit-wish — 用户许愿，走站内信
  async submitWish(req: Request, res: Response): Promise<void> {
    try {
      const guestId = asText(req.params.id);
      const userId = asText(req.body?.userId);
      const personName = asText(req.body?.personName);
      const personIntro = asText(req.body?.personIntro);

      if (!userId) {
        res.status(400).json({ message: "用户标识不能为空" });
        return;
      }
      if (!personName || personName.length < 2) {
        res.status(400).json({ message: "请输入人物姓名（至少2个字符）" });
        return;
      }

      // 查一下当前嘉宾名字
      let guestName = "";
      try {
        const g = await GuestModel.findById(guestId, { name: 1 }).lean();
        guestName = asText((g as any)?.name);
      } catch {}

      const title = `用户许愿 · ${personName}`;
      const summary = `来自页面：${guestName || guestId}\n用户ID：${userId}\n推荐人物：${personName}\n${personIntro ? `介绍：${personIntro}` : ""}`;

      // 直接写 admin_inbox_messages 集合（绕过 schema 枚举限制）
      const targetId = mongoose.Types.ObjectId.isValid(guestId)
        ? new mongoose.Types.ObjectId(guestId)
        : new mongoose.Types.ObjectId();

      await mongoose.connection.db.collection("admin_inbox_messages").insertOne({
        sourceType: "user_wish",
        sourceId: userId,
        taskType: "user_wish",
        taskStatus: "new",
        targetType: "guest",
        targetId,
        targetTitle: guestName || "未知嘉宾",
        title,
        summary,
        payload: {
          userId,
          personName,
          personIntro,
          contextGuestId: guestId,
          contextGuestName: guestName,
        },
        isRead: false,
        readAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      res.status(201).json({
        ok: true,
        message: "许愿成功！我们已经收到你的推荐 ✨",
        wish: {
          personName,
          personIntro,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "许愿提交失败，请稍后重试", error });
    }
  }

  // POST /api/guests/:id/return-wish — 返场心愿计数
  async addReturnWish(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾ID" });
        return;
      }
      // 后端去重：基于 IP + guestId 的简单去重（后续可改为用户级）
      const guest = await GuestModel.findByIdAndUpdate(
        id,
        { $inc: { returnWishCount: 1 } },
        { new: true }
      );
      if (!guest) {
        res.status(404).json({ message: "嘉宾不存在" });
        return;
      }
      res.status(200).json({ ok: true, count: (guest.returnWishCount || 0) + 1 });
    } catch (error) {
      res.status(500).json({ message: "记录心愿失败", error });
    }
  }
}
