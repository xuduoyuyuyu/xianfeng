import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import * as XLSX from "xlsx";
import MamaResourceProfile, { MamaResourceStatus } from "../models/MamaResourceProfile";
import MamaResourceTask, { MamaResourceTaskStatus } from "../models/MamaResourceTask";
import MamaResourceTaskAssignment, { MamaResourceTaskAssignmentStatus } from "../models/MamaResourceTaskAssignment";
import MamaResourceTaskContentLink from "../models/MamaResourceTaskContentLink";
import User from "../models/User";
import {
  assignNextMamaResourceContentLink,
  distributeMamaResourceContentLinks,
  getMamaResourceContentLinkStats,
  MamaResourceContentLinkStats,
  normalizeMamaResourceContentUrl as normalizeContentUrl,
  parseMamaResourceContentLinks,
  syncMamaResourceTaskContentState,
} from "../services/mamaResourceContentLinks";

const router = Router();
const STATUSES: MamaResourceStatus[] = ["pending", "approved", "needs_info", "rejected"];
const TASK_STATUSES: MamaResourceTaskStatus[] = ["listed", "paused", "archived"];
const ASSIGNMENT_STATUSES: MamaResourceTaskAssignmentStatus[] = ["assigned", "submitted", "collected", "rejected"];
const MEDIA_PLATFORMS = new Set(["xiaohongshu", "douyin", "shipinhao", "gongzhonghao", "other"]);
const PROOF_RETURN_WINDOW_MS = 24 * 60 * 60 * 1000;
const contentImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function asTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  return asText(value)
    .split(/[,，、\n]/)
    .map(asText)
    .filter(Boolean);
}

function asOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asOptionalDate(value: unknown): Date | null {
  const text = asText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeManualProfileUrl(platform: string, value: unknown) {
  const raw = asText(value);
  const directUrl = raw.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[，。；！？、）)\]}>]+$/, "") || "";
  if (!directUrl) return { profileUrl: "", normalizedProfileUrl: "" };
  let url: URL;
  try {
    url = new URL(directUrl);
  } catch (_error) {
    return { profileUrl: "", normalizedProfileUrl: "" };
  }
  if (platform === "xiaohongshu") {
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, "");
    if (host.includes("xiaohongshu.com") && pathname) {
      return {
        profileUrl: `https://www.xiaohongshu.com${pathname}`,
        normalizedProfileUrl: `xiaohongshu:${pathname.replace(/^\/+/, "").toLowerCase()}`,
      };
    }
  }
  return {
    profileUrl: directUrl,
    normalizedProfileUrl: `${platform}:${directUrl.toLowerCase()}`,
  };
}

function normalizePhoneDigits(value: unknown): string {
  return asText(value).replace(/\D/g, "");
}

