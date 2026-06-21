"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const program_1 = __importDefault(require("./routes/program"));
const book_1 = __importDefault(require("./routes/book"));
const wxStore_1 = require("./services/wxStore");
const Book_1 = __importDefault(require("./models/Book"));
const learningMaterial_1 = __importDefault(require("./routes/learningMaterial"));
const guest_1 = __importDefault(require("./routes/guest"));
const user_1 = __importDefault(require("./routes/user"));
const adminProgram_1 = __importDefault(require("./routes/adminProgram"));
const adminBook_1 = __importDefault(require("./routes/adminBook"));
const adminLearningMaterial_1 = __importDefault(require("./routes/adminLearningMaterial"));
const adminSystem_1 = __importDefault(require("./routes/adminSystem"));
const adminMultiAgents_1 = __importDefault(require("./routes/adminMultiAgents"));
const adminDictionary_1 = __importDefault(require("./routes/adminDictionary"));
const adminGuest_1 = __importDefault(require("./routes/adminGuest"));
const adminAgentTasks_1 = __importDefault(require("./routes/adminAgentTasks"));
const adminInbox_1 = __importDefault(require("./routes/adminInbox"));
const adminWorthbuy_1 = __importDefault(require("./routes/adminWorthbuy"));
const tutorbot_1 = __importDefault(require("./routes/tutorbot"));
const aiCompat_1 = __importDefault(require("./routes/aiCompat"));
const topic_1 = require("./routes/topic");
const user_2 = require("./controllers/user");
const auth_1 = require("./middlewares/auth");
const requireAdmin_1 = require("./middlewares/requireAdmin");
const agentTaskDispatcher_1 = require("./services/agentTaskDispatcher");
dotenv_1.default.config();
const app = (0, express_1.default)();
const userController = new user_2.UserController();
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
const swaggerDocs = (0, swagger_jsdoc_1.default)(swaggerOptions);
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const allowedOrigins = corsOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const localDevOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|home\.localhost)(:\d+)?$/;
function isLocalDevOrigin(origin) {
    return localDevOriginPattern.test(origin);
}
const finalAllowedOrigins = Array.from(new Set([...allowedOrigins]));
app.use(express_1.default.json({ limit: "20mb" }));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || finalAllowedOrigins.length === 0 || finalAllowedOrigins.includes(origin) || isLocalDevOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
}));
app.use("/api/programs", program_1.default);
app.use("/api/guests", guest_1.default);
app.use("/api/books", book_1.default);
// 微信小店商品链接
app.get("/api/books/:id/wx-product-url", async (req, res) => {
    try {
        const { id } = req.params;
        const col = (await Book_1.default.collection.conn).db.collection("books");
        const book = await col.findOne({ _id: id }, { projection: { wxProductId: 1, wxShopAppid: 1 } });
        if (!book)
            return res.status(404).json({ error: "书籍不存在" });
        if (!book.wxProductId)
            return res.status(400).json({ error: "该书没有关联微信小店商品" });
        const url = await (0, wxStore_1.getProductH5Url)(book.wxProductId);
        if (url) {
            res.json({ url });
        }
        else {
            res.status(502).json({ error: "获取商品链接失败" });
        }
    }
    catch (e) {
        res.status(500).json({ error: e.message || "服务器错误" });
    }
});
app.use("/api/learning-materials", learningMaterial_1.default);
app.use("/api/users", user_1.default);
app.post("/api/sms/send-code", (req, res) => userController.sendMobileCode(req, res));
app.post("/api/auth/mobile", (req, res) => userController.mobileAuth(req, res));
app.get("/api/me", auth_1.authenticate, (req, res) => userController.meCompat(req, res));
app.patch("/api/me", auth_1.authenticate, (req, res) => userController.patchMeCompat(req, res));
// 通用上传端点（图片/文件）
const uploadDir = path_1.default.join(process.cwd(), "uploads", "images");
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const generalUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const ext = (path_1.default.extname(file.originalname) || ".jpg").toLowerCase();
            cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
            return;
        }
        cb(new Error("仅支持图片文件"));
    },
});
app.post("/api/admin/upload", auth_1.authenticate, requireAdmin_1.requireAdmin, (req, res) => {
    generalUpload.single("file")(req, res, (err) => {
        if (err) {
            res.status(400).json({ message: err.message });
            return;
        }
        if (!req.file) {
            res.status(400).json({ message: "未提供文件" });
            return;
        }
        const file = req.file;
        const host = req.get("host") || "";
        const proto = req.protocol || "https";
        const url = `${proto}://${host}/uploads/images/${file.filename}`;
        res.json({ url, filename: file.filename });
    });
});
app.use("/api/admin/programs", adminProgram_1.default);
app.use("/api/admin/books", adminBook_1.default);
app.use("/api/admin/learning-materials", adminLearningMaterial_1.default);
app.use("/api/admin/dictionary", adminDictionary_1.default);
app.use("/api/admin/guests", adminGuest_1.default);
app.use("/api/admin", adminSystem_1.default);
app.use("/api/admin", adminMultiAgents_1.default);
app.use("/api/admin", adminAgentTasks_1.default);
app.use("/api/admin", adminInbox_1.default);
app.use("/api/admin/worthbuy", adminWorthbuy_1.default);
app.use("/api/v1/tutorbot", tutorbot_1.default);
app.use("/api/ai", aiCompat_1.default);
app.use("/api/topic-hub", topic_1.publicRouter);
app.use("/api/admin/topic-hub", topic_1.adminRouter);
const uploadsDir = path_1.default.join(process.cwd(), "uploads");
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express_1.default.static(uploadsDir));
app.use("/api-docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocs));
app.use((error, _req, res, next) => {
    if (error?.type === "entity.too.large" || error?.status === 413) {
        res.status(413).json({ message: "提交内容过大，请精简逐字稿后重试（当前上限 20MB）" });
        return;
    }
    next(error);
});
mongoose_1.default
    .connect(process.env.DB_URI || process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/xianfeng")
    .then(() => console.log("MongoDB connected"))
    .catch((error) => console.error("MongoDB connection error:", error));
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
(0, agentTaskDispatcher_1.startAgentTaskDispatcher)().catch((error) => {
    console.error("Failed to start agent task dispatcher:", error);
});
exports.default = app;
