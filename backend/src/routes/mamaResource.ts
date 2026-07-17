import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import mongoose from "mongoose";
import MamaResourceProfile from "../models/MamaResourceProfile";
import MamaResourceTask from "../models/MamaResourceTask";
import MamaResourceTaskAssignment from "../models/MamaResourceTaskAssignment";
import User from "../models/User";
import { authenticate, optionalAuthenticate, AuthenticatedRequest } from "../middlewares/auth";
import { assignNextMamaResourceContentLink } from "../services/mamaResourceContentLinks";
import { ensurePublicUid } from "../services/publicUid";

const router = Router();
const uploadDir = path.join(process.cwd(), "uploads", "mama-resources");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const allowedScreenshotExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);

function isAllowedScreenshotUpload(file: Express.Multer.File): boolean {
  const mimetype = String(file.mimetype || "").toLowerCase();
  if (mimetype.startsWith("image/")) return true;
  const ext = path.extname(file.originalname || "").toLowerCase();
  return mimetype === "application/octet-stream" && allowedScreenshotExtensions.has(ext);
}

const screenshotUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedScreenshotUpload(file)) {
      cb(null, true);
      return;
    }
    cb(new Error("仅支持图片文件"));
  },
});

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function asTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asText).filter(Boolean);
  }
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

function normalizePhoneDigits(value: unknown): string {
  const digits = asText(value).replace(/\D/g, "");
  if (digits.startsWith("0086") && digits.length === 15) return digits.slice(4);
  if (digits.startsWith("86") && digits.length === 13) return digits.slice(2);
  return digits;
}

function contactPhoneQuery(value: unknown) {
  const raw = asText(value);
  const digits = normalizePhoneDigits(raw);
  if (!digits) return { contactPhone: raw };
  const digitPattern = digits.split("").join("\\D*");
  return {
    $or: [
      { contactPhone: raw },
      { contactPhone: new RegExp(`^\\D*(?:86\\D*)?${digitPattern}\\D*$`) },
    ],
  };
}

function asOptionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === true || value === false) return value;
  const text = asText(value).toLowerCase();
  if (["true", "1", "yes", "已实名"].includes(text)) return true;
  if (["false", "0", "no", "未实名"].includes(text)) return false;
  return null;
}

const mediaPlatformSet = new Set(["xiaohongshu", "douyin", "shipinhao", "gongzhonghao", "other"]);

function normalizeMediaPlatform(value: unknown): string {
  const platform = asText(value).toLowerCase();
  return mediaPlatformSet.has(platform) ? platform : "xiaohongshu";
}

function normalizeXiaohongshuProfileUrl(value: unknown): { profileUrl: string; normalizedProfileUrl: string } {
  const raw = asText(value);
  if (!raw) return { profileUrl: "", normalizedProfileUrl: "" };

  const embeddedUrl = raw.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[，。；！？、）)\]}>]+$/, "") || "";
  const identity = embeddedUrl || raw;

  try {
    const url = new URL(identity.startsWith("http") ? identity : `https://${identity}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, "");
    if (host.includes("xiaohongshu.com") && pathname) {
      return {
        profileUrl: identity === raw ? `https://www.xiaohongshu.com${pathname}` : raw,
        normalizedProfileUrl: `xiaohongshu:${pathname.replace(/^\/+/, "").toLowerCase()}`,
      };
    }
  } catch (_error) {}

  return { profileUrl: raw, normalizedProfileUrl: `xiaohongshu:${identity.toLowerCase()}` };
}

function normalizeGenericProfileUrl(platform: string, value: unknown): { profileUrl: string; normalizedProfileUrl: string } {
  const profileUrl = asText(value);
  if (!profileUrl) return { profileUrl: "", normalizedProfileUrl: "" };
  return {
    profileUrl,
    normalizedProfileUrl: `${platform}:${profileUrl.toLowerCase()}`,
  };
}