function manualMediaAccounts(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.map((item) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const platform = asText(source.platform);
    const { profileUrl, normalizedProfileUrl } = normalizeManualProfileUrl(platform, source.profileUrl);
    if (!MEDIA_PLATFORMS.has(platform) || !profileUrl || !normalizedProfileUrl) {
      throw new Error("社交媒体账号的平台或主页链接不完整");
    }
    return {
      platform,
      profileUrl,
      normalizedProfileUrl,
      nickname: asText(source.nickname),
      followerCount: asOptionalNumber(source.followerCount),
      screenshotUrl: asText(source.screenshotUrl),
      realNameVerified: source.realNameVerified === true ? true : source.realNameVerified === false ? false : null,
      dataSource: "manual",
      lastCapturedAt: asOptionalDate(source.lastCapturedAt),
    };
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function idQuery(id: string) {
  if (mongoose.Types.ObjectId.isValid(id)) return { _id: id };
  return { _id: null };
}

type ContentImportSourceRow = {
  rowNumber: number;
  profileId: string;
  rawContentUrl: unknown;
};

async function analyzeContentImportRows(taskId: mongoose.Types.ObjectId, sourceRows: ContentImportSourceRow[]) {
  const idCounts = new Map<string, number>();
  sourceRows.forEach((row) => idCounts.set(row.profileId, (idCounts.get(row.profileId) || 0) + 1));
  const validObjectIds = sourceRows
    .map((row) => row.profileId)
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  const [profiles, assignments] = await Promise.all([
    MamaResourceProfile.find({ _id: { $in: validObjectIds } }).lean(),
    MamaResourceTaskAssignment.find({ taskId, profileId: { $in: validObjectIds } }).lean(),
  ]);
  const profilesById = new Map(profiles.map((profile) => [String(profile._id), profile]));
  const assignmentsByProfileId = new Map(assignments.map((assignment) => [String(assignment.profileId), assignment]));

  return sourceRows.map((row) => {
    const errors: string[] = [];
    let contentUrl = "";
    if (!mongoose.Types.ObjectId.isValid(row.profileId)) errors.push("账号ID格式错误");
    if ((idCounts.get(row.profileId) || 0) > 1) errors.push("账号ID重复");
    const profile = profilesById.get(row.profileId);
    if (mongoose.Types.ObjectId.isValid(row.profileId)) {
      if (!profile) errors.push("账号不存在");
      else if (profile.status !== "approved") errors.push("账号尚未通过审核");
    }
    try {
      contentUrl = normalizeContentUrl(row.rawContentUrl);
      if (!contentUrl) errors.push("专属内容链接为空");
    } catch (error: any) {
      errors.push(error?.message || "专属内容链接格式错误");
    }
    const assignment = assignmentsByProfileId.get(row.profileId);
    if (profile?.status === "approved" && !assignment) errors.push("账号尚未领取该任务");
    const action = !assignment
      ? "create_assignment"
      : assignment.contentUrl === contentUrl
        ? "unchanged"
        : "update_link";
    return {
      rowNumber: row.rowNumber,
      profileId: row.profileId,
      displayName: asText(profile?.displayName),
      contentUrl,
      action,
      valid: errors.length === 0,
      errors,
    };
  });
}

function buildListFilter(query: Request["query"]) {
  const filter: any = {};
  const status = asText(query.status);
  const category = asText(query.category);
  const search = asText(query.search);
  const minFollowers = asOptionalNumber(query.minFollowers);
  const operatorTag = asText(query.operatorTag);
  const orderBlocked = asText(query.orderBlocked);
  const childStage = asText(query.childStage);
  const childGender = asText(query.childGender);
  const contentCapabilities = asTextArray(query.contentCapabilities);
  const platform = asText(query.platform);

  if (STATUSES.includes(status as MamaResourceStatus)) {
    filter.status = status;
  }
  if (category) {
    filter.categories = category;
  }
  if (minFollowers !== null) {
    filter["socialAccount.followerCount"] = { $gte: minFollowers };
  }
  if (operatorTag) {
    filter.operatorTags = operatorTag;
  }
  if (orderBlocked === "true" || orderBlocked === "false") {
    filter.orderBlocked = orderBlocked === "true";
  }
  if (childStage) filter.childStage = childStage;
  if (childGender) filter.childGender = childGender;
  if (contentCapabilities.length) filter.contentCapabilities = { $all: contentCapabilities };
  if (MEDIA_PLATFORMS.has(platform)) {
    filter.$and = [{ $or: [{ "mediaAccounts.platform": platform }, { "socialAccount.platform": platform }] }];
  }
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { displayName: pattern },
      { contactPhone: pattern },
      { contactWechat: pattern },
      { city: pattern },
      { accountPositioning: pattern },
      { categories: pattern },
      { operatorTags: pattern },
      { "socialAccount.nickname": pattern },
      { "socialAccount.profileUrl": pattern },
    ];
  }
  return filter;
}

