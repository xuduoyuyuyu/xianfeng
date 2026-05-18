import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { UserController } from "../controllers/user";
import { authenticate, optionalAuthenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = express.Router();
const userController = new UserController();

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
router.post("/sms/send-code", userController.sendMobileCode);
router.post("/auth/mobile", userController.mobileAuth);
router.post("/page-view", optionalAuthenticate, userController.trackPageView);
router.get("/me", authenticate, userController.meCompat);
router.patch("/me", authenticate, userController.patchMeCompat);
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
