import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { ProgramController } from "../controllers/program";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = express.Router();
const programController = new ProgramController();
const uploadDir = path.join(process.cwd(), "uploads", "audio");
const imageUploadDir = path.join(process.cwd(), "uploads", "images");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(imageUploadDir)) {
  fs.mkdirSync(imageUploadDir, { recursive: true });
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".mp3";
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
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, imageUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
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

router.use(authenticate, requireAdmin);
router.get("/", programController.getAllAdmin);
router.post("/upload-audio", (req, res, next) => {
  upload.single("audio")(req, res, (error: any) => {
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
  imageUpload.single("image")(req, res, (error: any) => {
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
router.post("/:id/parse", programController.triggerParse);
router.post("/:id/preview-link", programController.createPreviewLink);
router.get("/:id/parse-status", programController.getParseStatus);
router.post("/:id/proofread/accept", (req, res) => programController.acceptProofread(req as any, res));
router.get("/:id", programController.getByIdAdmin);
router.post("/", programController.create);
router.put("/:id", programController.update);
router.patch("/:id/status", programController.updateStatus);
router.delete("/:id", programController.delete);

export default router;