function buildTaskWritePayload(body: any, title: string) {
  return {
    title,
    platform: "xiaohongshu",
    category: asText(body?.category),
    matchCategories: asTextArray(body?.matchCategories || body?.category),
    matchRiskTags: asTextArray(body?.matchRiskTags),
    minFollowerCount: asOptionalNumber(body?.minFollowerCount),
    difficulty: asText(body?.difficulty),
    phase: asText(body?.phase),
    unitPriceCents: asOptionalNumber(body?.unitPriceCents) || 0,
    trafficFeeCents: asOptionalNumber(body?.trafficFeeCents),
    dataCycle: asText(body?.dataCycle),
    settlementCycle: asText(body?.settlementCycle),
    promotionCount: asOptionalNumber(body?.promotionCount),
    claimLimit: asOptionalNumber(body?.claimLimit),
    latestDataDate: asOptionalDate(body?.latestDataDate),
    announcement: asText(body?.announcement),
    settlementStandard: asText(body?.settlementStandard),
    requirement: asText(body?.requirement),
    externalUrl: asText(body?.externalUrl),
    exampleImageUrls: asTextArray(body?.exampleImageUrls).slice(0, 12),
    status: TASK_STATUSES.includes(asText(body?.status) as MamaResourceTaskStatus) ? asText(body?.status) : "listed",
  };
}

function serializeProfile(profile: any) {
  const source = typeof profile.toObject === "function" ? profile.toObject() : profile;
  return {
    ...source,
    _id: String(source._id),
    userId: source.userId ? String(source.userId) : undefined,
  };
}

function serializeTask(task: any, stats?: Map<string, MamaResourceContentLinkStats>) {
  const source = typeof task.toObject === "function" ? task.toObject() : task;
  const contentStats = stats?.get(String(source._id)) || { total: 0, assigned: 0, remaining: 0 };
  return {
    ...source,
    _id: String(source._id),
    contentLinkCount: contentStats.total,
    contentLinkAssignedCount: contentStats.assigned,
    contentLinkRemainingCount: contentStats.remaining,
  };
}

function assignmentProofStatus(assignment: any): "returned" | "missing" | "overdue" {
  const source = typeof assignment?.toObject === "function" ? assignment.toObject() : assignment;
  if (asText(source?.proofScreenshotUrl)) return "returned";
  const contentUpdatedAt = new Date(source?.contentUpdatedAt || "");
  if (asText(source?.contentUrl) && !Number.isNaN(contentUpdatedAt.getTime()) && Date.now() - contentUpdatedAt.getTime() >= PROOF_RETURN_WINDOW_MS) {
    return "overdue";
  }
  return "missing";
}

function serializeAssignment(assignment: any) {
  const source = typeof assignment.toObject === "function" ? assignment.toObject() : assignment;
  return {
    ...source,
    _id: String(source._id),
    taskId: String(source.taskId?._id || source.taskId),
    profileId: String(source.profileId?._id || source.profileId),
    proofStatus: assignmentProofStatus(source),
    task: source.taskId && typeof source.taskId === "object" ? serializeTask(source.taskId) : undefined,
    profile: source.profileId && typeof source.profileId === "object" ? serializeProfile(source.profileId) : undefined,
  };
}

