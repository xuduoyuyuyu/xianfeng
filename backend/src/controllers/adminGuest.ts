import { Request, Response } from "express";
import mongoose from "mongoose";
import GuestModel from "../models/Guest";
import Program from "../models/Program";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeGuestName(value: unknown): string {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBindingProgramIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((item) => asText(item))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )
  );
}

function normalizeProgramGuestBindings(bindings: any[], targetGuestId?: string) {
  const rows = Array.isArray(bindings) ? bindings : [];
  const sorted = rows
    .filter((item) => mongoose.Types.ObjectId.isValid(String(item?.guestId || "")))
    .map((item, idx) => ({
      guestId: new mongoose.Types.ObjectId(String(item.guestId)),
      role: asText(item?.role) || "main_guest",
      order: Number(item?.order) || (idx + 1),
    }))
    .sort((a, b) => a.order - b.order);

  const dedup = new Map<string, { guestId: mongoose.Types.ObjectId; role: string; order: number }>();
  sorted.forEach((item) => {
    const key = String(item.guestId);
    if (!dedup.has(key)) dedup.set(key, item);
  });

  const normalized = Array.from(dedup.values()).map((item, idx) => ({
    guestId: item.guestId,
    role: item.role || "main_guest",
    order: idx + 1,
  }));

  if (targetGuestId && !normalized.some((item) => String(item.guestId) === targetGuestId)) {
    normalized.push({
      guestId: new mongoose.Types.ObjectId(targetGuestId),
      role: "main_guest",
      order: normalized.length + 1,
    });
  }
  return normalized;
}

async function buildGuestProgramCountMap(guestIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!guestIds.length) return map;
  const objectIds = guestIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (!objectIds.length) return map;
  const rows = await Program.aggregate([
    { $unwind: { path: "$guestBindings", preserveNullAndEmptyArrays: false } },
    { $match: { "guestBindings.guestId": { $in: objectIds } } },
    { $group: { _id: "$guestBindings.guestId", count: { $sum: 1 } } },
  ]);
  rows.forEach((row: any) => {
    map.set(String(row._id), Number(row.count) || 0);
  });
  return map;
}

function serializeGuest(guest: any, programCount = 0) {
  return {
    _id: String(guest._id),
    name: guest.name || "",
    normalizedName: guest.normalizedName || "",
    title: guest.title || "",
    bio: guest.bio || "",
    avatar: guest.avatar || "",
    profileUrl: guest.profileUrl || "",
    profileMarkdown: guest.profileMarkdown || "",
    profileReferences: Array.isArray(guest.profileReferences) ? guest.profileReferences : [],
    profileAvatarCandidates: Array.isArray(guest.profileAvatarCandidates) ? guest.profileAvatarCandidates : [],
    profileGeneratedAt: guest.profileGeneratedAt || null,
    status: guest.status === "inactive" ? "inactive" : "active",
    createdAt: guest.createdAt,
    updatedAt: guest.updatedAt,
    programCount,
  };
}