function normalizeMediaAccount(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const platform = normalizeMediaPlatform(source.platform);
  const account = platform === "xiaohongshu"
    ? normalizeXiaohongshuProfileUrl(source.profileUrl || source.xiaohongshuProfileUrl)
    : normalizeGenericProfileUrl(platform, source.profileUrl);
  return {
    platform,
    profileUrl: account.profileUrl,
    normalizedProfileUrl: account.normalizedProfileUrl,
    nickname: asText(source.nickname),
    followerCount: asOptionalNumber(source.followerCount),
    screenshotUrl: asText(source.screenshotUrl || source.xiaohongshuScreenshotUrl),
    realNameVerified: asOptionalBoolean(source.realNameVerified),
    dataSource: asText(source.screenshotUrl || source.xiaohongshuScreenshotUrl) ? "screenshot" : "pending",
  };
}

function mediaAccountsFromBody(body: any) {
  const bodyAccounts = Array.isArray(body?.mediaAccounts) ? body.mediaAccounts : [];
  const accounts = bodyAccounts
    .map(normalizeMediaAccount)
    .filter((account) => account.profileUrl && account.normalizedProfileUrl);
  if (accounts.length) return accounts;
  const legacyAccount = normalizeMediaAccount({
    platform: "xiaohongshu",
    profileUrl: body?.xiaohongshuProfileUrl || body?.profileUrl,
    nickname: body?.xiaohongshuNickname || body?.nickname,
    screenshotUrl: body?.xiaohongshuScreenshotUrl || body?.screenshotUrl,
    followerCount: body?.followerCount,
    realNameVerified: body?.realNameVerified,
  });
  return legacyAccount.profileUrl && legacyAccount.normalizedProfileUrl ? [legacyAccount] : [];
}

function primaryXiaohongshuAccountForProfile(profile: any) {
  const socialAccount = normalizeMediaAccount(profile?.socialAccount);
  if (socialAccount.platform === "xiaohongshu" && socialAccount.profileUrl && socialAccount.normalizedProfileUrl) {
    return socialAccount;
  }
  const mediaAccounts = Array.isArray(profile?.mediaAccounts) ? profile.mediaAccounts : [];
  return mediaAccounts
    .map(normalizeMediaAccount)
    .find((account) => account.platform === "xiaohongshu" && account.profileUrl && account.normalizedProfileUrl) || null;
}

function publicProfilePayload(profile: any, publicUid?: string) {
  const source = typeof profile.toObject === "function" ? profile.toObject() : profile;
  return {
    ...source,
    _id: String(source._id),
    ...(publicUid ? { publicUid } : {}),
  };
}

const activePromotionStatuses = ["assigned", "submitted"];
const claimSlotStatuses = ["assigned", "submitted", "collected"];

function assignmentTaskId(assignment: any) {
  const source = typeof assignment?.toObject === "function" ? assignment.toObject() : assignment;
  const task = source?.taskId && typeof source.taskId === "object" ? source.taskId : null;
  return task?._id || source?.taskId || null;
}

async function getActivePromotionCounts(assignments: any[]) {
  const taskIds = assignments.map(assignmentTaskId).filter(Boolean);
  return getAssignmentCountsForTaskIds(taskIds, activePromotionStatuses);
}