async function serializeAssignmentsWithUsers(assignments: any[]) {
  const userIds = Array.from(new Set(assignments
    .map((assignment) => {
      const source = typeof assignment.toObject === "function" ? assignment.toObject() : assignment;
      return asText(source.profileId?.userId);
    })
    .filter((id) => mongoose.Types.ObjectId.isValid(id))));
  const phones = Array.from(new Set(assignments
    .map((assignment) => {
      const source = typeof assignment.toObject === "function" ? assignment.toObject() : assignment;
      return normalizePhoneDigits(source.profileId?.contactPhone);
    })
    .filter(Boolean)));
  const userClauses: any[] = [];
  if (userIds.length) userClauses.push({ _id: { $in: userIds } });
  if (phones.length) userClauses.push({ mobile: { $in: phones } });
  const users = userClauses.length
    ? await User.find({ $or: userClauses })
      .select("username mobile name city region grade childGrade")
      .lean()
    : [];
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const userByPhone = new Map(users.map((user) => [normalizePhoneDigits(user.mobile), user]));
  return assignments.map((assignment) => {
    const serialized = serializeAssignment(assignment);
    const user = userById.get(asText(serialized.profile?.userId))
      || userByPhone.get(normalizePhoneDigits(serialized.profile?.contactPhone));
    return {
      ...serialized,
      user: user
        ? {
          _id: String(user._id),
          username: asText(user.username),
          mobile: asText(user.mobile),
          name: asText(user.name),
          city: asText(user.city),
          region: asText(user.region),
          grade: asText(user.grade),
          childGrade: asText(user.childGrade),
        }
        : null,
    };
  });
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(asText(req.query.page), 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(asText(req.query.pageSize || req.query.limit), 10) || 20));
    const filter = buildListFilter(req.query);
    const search = asText(req.query.search);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      const uidUserIds = await User.find({ publicUid: pattern }).distinct("_id");
      if (uidUserIds.length) {
        filter.$or = [...(filter.$or || []), { userId: { $in: uidUserIds } }];
      }
    }
    const userGender = asText(req.query.userGender);
    if (userGender) {
      const userIds = await User.find({ gender: userGender }).distinct("_id");
      filter.userId = { $in: userIds };
    }
    const [items, total] = await Promise.all([
      MamaResourceProfile.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      MamaResourceProfile.countDocuments(filter),
    ]);
    const userIds = items.map((item: any) => item.userId).filter(Boolean);
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select("_id publicUid").lean()
      : [];
    const publicUidByUserId = new Map(users.map((user: any) => [String(user._id), asText(user.publicUid)]));
    res.json({
      items: items.map((item: any) => ({
        ...serializeProfile(item),
        publicUid: publicUidByUserId.get(String(item.userId || "")) || "",
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取妈妈资源池失败" });
  }
});

router.get("/tasks", async (_req: Request, res: Response) => {
  try {
    const tasks = await MamaResourceTask.find({}).sort({ updatedAt: -1 }).lean();
    const stats = await getMamaResourceContentLinkStats(tasks.map((task) => task._id));
    res.json({ tasks: tasks.map((task) => serializeTask(task, stats)) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取任务失败" });
  }
});

router.get("/tasks/content-import/template", (_req: Request, res: Response) => {
  const sheet = XLSX.utils.json_to_sheet([
    { 好赚账号ID: "请填写系统账号ID", 专属内容链接: "https://my.feishu.cn/wiki/example" },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "专属链接");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="mama-resource-content-import.xlsx"');
  res.send(buffer);
});

router.post("/tasks/:taskId/content-links", async (req: Request, res: Response) => {
  try {
    const task = await MamaResourceTask.findOne(idQuery(asText(req.params.taskId)));
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    const parsed = parseMamaResourceContentLinks(req.body);
    if (!parsed.links.length) {
      res.status(400).json({ message: "请粘贴至少 1 个专属内容链接" });
      return;
    }
    const existingLinks = new Set(
      (await MamaResourceTaskContentLink.find({ taskId: task._id, url: { $in: parsed.links } }).select("url").lean())
        .map((item: any) => asText(item.url))
    );
    const latest = await MamaResourceTaskContentLink.findOne({ taskId: task._id })
      .sort({ importIndex: -1 })
      .select("importIndex")
      .lean();
    let importIndex = Math.max(-1, Number(latest?.importIndex ?? -1));
    const documents = parsed.links
      .filter((url) => !existingLinks.has(url))
      .map((url) => {
        importIndex += 1;
        return { taskId: task._id, url, importIndex };
      });
    if (documents.length) {
      await MamaResourceTaskContentLink.insertMany(documents, { ordered: true });
    }
    if (!task.contentLinkPoolEnabled) {
      task.contentLinkPoolEnabled = true;
      await task.save();
    }
    const assignedCount = await distributeMamaResourceContentLinks(task._id);
    const [updatedTask, stats] = await Promise.all([
      MamaResourceTask.findById(task._id),
      getMamaResourceContentLinkStats([task._id]),
    ]);
    res.json({
      importedCount: documents.length,
      skippedCount: parsed.duplicateCount + parsed.links.length - documents.length,
      assignedCount,
      task: serializeTask(updatedTask || task, stats),
    });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "导入专属内容链接失败" });
  }
});

router.patch("/tasks/assignments/:assignmentId/content", async (req: Request, res: Response) => {
  try {
    const contentUrl = normalizeContentUrl(req.body?.contentUrl);
    const contentUpdatedAt = contentUrl ? new Date() : null;
    const assignment = await MamaResourceTaskAssignment.findOneAndUpdate(
      idQuery(asText(req.params.assignmentId)),
      { contentUrl, contentUpdatedAt },
      { returnDocument: "after", runValidators: true }
    )
      .populate("taskId")
      .populate("profileId");
    if (!assignment) {
      res.status(404).json({ message: "任务账号不存在" });
      return;
    }
    if (!contentUrl) {
      await MamaResourceTaskContentLink.updateMany(
        { assignmentId: assignment._id },
        { $set: { assignmentId: null, assignedProfileId: null, assignedAt: null } }
      );
      await syncMamaResourceTaskContentState(assignment.taskId);
    }
    res.json({ assignment: (await serializeAssignmentsWithUsers([assignment]))[0] });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "保存专属内容链接失败" });
  }
});

router.patch("/tasks/assignments/:assignmentId/transfer-screenshot", async (req: Request, res: Response) => {
  try {
    const transferScreenshotUrl = asText(req.body?.transferScreenshotUrl);
    if (!transferScreenshotUrl) {
      res.status(400).json({ message: "请上传转账截图" });
      return;
    }
    const assignment = await MamaResourceTaskAssignment.findOneAndUpdate(
      idQuery(asText(req.params.assignmentId)),
      { transferScreenshotUrl, transferScreenshotUpdatedAt: new Date() },
      { returnDocument: "after", runValidators: true }
    )
      .populate("taskId")
      .populate("profileId");
    if (!assignment) {
      res.status(404).json({ message: "任务账号不存在" });
      return;
    }
    res.json({ assignment: (await serializeAssignmentsWithUsers([assignment]))[0] });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "保存转账截图失败" });
  }
});

