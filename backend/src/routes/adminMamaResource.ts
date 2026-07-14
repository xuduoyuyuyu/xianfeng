import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import * as XLSX from "xlsx";
import MamaResourceProfile, { MamaResourceStatus } from "../models/MamaResourceProfile";
import MamaResourceTask, { MamaResourceTaskStatus } from "../models/MamaResourceTask";
import MamaResourceTaskAssignment, { MamaResourceTaskAssignmentStatus } from "../models/MamaResourceTaskAssignment";

const router = Router();
const STATUSES: MamaResourceStatus[] = ["pending", "approved", "needs_info", "rejected"];
const TASK_STATUSES: MamaResourceTaskStatus[] = ["listed", "paused", "archived"];
const ASSIGNMENT_STATUSES: MamaResourceTaskAssignmentStatus[] = ["assigned", "submitted", "collected", "rejected"];
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function idQuery(id: string) {
  if (mongoose.Types.ObjectId.isValid(id)) return { _id: id };
  return { _id: null };
}

function normalizeContentUrl(value: unknown): string {
  const text = asText(value);
  if (!text) return "";
  const url = new URL(text);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("链接仅支持 HTTP(S)");
  }
  return url.toString();
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

  if (STATUSES.includes(status as MamaResourceStatus)) {
    filter.status = status;
  }
  if (category) {
    filter.categories = category;
  }
  if (minFollowers !== null) {
    filter["socialAccount.followerCount"] = { $gte: minFollowers };
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
      { "socialAccount.nickname": pattern },
      { "socialAccount.profileUrl": pattern },
    ];
  }
  return filter;
}

function buildTaskMatchFilter(task: any) {
  const filter: any = { status: "approved" };
  const categories = asTextArray(task.matchCategories || task.category);
  const riskTags = asTextArray(task.matchRiskTags);
  const minFollowerCount = asOptionalNumber(task.minFollowerCount);

  if (categories.length > 0) {
    filter.categories = { $in: categories };
  }
  if (riskTags.length > 0) {
    filter["reviewNote.riskTags"] = { $in: riskTags };
  }
  if (minFollowerCount !== null) {
    filter["socialAccount.followerCount"] = { $gte: minFollowerCount };
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
  };
}

function serializeTask(task: any) {
  const source = typeof task.toObject === "function" ? task.toObject() : task;
  return {
    ...source,
    _id: String(source._id),
  };
}