async function getAssignmentCountsForTaskIds(taskIds: any[], statuses: string[]) {
  const ids = taskIds.filter(Boolean);
  if (!ids.length) return new Map<string, number>();
  const rows = await MamaResourceTaskAssignment.aggregate([
    {
      $match: {
        taskId: { $in: ids },
        status: { $in: statuses },
      },
    },
    { $group: { _id: "$taskId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), Number(row.count || 0)]));
}

async function getClaimCountsForTaskIds(taskIds: any[]) {
  return getAssignmentCountsForTaskIds(taskIds, claimSlotStatuses);
}

function claimInfoForTask(task: any, taskId: string, claimCounts?: Map<string, number>) {
  const claimLimit = task?.claimLimit === undefined || task?.claimLimit === null ? null : Number(task.claimLimit);
  const claimedCount = Number(claimCounts?.get(taskId) || 0);
  const remainingClaimCount = claimLimit === null || !Number.isFinite(claimLimit) || claimLimit <= 0
    ? null
    : Math.max(0, Math.floor(claimLimit) - claimedCount);
  return {
    claimLimit: claimLimit === null || !Number.isFinite(claimLimit) ? null : Math.floor(claimLimit),
    claimedCount,
    remainingClaimCount,
  };
}

function publicAvailableTaskPayload(task: any, claimCounts?: Map<string, number>, activePromotionCounts?: Map<string, number>) {
  const source = typeof task.toObject === "function" ? task.toObject() : task;
  const taskId = String(source._id);
  const claimInfo = claimInfoForTask(source, taskId, claimCounts);
  return {
    ...source,
    _id: taskId,
    taskId,
    status: "listed",
    activePromotionCount: activePromotionCounts?.get(taskId) || 0,
    ...claimInfo,
    claimable: claimInfo.remainingClaimCount === null || claimInfo.remainingClaimCount > 0,
  };
}

function publicTaskPayload(assignment: any, activePromotionCounts?: Map<string, number>, claimCounts?: Map<string, number>) {
  const source = typeof assignment.toObject === "function" ? assignment.toObject() : assignment;
  const task = source.taskId && typeof source.taskId === "object" ? source.taskId : {};
  const taskId = String(task._id || source.taskId);
  const claimInfo = claimInfoForTask(task, taskId, claimCounts);
  return {
    ...task,
    status: source.status,
    proofLink: source.proofLink,
    proofScreenshotUrl: source.proofScreenshotUrl,
    transferScreenshotUrl: source.transferScreenshotUrl || "",
    transferScreenshotUpdatedAt: source.transferScreenshotUpdatedAt || null,
    contentUrl: source.contentUrl || "",
    contentUpdatedAt: source.contentUpdatedAt || null,
    submittedAt: source.submittedAt,
    reviewedAt: source.reviewedAt,
    reviewNote: source.reviewNote,
    _id: String(source._id),
    taskId,
    profileId: String(source.profileId),
    activePromotionCount: activePromotionCounts?.get(taskId) || 0,
    ...claimInfo,
    claimable: false,
  };
}

async function findProfileForUser(userId: string) {
  const linkedApprovedProfile = await MamaResourceProfile.findOne({ userId, status: "approved" }).sort({ updatedAt: -1 });
  if (linkedApprovedProfile) return linkedApprovedProfile;
  const user = await User.findById(userId).select("mobile").lean();
  const mobile = asText(user?.mobile);
  if (!mobile) return MamaResourceProfile.findOne({ userId }).sort({ updatedAt: -1 });
  const phoneFilter = contactPhoneQuery(mobile);
  const approvedProfile = await MamaResourceProfile.findOne({ $and: [phoneFilter, { status: "approved" }] }).sort({ updatedAt: -1 });
  const profile = approvedProfile
    || await MamaResourceProfile.findOne({ userId }).sort({ updatedAt: -1 })
    || await MamaResourceProfile.findOne(phoneFilter).sort({ updatedAt: -1 });
  if (profile && !profile.userId) {
    profile.userId = new mongoose.Types.ObjectId(userId);
    await profile.save();
  }
  return profile;
}

async function findApprovedProfileForUser(userId: string) {
  const profile = await findProfileForUser(userId);
  return profile?.status === "approved" ? profile : null;
}

router.get("/me/tasks", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = asText(req.user?.id);
    const [profile, publicUid] = await Promise.all([
      findProfileForUser(userId),
      ensurePublicUid(userId),
    ]);
    if (!profile) {
      res.json({ profile: null, tasks: [], availableTasks: [] });
      return;
    }
    if (profile.status !== "approved") {
      res.json({ profile: publicProfilePayload(profile, publicUid), tasks: [], availableTasks: [] });
      return;
    }
    const tasks = await MamaResourceTaskAssignment.find({ profileId: profile._id })
      .populate("taskId")
      .sort({ updatedAt: -1 })
      .lean();
    const assignedTaskIds = tasks.map(assignmentTaskId).filter(Boolean);
    const availableTasks = profile.orderBlocked
      ? []
      : await MamaResourceTask.find({
        status: "listed",
        ...(assignedTaskIds.length ? { _id: { $nin: assignedTaskIds } } : {}),
      })
        .sort({ updatedAt: -1 })
        .lean();
    const activePromotionCounts = await getActivePromotionCounts(tasks);
    const allTaskIds = assignedTaskIds.concat(availableTasks.map((task: any) => task._id));
    const availableActivePromotionCounts = await getAssignmentCountsForTaskIds(allTaskIds, activePromotionStatuses);
    const claimCounts = await getClaimCountsForTaskIds(allTaskIds);
    res.json({
      profile: publicProfilePayload(profile, publicUid),
      tasks: tasks.map((task) => publicTaskPayload(task, activePromotionCounts, claimCounts)),
      availableTasks: availableTasks
        .map((task) => publicAvailableTaskPayload(task, claimCounts, availableActivePromotionCounts))
        .filter((task) => task.claimable),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取好赚任务失败" });
  }
});

router.post("/tasks/:taskId/claims", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await findApprovedProfileForUser(asText(req.user?.id));
    if (!profile) {
      res.status(404).json({ message: "还没有可派单的好赚账号" });
      return;
    }
    if (profile.orderBlocked) {
      res.status(403).json({ message: "账号已被暂停接单，请联系运营" });
      return;
    }
    const taskId = asText(req.params.taskId);
    const task = await MamaResourceTask.findOne({ _id: taskId, status: "listed" });
    if (!task) {
      res.status(404).json({ message: "任务不存在或暂不可领取" });
      return;
    }
    const existingAssignment = await MamaResourceTaskAssignment.findOne({ taskId: task._id, profileId: profile._id }).populate("taskId");
    if (existingAssignment) {
      const activePromotionCounts = await getActivePromotionCounts([existingAssignment]);
      const claimCounts = await getClaimCountsForTaskIds([task._id]);
      res.json({ task: publicTaskPayload(existingAssignment, activePromotionCounts, claimCounts) });
      return;
    }

    const claimLimit = task.claimLimit === undefined || task.claimLimit === null ? null : Number(task.claimLimit);
    const claimedCount = await MamaResourceTaskAssignment.countDocuments({
      taskId: task._id,
      status: { $in: claimSlotStatuses },
    });
    if (claimLimit !== null && Number.isFinite(claimLimit) && claimLimit > 0 && claimedCount >= claimLimit) {
      res.status(409).json({ message: "任务名额已被领完" });
      return;
    }

    let assignment = await MamaResourceTaskAssignment.create({
      taskId: task._id,
      profileId: profile._id,
      status: "assigned",
    });
    if (task.contentLinkPoolEnabled) {
      const assignmentWithContent = await assignNextMamaResourceContentLink(task._id, assignment._id);
      if (!assignmentWithContent) {
        await MamaResourceTaskAssignment.deleteOne({ _id: assignment._id, contentUrl: { $in: ["", null] } });
        res.status(409).json({ message: "专属内容链接已分配完，任务等待内容分配" });
        return;
      }
      assignment = assignmentWithContent;
    }
    const populatedAssignment = await MamaResourceTaskAssignment.findById(assignment._id).populate("taskId");
    const activePromotionCounts = await getActivePromotionCounts(populatedAssignment ? [populatedAssignment] : []);
    const claimCounts = await getClaimCountsForTaskIds([task._id]);
    res.status(201).json({ task: publicTaskPayload(populatedAssignment || assignment, activePromotionCounts, claimCounts) });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "你已领取过该任务" });
      return;
    }
    res.status(400).json({ message: error?.message || "领取任务失败" });
  }
});