router.post(
  "/tasks/:taskId/content-import/preview",
  contentImportUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const task = await MamaResourceTask.findOne(idQuery(asText(req.params.taskId))).lean();
      if (!task) {
        res.status(404).json({ message: "任务不存在" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ message: "请上传 Excel 文件" });
        return;
      }
      const workbook = XLSX.read(req.file.buffer);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const rows = await analyzeContentImportRows(
        task._id,
        rawRows.map((row, index) => ({
          rowNumber: index + 2,
          profileId: asText(row["好赚账号ID"] || row["妈妈好赚账号ID"]),
          rawContentUrl: row["专属内容链接"],
        }))
      );
      const valid = rows.filter((row) => row.valid).length;
      res.json({ rows, summary: { total: rows.length, valid, invalid: rows.length - valid } });
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Excel 预检失败" });
    }
  }
);

router.post("/tasks/:taskId/content-import/commit", async (req: Request, res: Response) => {
  try {
    const task = await MamaResourceTask.findOne(idQuery(asText(req.params.taskId))).lean();
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    const inputRows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 1000) : [];
    if (inputRows.length === 0) {
      res.status(400).json({ message: "没有可导入的数据" });
      return;
    }
    const rows = await analyzeContentImportRows(
      task._id,
      inputRows.map((row: any, index: number) => ({
        rowNumber: index + 1,
        profileId: asText(row?.profileId),
        rawContentUrl: row?.contentUrl,
      }))
    );
    const invalidRows = rows.filter((row) => !row.valid);
    if (invalidRows.length > 0) {
      res.status(400).json({ message: "导入数据已失效，请重新预检", rows: invalidRows });
      return;
    }
    const created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const row of rows) {
      if (row.action === "unchanged") {
        unchanged += 1;
        continue;
      }
      const now = new Date();
      await MamaResourceTaskAssignment.updateOne(
        { taskId: task._id, profileId: row.profileId },
        { contentUrl: row.contentUrl, contentUpdatedAt: now }
      );
      updated += 1;
    }
    res.json({ summary: { created, updated, unchanged } });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "导入专属内容链接失败" });
  }
});

router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const title = asText(req.body?.title);
    if (!title) {
      res.status(400).json({ message: "请填写任务标题" });
      return;
    }

    const task = await MamaResourceTask.create(buildTaskWritePayload(req.body, title));

    res.status(201).json({ task: serializeTask(task), assignments: [] });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "上架任务失败" });
  }
});

