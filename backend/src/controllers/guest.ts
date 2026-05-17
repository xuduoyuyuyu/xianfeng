import { Request, Response } from "express";
import mongoose from "mongoose";
import GuestModel from "../models/Guest";
import Program from "../models/Program";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
    coverImage: asText(program?.coverImage),
    publishedAt: program?.publishedAt || null,
    summary: asText(program?.summary?.headline) || asText(program?.description),
  };
}

function serializeGuestListItem(guest: any, programCount = 0) {
  const profileReferences = Array.isArray(guest?.profileReferences) ? guest.profileReferences : [];
  const socialProfiles = normalizeSocialProfiles(Array.isArray(guest?.socialProfiles) ? guest.socialProfiles : []).filter((item) => item.status === "active");
  const publications = (
    normalizePublications(Array.isArray(guest?.publications) ? guest.publications : []).length > 0
      ? normalizePublications(Array.isArray(guest?.publications) ? guest.publications : [])
      : mapLegacyReferencesToPublications(profileReferences)
  ).filter((item) => item.status === "active");
  return {
    _id: String(guest?._id || ""),
    name: asText(guest?.name),
    title: asText(guest?.title),
    bio: asText(guest?.bio),
    avatar: asText(guest?.avatar),
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
    programCount,
    referenceCount: publications.length || profileReferences.filter((item: any) => asText(item?.url)).length,
  };
}

async function buildGuestProgramCountMap(guestIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const objectIds = guestIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!objectIds.length) return map;
  const rows = await Program.aggregate([
    { $match: { "guestBindings.guestId": { $in: objectIds } } },
    { $unwind: { path: "$guestBindings", preserveNullAndEmptyArrays: false } },
    { $match: { "guestBindings.guestId": { $in: objectIds } } },
    { $group: { _id: "$guestBindings.guestId", count: { $sum: 1 } } },
  ]);
  rows.forEach((row: any) => {
    map.set(String(row._id), Number(row.count) || 0);
  });
  return map;
}

export class GuestController {
  async getAllPublic(req: Request, res: Response): Promise<void> {
    try {
      const pageRaw = Number(req.query.page);
      const pageSizeRaw = Number(req.query.pageSize);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
      const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(100, Math.floor(pageSizeRaw)) : 15;
      const search = asText(req.query.search);
      const filter: Record<string, any> = {
        $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }],
      };
      if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$and = [
          {
            $or: [{ name: pattern }, { title: pattern }, { bio: pattern }],
          },
        ];
      }

      const total = await GuestModel.countDocuments(filter);
      const skip = (page - 1) * pageSize;
      const guests = await GuestModel.find(filter)
        .select({ name: 1, title: 1, bio: 1, avatar: 1, profileUrl: 1, profileReferences: 1, socialProfiles: 1, publications: 1, status: 1, updatedAt: 1, createdAt: 1 })
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean();
      const countMap = await buildGuestProgramCountMap(guests.map((item: any) => String(item._id)));
      res.status(200).json({
        guests: guests.map((item: any) => serializeGuestListItem(item, countMap.get(String(item._id)) || 0)),
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

      const guest = await GuestModel.findOne({
        _id: new mongoose.Types.ObjectId(id),
        $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }],
      }).lean();
      if (!guest) {
        res.status(404).json({ message: "嘉宾不存在或未启用" });
        return;
      }

      const relatedPrograms = await Program.find(
        { "guestBindings.guestId": new mongoose.Types.ObjectId(id) },
        { _id: 1, programCode: 1, title: 1, coverImage: 1, publishedAt: 1, summary: 1, description: 1 }
      )
        .sort({ publishedAt: -1, updatedAt: -1, _id: -1 })
        .limit(12)
        .lean();

      const countMap = await buildGuestProgramCountMap([id]);
      res.status(200).json({
        ...serializeGuestListItem(guest, countMap.get(id) || 0),
        relatedPrograms: relatedPrograms.map(serializeProgramCard),
      });
    } catch (error) {
      res.status(500).json({ message: "获取嘉宾详情失败", error });
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
