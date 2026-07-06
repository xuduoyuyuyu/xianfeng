import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import MamaResourceProfile from "../models/MamaResourceProfile";
import MamaResourceTaskAssignment from "../models/MamaResourceTaskAssignment";
import User from "../models/User";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";

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

function asOptionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === true || value === false) return value;
  const text = asText(value).toLowerCase();
  if (["true", "1", "yes", "已实名"].includes(text)) return true;
  if (["false", "0", "no", "未实名"].includes(text)) return false;
  return null;
}

function normalizeXiaohongshuProfileUrl(value: unknown): { profileUrl: string; normalizedProfileUrl: string } {
  const raw = asText(value);
  if (!raw) return { profileUrl: "", normalizedProfileUrl: "" };

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, "");
    if (!host.includes("xiaohongshu.com") || !pathname) {
      return { profileUrl: raw, normalizedProfileUrl: "" };
    }
    return {
      profileUrl: `https://www.xiaohongshu.com${pathname}`,
      normalizedProfileUrl: `xiaohongshu:${pathname.replace(/^\/+/, "").toLowerCase()}`,
    };
  } catch (_error) {
    return { profileUrl: raw, normalizedProfileUrl: "" };
  }
}

function publicProfilePayload(profile: any) {
  const source = typeof profile.toObject === "function" ? profile.toObject() : profile;
  return {
    ...source,
    _id: String(source._id),
  };
}

function publicTaskPayload(assignment: any) {
  const source = typeof assignment.toObject === "function" ? assignment.toObject() : assignment;
  const task = source.taskId && typeof source.taskId === "object" ? source.taskId : {};
  return {
    ...task,
    status: source.status,
    proofLink: source.proofLink,
    proofScreenshotUrl: source.proofScreenshotUrl,
    submittedAt: source.submittedAt,
    reviewedAt: source.reviewedAt,
    reviewNote: source.reviewNote,
    _id: String(source._id),
    taskId: String(task._id || source.taskId),
    profileId: String(source.profileId),
  };
}

async function findProfileForUser(userId: string) {
  const user = await User.findById(userId).select("mobile").lean();
  const mobile = asText(user?.mobile);
  if (!mobile) return null;
  return MamaResourceProfile.findOne({ contactPhone: mobile }).sort({ updatedAt: -1 });
}

async function findApprovedProfileForUser(userId: string) {
  const profile = await findProfileForUser(userId);
  return profile?.status === "approved" ? profile : null;
}

router.get("/me/tasks", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await findProfileForUser(asText(req.user?.id));
    if (!profile) {
      res.json({ profile: null, tasks: [] });
      return;
    }
    if (profile.status !== "approved") {
      res.json({ profile: publicProfilePayload(profile), tasks: [] });
      return;
    }
    const tasks = await MamaResourceTaskAssignment.find({ profileId: profile._id })
      .populate("taskId")
      .sort({ updatedAt: -1 })
      .lean();
    res.json({
      profile: publicProfilePayload(profile),
      tasks: tasks.map(publicTaskPayload),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取妈妈好赚任务失败" });
  }
});

router.get("/me/tasks/:taskId", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await findApprovedProfileForUser(asText(req.user?.id));
    if (!profile) {
      res.status(404).json({ message: "还没有可派单的妈妈好赚账号" });
      return;
    }
    const task = await MamaResourceTaskAssignment.findOne({ _id: asText(req.params.taskId), profileId: profile._id }).populate("taskId");
    if (!task) {
      res.status(404).json({ message: "任务不存在" });
      return;
    }
    res.json({ profile: publicProfilePayload(profile), task: publicTaskPayload(task) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取任务详情失败" });
  }
});

router.post("/me/tasks/:taskId/submissions", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await findApprovedProfileForUser(asText(req.user?.id));
    if (!profile) {
      res.status(404).json({ message: "还没有可派单的妈妈好赚账号" });
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

router.post("/applications", async (req: Request, res: Response) => {
  try {
    const displayName = asText(req.body?.displayName);
    const contactPhone = asText(req.body?.contactPhone);
    const contactWechat = asText(req.body?.contactWechat);
    const consentAccepted = req.body?.consentAccepted === true;
    const account = normalizeXiaohongshuProfileUrl(req.body?.xiaohongshuProfileUrl || req.body?.profileUrl);
    const followerCount = asOptionalNumber(req.body?.followerCount);
    const screenshotUrl = asText(req.body?.xiaohongshuScreenshotUrl || req.body?.screenshotUrl);
    const realNameVerified = asOptionalBoolean(req.body?.realNameVerified);

    if (!displayName) {
      res.status(400).json({ message: "请填写姓名或昵称" });
      return;
    }
    if (!contactWechat) {
      res.status(400).json({ message: "请填写微信号" });
      return;
    }
    if (!account.normalizedProfileUrl) {
      res.status(400).json({ message: "请填写有效的小红书主页链接" });
      return;
    }
    if (!consentAccepted) {
      res.status(400).json({ message: "请确认资料用途和隐私说明" });
      return;
    }

    const existing = await MamaResourceProfile.findOne({
      "socialAccount.normalizedProfileUrl": account.normalizedProfileUrl,
    }).lean();
    if (existing) {
      res.status(409).json({
        message: "这个小红书账号已经提交过，请联系运营更新资料",
        existingStatus: existing.status,
      });
      return;
    }

    const profile = await MamaResourceProfile.create({
      displayName,
      contactPhone,
      contactWechat,
      city: asText(req.body?.city),
      childStage: asText(req.body?.childStage),
      childGender: asText(req.body?.childGender),
      categories: asTextArray(req.body?.categories),
      status: "pending",
      accountPositioning: asText(req.body?.accountPositioning),
      consentAccepted,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: account.profileUrl,
        normalizedProfileUrl: account.normalizedProfileUrl,
        followerCount,
        screenshotUrl,
        realNameVerified,
        dataSource: screenshotUrl ? "screenshot" : "pending",
      },
      rateCard: {
        acceptsGiftExchange: req.body?.acceptsGiftExchange === true,
        blockedCategories: asTextArray(req.body?.blockedCategories),
      },
    });

    res.status(201).json({ profile: publicProfilePayload(profile) });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "这个小红书账号已经提交过，请联系运营更新资料" });
      return;
    }
    res.status(400).json({ message: error?.message || "提交失败，请稍后重试" });
  }
});

export default router;
export { normalizeXiaohongshuProfileUrl };