router.patch("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const title = asText(req.body?.title);
    if (!title) {
      res.status(400).json({ message: "请填写任务标题" });
      return;
    }

    const task = await MamaResourceTask.findOneAndUpdate(
      idQuery(asText(req.params.taskId)),
      { $set: buildTaskWritePayload(req.body, title) },
      { returnDocument: "after", runValidators: true }
    );
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }

    await syncMamaResourceTaskContentState(task._id);
    const [syncedTask, stats] = await Promise.all([
      MamaResourceTask.findById(task._id),
      getMamaResourceContentLinkStats([task._id]),
    ]);
    res.json({ task: serializeTask(syncedTask || task, stats) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "更新任务失败" });
  }
});

router.get("/tasks/:taskId/candidates", async (req: Request, res: Response) => {
  try {
    const task = await MamaResourceTask.findOne(idQuery(asText(req.params.taskId))).lean();
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    const filter = buildListFilter({ ...req.query, status: "approved" });
    const riskTag = asText(req.query.riskTag);
    if (riskTag) filter["reviewNote.riskTags"] = riskTag;
    const claimedAssignments = await MamaResourceTaskAssignment.find({ taskId: task._id }).lean();
    const profiles = await MamaResourceProfile.find({
      ...filter,
      _id: { $in: claimedAssignments.map((assignment) => assignment.profileId) },
    }).sort({ updatedAt: -1 }).limit(100).lean();
    const profileIds = new Set(profiles.map((profile) => String(profile._id)));
    const assignments = claimedAssignments.filter((assignment) => profileIds.has(String(assignment.profileId)));
    const assignmentByProfile = new Map(assignments.map((assignment) => [String(assignment.profileId), assignment]));
    res.json({
      items: profiles.map((profile) => {
        const assignment = assignmentByProfile.get(String(profile._id));
        return {
          ...serializeProfile(profile),
          assignmentId: assignment ? String(assignment._id) : "",
          assignmentStatus: assignment?.status || "",
        };
      }),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取候选账号失败" });
  }
});

router.post("/tasks/:taskId/assignments", async (req: Request, res: Response) => {
  try {
    const task = await MamaResourceTask.findOne(idQuery(asText(req.params.taskId)));
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    const profileIds = Array.from(new Set(asTextArray(req.body?.profileIds))).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (profileIds.length === 0) {
      res.status(400).json({ message: "请选择要分配的账号" });
      return;
    }
    const assignments = await MamaResourceTaskAssignment.find({
      taskId: task._id,
      profileId: { $in: profileIds },
    });
    if (assignments.length !== profileIds.length) {
      res.status(409).json({ message: "只能下发给已经领取该任务的账号" });
      return;
    }
    let waitingForContent = 0;
    if (task.contentLinkPoolEnabled) {
      for (const assignment of assignments) {
        if (!assignment.contentUrl) {
          const assigned = await assignNextMamaResourceContentLink(task._id, assignment._id);
          if (!assigned) {
            waitingForContent += 1;
          }
        }
      }
    }
    const populatedAssignments = await MamaResourceTaskAssignment.find({
      taskId: task._id,
      profileId: { $in: profileIds },
    })
      .populate("taskId")
      .populate("profileId")
      .sort({ updatedAt: -1 });
    const [updatedTask, stats] = await Promise.all([
      MamaResourceTask.findById(task._id),
      getMamaResourceContentLinkStats([task._id]),
    ]);
    res.status(201).json({
      assignments: await serializeAssignmentsWithUsers(populatedAssignments),
      summary: { assigned: populatedAssignments.length, waitingForContent },
      task: serializeTask(updatedTask || task, stats),
    });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "分配账号失败" });
  }
});

