"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const program_1 = require("../controllers/program");
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const router = express_1.default.Router();
const programController = new program_1.ProgramController();
const uploadDir = path_1.default.join(process.cwd(), "uploads", "audio");
const imageUploadDir = path_1.default.join(process.cwd(), "uploads", "images");
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
if (!fs_1.default.existsSync(imageUploadDir)) {
    fs_1.default.mkdirSync(imageUploadDir, { recursive: true });
}
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const ext = (path_1.default.extname(file.originalname) || ".mp3").toLowerCase();
            cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
        },
    }),
    limits: {
        fileSize: 512 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("audio/")) {
            cb(null, true);
            return;
        }
        cb(new Error("仅支持上传音频文件"));
    },
});
const imageUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, imageUploadDir),
        filename: (_req, file, cb) => {
            const ext = (path_1.default.extname(file.originalname) || ".jpg").toLowerCase();
            cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
        },
    }),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
            return;
        }
        cb(new Error("仅支持上传图片文件"));
    },
});
router.use(auth_1.authenticate, requireAdmin_1.requireAdmin);
router.get("/", programController.getAllAdmin);
router.post("/upload-audio", (req, res, next) => {
    upload.single("audio")(req, res, (error) => {
        if (error) {
            if (error?.code === "LIMIT_FILE_SIZE") {
                res.status(400).json({ message: "音频文件过大，最大支持 512MB" });
                return;
            }
            res.status(400).json({ message: error?.message || "音频上传失败" });
            return;
        }
        next();
    });
}, programController.uploadAudio);
router.post("/upload-image", (req, res, next) => {
    imageUpload.single("image")(req, res, (error) => {
        if (error) {
            if (error?.code === "LIMIT_FILE_SIZE") {
                res.status(400).json({ message: "图片文件过大，最大支持 10MB" });
                return;
            }
            res.status(400).json({ message: error?.message || "图片上传失败" });
            return;
        }
        next();
    });
}, programController.uploadImage);
router.post("/create-from-audio", programController.createFromAudio);
router.post("/:id/preview-link", programController.createPreviewLink);
router.post("/:id/proofread/accept", (req, res) => programController.acceptProofread(req, res));
router.get("/:id", programController.getByIdAdmin);
router.post("/", programController.create);
router.put("/:id", programController.update);
router.patch("/:id/status", programController.updateStatus);
router.delete("/:id", programController.delete);
exports.default = router;