router.get("/me/tasks/:taskId", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await findApprovedProfileForUser(asText(req.user?.id));
    if (!profile) {
      res.status(404).json({ message: "还没有可派单的好赚账号" });
      return;
    }
    const task = await MamaResourceTaskAssignment.findOne({ _id: asText(req.params.taskId), profileId: profile._id }).populate("taskId");
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    const activePromotionCounts = await getActivePromotionCounts([task]);
    res.json({ profile: publicProfilePayload(profile), task: publicTaskPayload(task, activePromotionCounts) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取任务详情失败" });
  }
});

router.post("/me/tasks/:taskId/submissions", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await findApprovedProfileForUser(asText(req.user?.id));
    if (!profile) {
      res.status(404).json({ message: "还没有可派单的好赚账号" });
      return;
    }
    const proofLink = asText(req.body?.proofLink);
    const proofScreenshotUrl = asText(req.body?.proofScreenshotUrl);
    if (!proofLink) {
      res.status(400).json({ message: "请填写小红书笔记或评论链接" });
      return;
    }
    if (!proofScreenshotUrl) {
      res.status(400).json({ message: "请上传完成截图" });
      return;
    }
    const assignment = await MamaResourceTaskAssignment.findOne({ _id: asText(req.params.taskId), profileId: profile._id }).select("contentUrl").lean();
    if (!assignment) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    if (!asText(assignment.contentUrl)) {
      res.status(409).json({ message: "请等待运营下发具体内容链接后再提交反馈" });
      return;
    }
    const task = await MamaResourceTaskAssignment.findOneAndUpdate(
      { _id: asText(req.params.taskId), profileId: profile._id },
      {
        status: "submitted",
        proofLink,
        proofScreenshotUrl,
        submittedAt: new Date(),
      },
      { returnDocument: "after", runValidators: true }
    ).populate("taskId");
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    res.json({ task: publicTaskPayload(task) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "提交回填失败" });
  }
});