router.get("/tasks/:taskId/assignments", async (req: Request, res: Response) => {
  try {
    const task = await MamaResourceTask.findOne(idQuery(asText(req.params.taskId))).lean();
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    const proofStatus = asText(req.query.proofStatus);
    const filter: any = { taskId: task._id };
    const hasProfileFilter = ["category", "minFollowers", "search", "riskTag", "operatorTag", "orderBlocked"]
      .some((key) => asText(req.query[key]));
    if (hasProfileFilter) {
      const profileFilter = buildListFilter({ ...req.query, status: "all" });
      const riskTag = asText(req.query.riskTag);
      if (riskTag) profileFilter["reviewNote.riskTags"] = riskTag;
      const search = asText(req.query.search);
      if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        const userSearchClauses: any[] = [
          { username: pattern },
          { name: pattern },
          { mobile: pattern },
          { publicUid: pattern },
        ];
        if (mongoose.Types.ObjectId.isValid(search)) userSearchClauses.push({ _id: search });
        const users = await User.find({ $or: userSearchClauses }).select("mobile").lean();
        const phoneClauses = users
          .map((user) => normalizePhoneDigits(user.mobile))
          .filter(Boolean)
          .map((phone) => ({ contactPhone: new RegExp(phone.split("").join("\\D*")) }));
        const userIdClauses = mongoose.Types.ObjectId.isValid(search) ? [{ userId: search }] : [];
        if (phoneClauses.length || userIdClauses.length) {
          profileFilter.$or = [...(profileFilter.$or || []), ...phoneClauses, ...userIdClauses];
        }
      }
      const profiles = await MamaResourceProfile.find(profileFilter).select("_id").lean();
      filter.profileId = { $in: profiles.map((profile) => profile._id) };
    }
    if (proofStatus === "returned") {
      filter.proofScreenshotUrl = { $exists: true, $nin: ["", null] };
    } else if (proofStatus === "missing" || proofStatus === "overdue") {
      filter.proofScreenshotUrl = { $in: ["", null] };
      if (proofStatus === "overdue") {
        filter.contentUrl = { $exists: true, $nin: ["", null] };
        filter.contentUpdatedAt = { $lte: new Date(Date.now() - PROOF_RETURN_WINDOW_MS) };
      }
    }
    const assignments = await MamaResourceTaskAssignment.find(filter)
      .populate("taskId")
      .populate("profileId")
      .sort({ updatedAt: -1 });
    res.json({ assignments: await serializeAssignmentsWithUsers(assignments) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取任务账号失败" });
  }
});

router.patch("/tasks/assignments/:assignmentId/review", async (req: Request, res: Response) => {
  try {
    const status = asText(req.body?.status);
    if (!ASSIGNMENT_STATUSES.includes(status as MamaResourceTaskAssignmentStatus)) {
      res.status(400).json({ message: "状态仅允许 assigned/submitted/collected/rejected" });
      return;
    }
    const assignment = await MamaResourceTaskAssignment.findOneAndUpdate(
      idQuery(asText(req.params.assignmentId)),
      {
        status,
        reviewNote: asText(req.body?.reviewNote),
        reviewedAt: new Date(),
      },
      { returnDocument: "after", runValidators: true }
    )
      .populate("taskId")
      .populate("profileId");
    if (!assignment) {
      res.status(404).json({ message: "任务账号不存在" });
      return;
    }
    const serialized = (await serializeAssignmentsWithUsers([assignment]))[0];
    res.json({ task: serialized, assignment: serialized });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "审核任务失败" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const profile = await MamaResourceProfile.findOne(idQuery(asText(req.params.id)));
    if (!profile) {
      res.status(404).json({ message: "资源不存在" });
      return;
    }
    res.json({ profile: serializeProfile(profile) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取资源失败" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const update: any = {};
    const body = req.body || {};
    const alipayAccount = asText(body.alipayAccount);
    const alipayVerifiedName = asText(body.alipayVerifiedName);

    if (!alipayAccount) {
      res.status(400).json({ message: "请填写支付宝账号" });
      return;
    }
    if (!alipayVerifiedName) {
      res.status(400).json({ message: "请填写支付宝验证姓名" });
      return;
    }

    for (const key of ["displayName", "contactPhone", "contactWechat", "city", "childStage", "childGender", "accountPositioning"]) {
      if (body[key] !== undefined) update[key] = asText(body[key]);
    }
    update.alipayAccount = alipayAccount;
    update.alipayVerifiedName = alipayVerifiedName;
    if (body.categories !== undefined) update.categories = asTextArray(body.categories);
    if (body.contentCapabilities !== undefined) update.contentCapabilities = asTextArray(body.contentCapabilities);
    if (STATUSES.includes(asText(body.status) as MamaResourceStatus)) update.status = asText(body.status);
    const mediaAccounts = manualMediaAccounts(body.mediaAccounts);
    if (mediaAccounts) {
      update.mediaAccounts = mediaAccounts;
      const primaryXiaohongshuAccount = mediaAccounts.find((account) => account.platform === "xiaohongshu");
      if (primaryXiaohongshuAccount) {
        update["socialAccount.profileUrl"] = primaryXiaohongshuAccount.profileUrl;
        update["socialAccount.normalizedProfileUrl"] = primaryXiaohongshuAccount.normalizedProfileUrl;
        update["socialAccount.nickname"] = primaryXiaohongshuAccount.nickname;
        update["socialAccount.followerCount"] = primaryXiaohongshuAccount.followerCount;
        update["socialAccount.dataSource"] = "manual";
      }
    }
    if (body.socialAccount && typeof body.socialAccount === "object") {
      if (body.socialAccount.nickname !== undefined) update["socialAccount.nickname"] = asText(body.socialAccount.nickname);
      const followerCount = asOptionalNumber(body.socialAccount.followerCount);
      if (followerCount !== null) update["socialAccount.followerCount"] = followerCount;
      if (["pending", "auto", "manual", "screenshot"].includes(asText(body.socialAccount.dataSource))) {
        update["socialAccount.dataSource"] = asText(body.socialAccount.dataSource);
      }
      const capturedAt = asOptionalDate(body.socialAccount.lastCapturedAt);
      if (capturedAt) update["socialAccount.lastCapturedAt"] = capturedAt;
    }
    const profile = await MamaResourceProfile.findOneAndUpdate(idQuery(asText(req.params.id)), update, {
      returnDocument: "after",
      runValidators: true,
    });
    if (!profile) {
      res.status(404).json({ message: "资源不存在" });
      return;
    }
    res.json({ profile: serializeProfile(profile) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "更新资源失败" });
  }
});

router.patch("/:id/operations", async (req: Request, res: Response) => {
  try {
    const update: any = {};
    if (req.body?.operatorTags !== undefined) {
      update.operatorTags = Array.from(new Set(asTextArray(req.body.operatorTags)))
        .slice(0, 20)
        .map((tag) => tag.slice(0, 30));
    }
    if (typeof req.body?.orderBlocked === "boolean") {
      update.orderBlocked = req.body.orderBlocked;
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ message: "没有可更新的运营设置" });
      return;
    }
    const profile = await MamaResourceProfile.findOneAndUpdate(
      idQuery(asText(req.params.id)),
      update,
      { returnDocument: "after", runValidators: true }
    );
    if (!profile) {
      res.status(404).json({ message: "资源不存在" });
      return;
    }
    res.json({ profile: serializeProfile(profile) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "更新运营设置失败" });
  }
});

router.patch("/:id/review", async (req: Request, res: Response) => {
  try {
    const status = asText(req.body?.status);
    if (!STATUSES.includes(status as MamaResourceStatus)) {
      res.status(400).json({ message: "状态仅允许 pending/approved/needs_info/rejected" });
      return;
    }
    const profile = await MamaResourceProfile.findOneAndUpdate(
      idQuery(asText(req.params.id)),
      {
        status,
        reviewNote: {
          note: asText(req.body?.note),
          suitableCategories: asTextArray(req.body?.suitableCategories),
          riskTags: asTextArray(req.body?.riskTags),
          nextFollowUpAt: asOptionalDate(req.body?.nextFollowUpAt),
          reviewedAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true }
    );
    if (!profile) {
      res.status(404).json({ message: "资源不存在" });
      return;
    }
    res.json({ profile: serializeProfile(profile) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "审核更新失败" });
  }
});

export default router;
