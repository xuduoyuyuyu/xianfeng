import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { UserController } from "../controllers/user";
import { authenticate, AuthenticatedRequest, optionalAuthenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";
import UserChildMemory from "../models/UserChildMemory";
import UserXiaowanziSync from "../models/UserXiaowanziSync";
import {
  buildChildMemorySummary,
  cleanChildMemoryText,
  enqueueChildMemory,
  joinChildMemoryItems,
  normalizeChildMemorySummary,
  splitChildMemoryItems,
} from "../services/childMemory";
import { enqueueToMemoryQueue } from "../services/memoryScheduler";
import { emptyXiaowanziSyncState, mergeXiaowanziSyncState, sanitizeXiaowanziSyncState } from "../services/xiaowanziSync";

const router = express.Router();
const userController = new UserController();

async function getOrCreateChildMemory(userId: string, childId: string) {
  const safeChildId = cleanChildMemoryText(childId, 80);
  return UserChildMemory.findOneAndUpdate(
    { userId, childId: safeChildId },
    { $setOnInsert: { userId, childId: safeChildId, enabled: true, summary: "" } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function serializeChildMemory(doc: any, childId: string) {
  const summary = normalizeChildMemorySummary(String(doc?.summary || ""));
  return {
    childId,
    enabled: doc?.enabled !== false,
    summary,
    items: splitChildMemoryItems(summary),
    updatedAt: doc?.updatedAt,
  };
}

function serializeXiaowanziSync(doc: any) {
  return {
    ...sanitizeXiaowanziSyncState(doc || emptyXiaowanziSyncState()),
    updatedAt: doc?.updatedAt || null,
  };
}

// 头像上传
const avatarUploadDir = path.join(process.cwd(), "uploads", "avatars");
if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      const name = `avatar-${Date.now()}${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg","image/png","image/webp","image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post("/login", userController.login);
router.post("/invite/verify", userController.verifyInviteCode);
router.post("/sms/send-code", userController.sendMobileCode);
router.post("/auth/mobile", userController.mobileAuth);
router.post("/page-view", optionalAuthenticate, userController.trackPageView);
router.get("/me", authenticate, userController.meCompat);
router.patch("/me", authenticate, userController.patchMeCompat);
router.delete("/me", authenticate, userController.deleteMe);
router.get("/me/xiaowanzi-sync", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ detail: "未登录" });
      return;
    }
    const doc = await UserXiaowanziSync.findOne({ userId: req.user.id }).lean();
    res.json(serializeXiaowanziSync(doc));
  } catch (error: any) {
    res.status(500).json({ detail: error?.message || "读取小玩子同步数据失败" });
  }
});
router.patch("/me/xiaowanzi-sync", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ detail: "未登录" });
      return;
    }
    const existing = await UserXiaowanziSync.findOne({ userId: req.user.id }).lean();
    const merged = mergeXiaowanziSyncState(existing as any, req.body || {});
    const doc = await UserXiaowanziSync.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { ...merged, userId: req.user.id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    res.json(serializeXiaowanziSync(doc));
  } catch (error: any) {
    res.status(500).json({ detail: error?.message || "同步小玩子数据失败" });
  }
});
router.get("/me/child-memories/:childId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const childId = cleanChildMemoryText(req.params.childId, 80);
    if (!req.user?.id || !childId) {
      res.status(400).json({ detail: "childId is required" });
      return;
    }
    const doc = await getOrCreateChildMemory(req.user.id, childId);
    res.json(serializeChildMemory(doc, childId));
  } catch (error: any) {
    res.status(500).json({ detail: error?.message || "读取记忆失败" });
  }
});
router.patch("/me/child-memories/:childId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const childId = cleanChildMemoryText(req.params.childId, 80);
    if (!req.user?.id || !childId) {
      res.status(400).json({ detail: "childId is required" });
      return;
    }
    const doc = await getOrCreateChildMemory(req.user.id, childId);
    if (typeof req.body?.enabled === "boolean") doc.enabled = req.body.enabled;
    await doc.save();
    res.json(serializeChildMemory(doc, childId));
  } catch (error: any) {
    res.status(500).json({ detail: error?.message || "更新记忆失败" });
  }
});
router.post("/me/child-memories/:childId/merge", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const childId = cleanChildMemoryText(req.params.childId, 80);
    if (!req.user?.id || !childId) {
      res.status(400).json({ detail: "childId is required" });
      return;
    }
    const doc = await getOrCreateChildMemory(req.user.id, childId);
    if (doc.enabled === false) {
      res.json({ ...serializeChildMemory(doc, childId), skipped: true });
      return;
    }
    const result = await buildChildMemorySummary({
      previous: doc.summary || "",
      childProfile: req.body?.childProfile,
      userMessage: req.body?.userMessage,
      assistantReply: req.body?.assistantReply,
    });
    doc.summary = result.summary;
    await doc.save();

    // 将消息放入午夜处理队列
    const queueItem = enqueueChildMemory({
      userMessage: req.body?.userMessage,
      assistantReply: req.body?.assistantReply,
    });
    if (queueItem) {
      enqueueToMemoryQueue(req.user!.id, childId, queueItem);
    }

    res.json(serializeChildMemory(doc, childId));
  } catch (error: any) {
    res.status(500).json({ detail: error?.message || "合并记忆失败" });
  }
});
router.delete("/me/child-memories/:childId/items/:itemId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const childId = cleanChildMemoryText(req.params.childId, 80);
    const itemId = cleanChildMemoryText(req.params.itemId, 20);
    if (!req.user?.id || !childId) {
      res.status(400).json({ detail: "childId is required" });
      return;
    }
    const doc = await getOrCreateChildMemory(req.user.id, childId);
    const items = splitChildMemoryItems(doc.summary || "").filter((item) => item.id !== itemId);
    doc.summary = joinChildMemoryItems(items);
    await doc.save();
    res.json(serializeChildMemory(doc, childId));
  } catch (error: any) {
    res.status(500).json({ detail: error?.message || "删除记忆失败" });
  }
});
router.post("/me/avatar", authenticate, (req, res, next) => {
  avatarUpload.single("image")(req, res, (error: any) => {
    if (error) {
      if (error?.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ message: "图片文件过大，最大支持 5MB" });
        return;
      }
      res.status(400).json({ message: error?.message || "头像上传失败" });
      return;
    }
    next();
  });
}, userController.uploadAvatar);
router.get("/", authenticate, requireAdmin, userController.getAll);
router.get("/portrait", authenticate, requireAdmin, userController.getPortrait);
router.post("/register", optionalAuthenticate, userController.register);
router.put("/:id", authenticate, requireAdmin, userController.update);
router.delete("/:id", authenticate, requireAdmin, userController.delete);

export default router;