router.post("/uploads", (req: Request, res: Response) => {
  screenshotUpload.single("file")(req, res, (error: any) => {
    if (error) {
      res.status(400).json({ message: error.message || "上传失败" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: "请上传小红书页面截图" });
      return;
    }
    const file = req.file as Express.Multer.File;
    res.json({ url: `/uploads/mama-resources/${file.filename}`, filename: file.filename });
  });
});

router.post("/applications", optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const displayName = asText(req.body?.displayName);
    const submittedContactPhone = asText(req.body?.contactPhone);
    const authenticatedUser = req.user?.id
      ? await User.findById(req.user.id, { mobile: 1 }).lean()
      : null;
    const authenticatedMobile = normalizePhoneDigits((authenticatedUser as any)?.mobile);
    const contactPhone = authenticatedMobile || submittedContactPhone;
    const contactWechat = asText(req.body?.contactWechat);
    const alipayAccount = asText(req.body?.alipayAccount);
    const alipayVerifiedName = asText(req.body?.alipayVerifiedName);
    const consentAccepted = req.body?.consentAccepted !== false;
    const mediaAccounts = mediaAccountsFromBody(req.body);
    const primaryXiaohongshuAccount = mediaAccounts.find((account) => account.platform === "xiaohongshu");

    if (!displayName) {
      res.status(400).json({ message: "请填写姓名或昵称" });
      return;
    }
    if (!contactWechat) {
      res.status(400).json({ message: "请填写微信号" });
      return;
    }
    if (!alipayAccount) {
      res.status(400).json({ message: "请填写支付宝账号" });
      return;
    }
    if (!alipayVerifiedName) {
      res.status(400).json({ message: "请填写支付宝验证姓名" });
      return;
    }
    if (!primaryXiaohongshuAccount) {
      res.status(400).json({ message: "请填写小红书主页链接或分享口令" });
      return;
    }
    const normalizedProfileUrls = mediaAccounts.map((account) => account.normalizedProfileUrl).filter(Boolean);
    if (new Set(normalizedProfileUrls).size !== normalizedProfileUrls.length) {
      res.status(400).json({ message: "同一个主页链接不能重复提交" });
      return;
    }

    const contactMatchClauses: any[] = [];
    if (contactPhone) contactMatchClauses.push(contactPhoneQuery(contactPhone));
    if (contactWechat) contactMatchClauses.push({ contactWechat });
    const existingByContact = contactMatchClauses.length
      ? await MamaResourceProfile.findOne({ $or: contactMatchClauses }).sort({ updatedAt: -1 }).lean()
      : null;
    const existingByProfileUrl = await MamaResourceProfile.findOne({
      $or: [
        { "socialAccount.normalizedProfileUrl": { $in: normalizedProfileUrls } },
        { "mediaAccounts.normalizedProfileUrl": { $in: normalizedProfileUrls } },
      ],
    }).lean();
    const existingByContactPrimaryXiaohongshuAccount = primaryXiaohongshuAccountForProfile(existingByContact);
    const existing = existingByContactPrimaryXiaohongshuAccount || !existingByProfileUrl
      ? existingByContact
      : existingByProfileUrl;
    const existingPrimaryXiaohongshuAccount = primaryXiaohongshuAccountForProfile(existing);
    const resolvedPrimaryXiaohongshuAccount = existingPrimaryXiaohongshuAccount
      ? {
        ...primaryXiaohongshuAccount,
        profileUrl: existingPrimaryXiaohongshuAccount.profileUrl,
        normalizedProfileUrl: existingPrimaryXiaohongshuAccount.normalizedProfileUrl,
      }
      : primaryXiaohongshuAccount;
    let primaryAccountReplaced = false;
    const resolvedMediaAccounts = mediaAccounts.map((account) => {
      if (primaryAccountReplaced || account.platform !== "xiaohongshu") return account;
      primaryAccountReplaced = true;
      return resolvedPrimaryXiaohongshuAccount;
    });
    if (!primaryAccountReplaced) resolvedMediaAccounts.unshift(resolvedPrimaryXiaohongshuAccount);
    const profilePayload = {
      ...(req.user?.id ? { userId: req.user.id } : {}),
      displayName,
      contactPhone,
      contactWechat,
      alipayAccount,
      alipayVerifiedName,
      city: asText(req.body?.city),
      childStage: asText(req.body?.childStage),
      childGender: asText(req.body?.childGender),
      contentCapabilities: asTextArray(req.body?.contentCapabilities),
      categories: asTextArray(req.body?.categories),
      status: "approved",
      accountPositioning: asText(req.body?.accountPositioning),
      consentAccepted,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: resolvedPrimaryXiaohongshuAccount.profileUrl,
        normalizedProfileUrl: resolvedPrimaryXiaohongshuAccount.normalizedProfileUrl,
        nickname: resolvedPrimaryXiaohongshuAccount.nickname,
        followerCount: resolvedPrimaryXiaohongshuAccount.followerCount,
        screenshotUrl: resolvedPrimaryXiaohongshuAccount.screenshotUrl,
        realNameVerified: resolvedPrimaryXiaohongshuAccount.realNameVerified,
        dataSource: resolvedPrimaryXiaohongshuAccount.dataSource,
      },
      mediaAccounts: resolvedMediaAccounts,
      rateCard: {
        acceptsGiftExchange: req.body?.acceptsGiftExchange === true,
        blockedCategories: asTextArray(req.body?.blockedCategories),
      },
      reviewNote: {
        note: "资料已提交，可直接参与任务；运营按需备注跟进。",
        suitableCategories: asTextArray(req.body?.categories),
        riskTags: [],
        reviewedAt: new Date(),
      },
    };

    if (existing) {
      const profile = await MamaResourceProfile.findByIdAndUpdate(existing._id, profilePayload, {
        returnDocument: "after",
        runValidators: true,
      });
      res.json({ profile: publicProfilePayload(profile) });
      return;
    }

    const profile = await MamaResourceProfile.create(profilePayload);

    res.status(201).json({ profile: publicProfilePayload(profile) });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "这个小红书主页链接已经提交过，请联系运营更新资料" });
      return;
    }
    res.status(400).json({ message: error?.message || "提交失败，请稍后重试" });
  }
});

export default router;
export { normalizeXiaohongshuProfileUrl };