export class AdminGuestController {
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const search = asText(req.query.search);
      const status = asText(req.query.status);
      const filter: Record<string, any> = {};
      if (status === "active" || status === "inactive") {
        filter.status = status;
      }
      if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ name: pattern }, { title: pattern }, { bio: pattern }];
      }
      const guests = await GuestModel.find(filter).sort({ updatedAt: -1 }).lean();
      const ids = guests.map((item: any) => String(item._id));
      const countMap = await buildGuestProgramCountMap(ids);
      res.status(200).json(guests.map((item: any) => serializeGuest(item, countMap.get(String(item._id)) || 0)));
    } catch (error) {
      res.status(500).json({ message: "获取嘉宾列表失败", error });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      const guest = await GuestModel.findById(id).lean();
      if (!guest) {
        res.status(404).json({ message: "嘉宾不存在" });
        return;
      }
      const countMap = await buildGuestProgramCountMap([id]);
      res.status(200).json(serializeGuest(guest, countMap.get(id) || 0));
    } catch (error) {
      res.status(500).json({ message: "获取嘉宾详情失败", error });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const name = asText(req.body?.name);
      const normalizedName = normalizeGuestName(name);
      if (!name || !normalizedName) {
        res.status(400).json({ message: "嘉宾姓名不能为空" });
        return;
      }
      const existing = await GuestModel.findOne({ normalizedName }).lean();
      if (existing) {
        const nextProfileMarkdown =
          typeof req.body?.profileMarkdown === "string"
            ? asText(req.body?.profileMarkdown)
            : asText((existing as any)?.profileMarkdown);
        const nextProfileReferences = Array.isArray(req.body?.profileReferences)
          ? req.body.profileReferences
          : Array.isArray((existing as any)?.profileReferences)
          ? (existing as any).profileReferences
          : [];
        const nextProfileAvatarCandidates = Array.isArray(req.body?.profileAvatarCandidates)
          ? req.body.profileAvatarCandidates
          : Array.isArray((existing as any)?.profileAvatarCandidates)
          ? (existing as any).profileAvatarCandidates
          : [];
        const nextProfileGeneratedAt =
          req.body?.profileGeneratedAt !== undefined
            ? req.body?.profileGeneratedAt || null
            : (existing as any)?.profileGeneratedAt || null;
        const updated = await GuestModel.findByIdAndUpdate(
          existing._id,
          {
            name,
            normalizedName,
            title: asText(req.body?.title),
            bio: asText(req.body?.bio),
            avatar: asText(req.body?.avatar),
            profileUrl: asText(req.body?.profileUrl),
            profileMarkdown: nextProfileMarkdown,
            profileReferences: nextProfileReferences,
            profileAvatarCandidates: nextProfileAvatarCandidates,
            profileGeneratedAt: nextProfileGeneratedAt,
            status: req.body?.status === "inactive" ? "inactive" : "active",
          },
          { new: true }
        ).lean();
        if (!updated) {
          res.status(409).json({
            message: "嘉宾已存在（姓名重复）",
            conflictGuest: serializeGuest(existing, 0),
          });
          return;
        }
        const countMap = await buildGuestProgramCountMap([String(updated._id)]);
        res.status(200).json({
          ...serializeGuest(updated, countMap.get(String(updated._id)) || 0),
          mergedFromDuplicate: true,
        });
        return;
      }
      const guest = await GuestModel.create({
        name,
        normalizedName,
        title: asText(req.body?.title),
        bio: asText(req.body?.bio),
        avatar: asText(req.body?.avatar),
        profileUrl: asText(req.body?.profileUrl),
        profileMarkdown: asText(req.body?.profileMarkdown),
        profileReferences: Array.isArray(req.body?.profileReferences) ? req.body.profileReferences : [],
        profileAvatarCandidates: Array.isArray(req.body?.profileAvatarCandidates) ? req.body.profileAvatarCandidates : [],
        profileGeneratedAt: req.body?.profileGeneratedAt || null,
        status: req.body?.status === "inactive" ? "inactive" : "active",
      });
      res.status(201).json(serializeGuest(guest.toObject(), 0));
    } catch (error: any) {
      if (error?.code === 11000) {
        res.status(409).json({ message: "嘉宾已存在（姓名重复）" });
        return;
      }
      const detail = asText(error?.message);
      res.status(400).json({ message: detail || "创建嘉宾失败", error });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      const payload: Record<string, any> = {
        title: asText(req.body?.title),
        bio: asText(req.body?.bio),
        avatar: asText(req.body?.avatar),
        profileUrl: asText(req.body?.profileUrl),
      };
      if (typeof req.body?.profileMarkdown === "string") {
        payload.profileMarkdown = asText(req.body?.profileMarkdown);
      }
      if (Array.isArray(req.body?.profileReferences)) {
        payload.profileReferences = req.body.profileReferences;
      }
      if (Array.isArray(req.body?.profileAvatarCandidates)) {
        payload.profileAvatarCandidates = req.body.profileAvatarCandidates;
      }
      if (req.body?.profileGeneratedAt !== undefined) {
        payload.profileGeneratedAt = req.body?.profileGeneratedAt || null;
      }
      const nextName = asText(req.body?.name);
      if (nextName) {
        payload.name = nextName;
        payload.normalizedName = normalizeGuestName(nextName);
        const duplicate = await GuestModel.findOne({
          normalizedName: payload.normalizedName,
          _id: { $ne: new mongoose.Types.ObjectId(id) },
        }).lean();
        if (duplicate) {
          res.status(409).json({
            message: "嘉宾已存在（姓名重复）",
            conflictGuest: serializeGuest(duplicate, 0),
          });
          return;
        }
      }
      if (req.body?.status === "active" || req.body?.status === "inactive") {
        payload.status = req.body.status;
      }
      const updated = await GuestModel.findByIdAndUpdate(id, payload, { new: true }).lean();
      if (!updated) {
        res.status(404).json({ message: "嘉宾不存在" });
        return;
      }
      const countMap = await buildGuestProgramCountMap([id]);
      res.status(200).json(serializeGuest(updated, countMap.get(id) || 0));
    } catch (error: any) {
      if (error?.code === 11000) {
        res.status(409).json({ message: "嘉宾已存在（姓名重复）" });
        return;
      }
      const detail = asText(error?.message);
      res.status(400).json({ message: detail || "更新嘉宾失败", error });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      const status = req.body?.status;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      if (status !== "active" && status !== "inactive") {
        res.status(400).json({ message: "状态仅支持 active 或 inactive" });
        return;
      }
      const updated = await GuestModel.findByIdAndUpdate(id, { status }, { new: true }).lean();
      if (!updated) {
        res.status(404).json({ message: "嘉宾不存在" });
        return;
      }
      const countMap = await buildGuestProgramCountMap([id]);
      res.status(200).json(serializeGuest(updated, countMap.get(id) || 0));
    } catch (error) {
      res.status(400).json({ message: "更新嘉宾状态失败", error });
    }
  }

  async remove(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      const guest = await GuestModel.findById(id).lean();
      if (!guest) {
        res.status(404).json({ message: "嘉宾不存在" });
        return;
      }
      const refCount = await Program.countDocuments({ "guestBindings.guestId": new mongoose.Types.ObjectId(id) });
      if (refCount > 0) {
        res.status(409).json({ message: "嘉宾已被节目引用，禁止删除，请改为停用" });
        return;
      }
      await GuestModel.findByIdAndDelete(id);
      res.status(200).json({ message: "嘉宾删除成功" });
    } catch (error) {
      res.status(500).json({ message: "删除嘉宾失败", error });
    }
  }

  async getProgramBindings(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      const guest = await GuestModel.findById(id).lean();
      if (!guest) {
        res.status(404).json({ message: "嘉宾不存在" });
        return;
      }
      const search = asText(req.query.search);
      const filter: Record<string, any> = { "guestBindings.guestId": new mongoose.Types.ObjectId(id) };
      if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ title: pattern }, { programCode: pattern }];
      }
      const programs = await Program.find(filter, { _id: 1, title: 1, programCode: 1, status: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .lean();
      res.status(200).json({
        items: programs.map((item: any) => ({
          _id: String(item._id),
          title: item.title || "",
          programCode: item.programCode || "",
          status: item.status || "draft",
          updatedAt: item.updatedAt || null,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "获取嘉宾绑定节目失败", error });
    }
  }

  async updateProgramBindings(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      const guest = await GuestModel.findById(id).lean();
      if (!guest) {
        res.status(404).json({ message: "嘉宾不存在" });
        return;
      }

      const targetProgramIds = normalizeBindingProgramIds(req.body?.programIds);
      const currentPrograms = await Program.find(
        { "guestBindings.guestId": new mongoose.Types.ObjectId(id) },
        { _id: 1 }
      ).lean();
      const currentProgramIds = currentPrograms.map((item: any) => String(item._id));

      const targetSet = new Set(targetProgramIds);
      const currentSet = new Set(currentProgramIds);
      const toAdd = targetProgramIds.filter((pid) => !currentSet.has(pid));
      const toRemove = currentProgramIds.filter((pid) => !targetSet.has(pid));

      if (toRemove.length > 0) {
        await Program.updateMany(
          { _id: { $in: toRemove.map((pid) => new mongoose.Types.ObjectId(pid)) } },
          { $pull: { guestBindings: { guestId: new mongoose.Types.ObjectId(id) } } }
        );
      }

      if (toAdd.length > 0) {
        const rows = await Program.find({ _id: { $in: toAdd.map((pid) => new mongoose.Types.ObjectId(pid)) } }).lean();
        const foundIds = new Set(rows.map((item: any) => String(item._id)));
        const missing = toAdd.filter((pid) => !foundIds.has(pid));
        if (missing.length > 0) {
          res.status(400).json({ message: `部分节目不存在：${missing.join(",")}` });
          return;
        }

        for (const row of rows) {
          const nextBindings = normalizeProgramGuestBindings((row as any).guestBindings, id);
          await Program.findByIdAndUpdate(row._id, { guestBindings: nextBindings }, { new: false });
        }
      }

      const affected = Array.from(new Set([...toAdd, ...toRemove]));
      for (const pid of affected) {
        const program = await Program.findById(pid).lean();
        if (!program) continue;
        const normalized = normalizeProgramGuestBindings((program as any).guestBindings);
        await Program.findByIdAndUpdate(pid, { guestBindings: normalized }, { new: false });
      }

      const countMap = await buildGuestProgramCountMap([id]);
      const updatedGuest = await GuestModel.findById(id).lean();
      res.status(200).json({
        ok: true,
        guest: updatedGuest ? serializeGuest(updatedGuest, countMap.get(id) || 0) : null,
        programIds: targetProgramIds,
      });
    } catch (error) {
      res.status(500).json({ message: "更新嘉宾绑定节目失败", error });
    }
  }
}
