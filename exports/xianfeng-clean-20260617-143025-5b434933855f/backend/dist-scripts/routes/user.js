"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const user_1 = require("../controllers/user");
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const router = express_1.default.Router();
const userController = new user_1.UserController();
// 头像上传
const avatarUploadDir = path_1.default.join(process.cwd(), "uploads", "avatars");
if (!fs_1.default.existsSync(avatarUploadDir)) {
    fs_1.default.mkdirSync(avatarUploadDir, { recursive: true });
}
const avatarUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, avatarUploadDir),
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname) || ".png";
            const name = `avatar-${Date.now()}${Math.random().toString(36).slice(2, 8)}${ext}`;
            cb(null, name);
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        cb(null, allowed.includes(file.mimetype));
    },
});
router.post("/login", userController.login);
router.post("/sms/send-code", userController.sendMobileCode);
router.post("/auth/mobile", userController.mobileAuth);
router.post("/page-view", auth_1.optionalAuthenticate, userController.trackPageView);
router.get("/me", auth_1.authenticate, userController.meCompat);
router.patch("/me", auth_1.authenticate, userController.patchMeCompat);
router.post("/me/avatar", auth_1.authenticate, (req, res, next) => {
    avatarUpload.single("image")(req, res, (error) => {
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
router.get("/", auth_1.authenticate, requireAdmin_1.requireAdmin, userController.getAll);
router.get("/portrait", auth_1.authenticate, requireAdmin_1.requireAdmin, userController.getPortrait);
router.post("/register", auth_1.optionalAuthenticate, userController.register);
router.put("/:id", auth_1.authenticate, requireAdmin_1.requireAdmin, userController.update);
router.delete("/:id", auth_1.authenticate, requireAdmin_1.requireAdmin, userController.delete);
exports.default = router;
