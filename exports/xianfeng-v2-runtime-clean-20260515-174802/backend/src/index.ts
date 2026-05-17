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
import tutorbotRoutes from "./routes/tutorbot";
import aiCompatRoutes from "./routes/aiCompat";
import { UserController } from "./controllers/user";
import { authenticate } from "./middlewares/auth";
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
app.use("/api/learning-materials", learningMaterialRoutes);
app.use("/api/users", userRoutes);
app.post("/api/sms/send-code", (req, res) => userController.sendMobileCode(req, res));
app.post("/api/auth/mobile", (req, res) => userController.mobileAuth(req, res));
app.get("/api/me", authenticate, (req, res) => userController.meCompat(req as any, res));
app.patch("/api/me", authenticate, (req, res) => userController.patchMeCompat(req as any, res));
app.use("/api/admin/programs", adminProgramRoutes);
app.use("/api/admin/books", adminBookRoutes);
app.use("/api/admin/learning-materials", adminLearningMaterialRoutes);
app.use("/api/admin/dictionary", adminDictionaryRoutes);
app.use("/api/admin/guests", adminGuestRoutes);
app.use("/api/admin", adminSystemRoutes);
app.use("/api/admin", adminMultiAgentsRoutes);
app.use("/api/admin", adminAgentTaskRoutes);
app.use("/api/admin", adminInboxRoutes);
app.use("/api/v1/tutorbot", tutorbotRoutes);
app.use("/api/ai", aiCompatRoutes);

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
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/xianfeng")
  .then(() => console.log("MongoDB connected"))
  .catch((error) => console.error("MongoDB connection error:", error));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

startAgentTaskDispatcher().catch((error) => {
  console.error("Failed to start agent task dispatcher:", error);
});

export default app;
