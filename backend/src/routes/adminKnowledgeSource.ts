import express from "express";
import multer from "multer";
import { AdminKnowledgeSourceController } from "../controllers/adminKnowledgeSource";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = express.Router();
const controller = new AdminKnowledgeSourceController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
    ];
    if (file.mimetype.startsWith("text/") || allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("仅支持 PDF、DOC、DOCX、TXT、MD、CSV、JSON 文件"));
  },
});

router.use(authenticate, requireAdmin);
router.get("/", (req, res) => controller.list(req, res));
router.post("/", (req, res) => controller.create(req, res));
router.post("/upload", (req, res) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ message: err.message || "上传知识库资料失败" });
      return;
    }
    controller.upload(req, res);
  });
});
router.post("/guests/:guestId/sync", (req, res) => controller.syncGuest(req, res));

export default router;
