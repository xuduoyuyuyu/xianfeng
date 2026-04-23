import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import fs from "fs";
import path from "path";
import programRoutes from "./routes/program";
import bookRoutes from "./routes/book";
import learningMaterialRoutes from "./routes/learningMaterial";
import userRoutes from "./routes/user";
import adminProgramRoutes from "./routes/adminProgram";
import adminBookRoutes from "./routes/adminBook";
import adminLearningMaterialRoutes from "./routes/adminLearningMaterial";
import adminSystemRoutes from "./routes/adminSystem";
import adminDictionaryRoutes from "./routes/adminDictionary";

dotenv.config();

const app = express();
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

function isLocalDevOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|home\.localhost):\d+$/.test(origin);
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
app.use("/api/books", bookRoutes);
app.use("/api/learning-materials", learningMaterialRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin/programs", adminProgramRoutes);
app.use("/api/admin/books", adminBookRoutes);
app.use("/api/admin/learning-materials", adminLearningMaterialRoutes);
app.use("/api/admin/dictionary", adminDictionaryRoutes);
app.use("/api/admin", adminSystemRoutes);

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
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/knowledge-base")
  .then(() => console.log("MongoDB connected"))
  .catch((error) => console.error("MongoDB connection error:", error));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