function serializeAssignment(assignment: any) {
  const source = typeof assignment.toObject === "function" ? assignment.toObject() : assignment;
  return {
    ...source,
    _id: String(source._id),
    taskId: String(source.taskId?._id || source.taskId),
    profileId: String(source.profileId?._id || source.profileId),
    task: source.taskId && typeof source.taskId === "object" ? serializeTask(source.taskId) : undefined,
    profile: source.profileId && typeof source.profileId === "object" ? serializeProfile(source.profileId) : undefined,
  };
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(asText(req.query.page), 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(asText(req.query.pageSize || req.query.limit), 10) || 20));
    const filter = buildListFilter(req.query);
    const [items, total] = await Promise.all([
      MamaResourceProfile.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      MamaResourceProfile.countDocuments(filter),
    ]);
    res.json({
      items: items.map(serializeProfile),
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
    res.json({ tasks: tasks.map(serializeTask) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取任务失败" });
  }
});

router.get("/tasks/content-import/template", (_req: Request, res: Response) => {
  const sheet = XLSX.utils.json_to_sheet([
    { 妈妈好赚账号ID: "请填写系统账号ID", 专属内容链接: "https://my.feishu.cn/wiki/example" },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "专属链接");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="mama-resource-content-import.xlsx"');
  res.send(buffer);
});

router.patch("/tasks/assignments/:assignmentId/content", async (req: Request, res: Response) => {
  try {
    const contentUrl = normalizeContentUrl(req.body?.contentUrl);
    if (!contentUrl) {
      res.status(400).json({ message: "请填写专属内容链接" });
      return;
    }
    const assignment = await MamaResourceTaskAssignment.findOneAndUpdate(
      idQuery(asText(req.params.assignmentId)),
      { contentUrl, contentUpdatedAt: new Date() },
      { returnDocument: "after", runValidators: true }
    )
      .populate("taskId")
      .populate("profileId");
    if (!assignment) {
      res.status(404).json({ message: "任务账号不存在" });
      return;
    }
    res.json({ assignment: serializeAssignment(assignment) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "保存专属内容链接失败" });
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
          profileId: asText(row["妈妈好赚账号ID"]),
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
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const row of rows) {
      if (row.action === "unchanged") {
        unchanged += 1;
        continue;
      }
      const now = new Date();
      if (row.action === "create_assignment") {
        await MamaResourceTaskAssignment.create({
          taskId: task._id,
          profileId: row.profileId,
          status: "assigned",
          contentUrl: row.contentUrl,
          contentUpdatedAt: now,
        });
        created += 1;
      } else {
        await MamaResourceTaskAssignment.updateOne(
          { taskId: task._id, profileId: row.profileId },
          { contentUrl: row.contentUrl, contentUpdatedAt: now }
        );
        updated += 1;
      }
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

    let assignments: any[] = [];
    if (req.body?.autoAssign === true) {
      const matchedProfiles = await MamaResourceProfile.find(buildTaskMatchFilter(task)).select("_id").lean();
      if (matchedProfiles.length > 0) {
        await MamaResourceTaskAssignment.bulkWrite(
          matchedProfiles.map((profile) => ({
            updateOne: {
              filter: { taskId: task._id, profileId: profile._id },
              update: { $setOnInsert: { taskId: task._id, profileId: profile._id, status: "assigned" } },
              upsert: true,
            },
          }))
        );
        assignments = await MamaResourceTaskAssignment.find({
          taskId: task._id,
          profileId: { $in: matchedProfiles.map((profile) => profile._id) },
        })
          .populate("taskId")
          .populate("profileId")
          .sort({ updatedAt: -1 });
      }
    }

    res.status(201).json({ task: serializeTask(task), assignments: assignments.map(serializeAssignment) });
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

    res.json({ task: serializeTask(task) });
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
    const profiles = await MamaResourceProfile.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
    const assignments = await MamaResourceTaskAssignment.find({
      taskId: task._id,
      profileId: { $in: profiles.map((profile) => profile._id) },
    }).lean();
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
    const task = await MamaResourceTask.findOne(idQuery(asText(req.params.taskId))).lean();
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    const profileIds = Array.from(new Set(asTextArray(req.body?.profileIds))).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (profileIds.length === 0) {
      res.status(400).json({ message: "请选择要分配的账号" });
      return;
    }
    const approvedProfiles = await MamaResourceProfile.find({ _id: { $in: profileIds }, status: "approved" }).select("_id").lean();
    if (approvedProfiles.length === 0) {
      res.status(400).json({ message: "没有可派单账号" });
      return;
    }
    await MamaResourceTaskAssignment.bulkWrite(
      approvedProfiles.map((profile) => ({
        updateOne: {
          filter: { taskId: task._id, profileId: profile._id },
          update: { $setOnInsert: { taskId: task._id, profileId: profile._id, status: "assigned" } },
          upsert: true,
        },
      }))
    );
    const assignments = await MamaResourceTaskAssignment.find({
      taskId: task._id,
      profileId: { $in: approvedProfiles.map((profile) => profile._id) },
    })
      .populate("taskId")
      .populate("profileId")
      .sort({ updatedAt: -1 });
    res.status(201).json({ assignments: assignments.map(serializeAssignment) });
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
    const assignments = await MamaResourceTaskAssignment.find({ taskId: task._id })
      .populate("taskId")
      .populate("profileId")
      .sort({ updatedAt: -1 });
    res.json({ assignments: assignments.map(serializeAssignment) });
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
    res.json({ task: serializeAssignment(assignment), assignment: serializeAssignment(assignment) });
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
    if (STATUSES.includes(asText(body.status) as MamaResourceStatus)) update.status = asText(body.status);
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
