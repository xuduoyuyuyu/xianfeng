import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import multer from "multer";
import fs from "fs";
import path from "path";
import programRoutes from "./routes/program";
import bookRoutes from "./routes/book";
import { getProductH5Url } from "./services/wxStore";
import Book from "./models/Book";
import learningMaterialRoutes from "./routes/learningMaterial";
import guestRoutes from "./routes/guest";
import userRoutes from "./routes/user";
import adminProgramRoutes from "./routes/adminProgram";
import adminBookRoutes from "./routes/adminBook";
import adminLearningMaterialRoutes from "./routes/adminLearningMaterial";
import adminSystemRoutes from "./routes/adminSystem";
import adminMultiAgentsRoutes from "./routes/adminMultiAgents";
import adminDictionaryRoutes from "./routes/adminDictionary";
import adminGuestRoutes from "./routes/adminGuest";
import adminAgentTaskRoutes from "./routes/adminAgentTasks";
import adminInboxRoutes from "./routes/adminInbox";
import adminWorthbuyRoutes from "./routes/adminWorthbuy";
import tutorbotRoutes from "./routes/tutorbot";
import aiCompatRoutes from "./routes/aiCompat";
import { publicRouter as topicPublicRoutes, adminRouter as topicAdminRoutes } from "./routes/topic";
import { UserController } from "./controllers/user";
import { authenticate } from "./middlewares/auth";
import { requireAdmin } from "./middlewares/requireAdmin";
import { startAgentTaskDispatcher } from "./services/agentTaskDispatcher";

dotenv.config();

const app = express();
const userController = new UserController();
const PORT = process.env.PORT || 3001;

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "家长先疯 API",
      version: "1.0.0",
      description: "家长先疯 API 文档",
    },
  },
  apis: ["./src/routes/*.ts"],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const allowedOrigins = corsOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const localDevOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|home\.localhost)(:\d+)?$/;

function isLocalDevOrigin(origin: string): boolean {
  return localDevOriginPattern.test(origin);
}

const finalAllowedOrigins = Array.from(new Set([...allowedOrigins]));

app.use(express.json({ limit: "20mb" }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || finalAllowedOrigins.length === 0 || finalAllowedOrigins.includes(origin) || isLocalDevOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use("/api/programs", programRoutes);
app.use("/api/guests", guestRoutes);
app.use("/api/books", bookRoutes);
// 微信小店商品链接
app.get("/api/books/:id/wx-product-url", async (req, res) => {
  try {
    const { id } = req.params;
    const col = (await (Book as any).collection.conn).db.collection("books");
    const book = await col.findOne({ _id: id }, { projection: { wxProductId: 1, wxShopAppid: 1 } });
    if (!book) return res.status(404).json({ error: "书籍不存在" });
    if (!book.wxProductId) return res.status(400).json({ error: "该书没有关联微信小店商品" });
    const url = await getProductH5Url(book.wxProductId);
    if (url) {
      res.json({ url });
    } else {
      res.status(502).json({ error: "获取商品链接失败" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || "服务器错误" });
  }
});
app.use("/api/learning-materials", learningMaterialRoutes);
app.use("/api/users", userRoutes);
app.post("/api/sms/send-code", (req, res) => userController.sendMobileCode(req, res));
app.post("/api/auth/mobile", (req, res) => userController.mobileAuth(req, res));
app.get("/api/me", authenticate, (req, res) => userController.meCompat(req as any, res));
app.patch("/api/me", authenticate, (req, res) => userController.patchMeCompat(req as any, res));
// 通用上传端点（图片/文件）
const uploadDir = path.join(process.cwd(), "uploads", "images");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const generalUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) { cb(null, true); return; }
    cb(new Error("仅支持图片文件"));
  },
});
app.post("/api/admin/upload", authenticate, requireAdmin, (req, res) => {
  generalUpload.single("file")(req, res, (err: any) => {
    if (err) { res.status(400).json({ message: err.message }); return; }
    if (!req.file) { res.status(400).json({ message: "未提供文件" }); return; }
    const file = req.file as Express.Multer.File;
    const host = req.get("host") || "";
    const proto = req.protocol || "https";
    const url = `${proto}://${host}/uploads/images/${file.filename}`;
    res.json({ url, filename: file.filename });
  });
});

app.use("/api/admin/programs", adminProgramRoutes);
app.use("/api/admin/books", adminBookRoutes);
app.use("/api/admin/learning-materials", adminLearningMaterialRoutes);
app.use("/api/admin/dictionary", adminDictionaryRoutes);
app.use("/api/admin/guests", adminGuestRoutes);
app.use("/api/admin", adminSystemRoutes);
app.use("/api/admin", adminMultiAgentsRoutes);
app.use("/api/admin", adminAgentTaskRoutes);
app.use("/api/admin", adminInboxRoutes);
app.use("/api/admin/worthbuy", adminWorthbuyRoutes);
app.use("/api/v1/tutorbot", tutorbotRoutes);
app.use("/api/ai", aiCompatRoutes);
app.use("/api/topic-hub", topicPublicRoutes);
app.use("/api/admin/topic-hub", topicAdminRoutes);

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error?.type === "entity.too.large" || error?.status === 413) {
    res.status(413).json({ message: "提交内容过大，请精简逐字稿后重试（当前上限 20MB）" });
    return;
  }
  next(error);
});

mongoose
  .connect(process.env.DB_URI || process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/xianfeng")
  .then(() => console.log("MongoDB connected"))
  .catch((error) => console.error("MongoDB connection error:", error));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

startAgentTaskDispatcher().catch((error) => {
  console.error("Failed to start agent task dispatcher:", error);
});

export default app;
