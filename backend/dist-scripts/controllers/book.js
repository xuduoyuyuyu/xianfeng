"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookController = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Book_1 = __importDefault(require("../models/Book"));
const Guest_1 = __importDefault(require("../models/Guest"));
function pick(row, keys) {
    const record = row && typeof row === "object" ? row : {};
    for (const key of keys) {
        const value = record[key];
        if (value !== undefined && value !== null && String(value).trim())
            return String(value).trim();
    }
    return "";
}
function toStatus(v) {
    const s = (v || "").trim().toLowerCase();
    if (["published", "publish", "已发布", "发布", "上架"].includes(s))
        return "published";
    return "draft";
}
/** 构造 _id 查询条件，兼容 string 和 ObjectId 类型 */
function idQuery(id) {
    const sid = Array.isArray(id) ? id[0] : id;
    // 用 $expr + $eq 比较 _id 的字符串表示，绕过 Mongoose schema 的类型自动转换
    return {
        $expr: {
            $or: [
                { $eq: [{ $toString: "$_id" }, sid] },
                { $eq: [{ $toString: "$_id" }, sid.toLowerCase()] },
            ],
        },
    };
}
function normalizeBookPayload(raw, defaults) {
    const title = pick(raw, ["书名", "title", "图书名称", "名称"]);
    return {
        title,
        categoryLabel: pick(raw, ["类别", "categoryLabel", "category", "分类"]),
        topic: pick(raw, ["主题", "topic", "标签"]),
        author: pick(raw, ["著作者", "author", "作者", "Author", "作者姓名"]),
        translator: pick(raw, ["译者", "translator"]),
        publisher: pick(raw, ["出版社", "publisher"]),
        isbn: pick(raw, ["isbn", "ISBN"]),
        publishedDate: pick(raw, ["publishedDate", "published_date", "出版日期", "出版时间"]),
        grade: pick(raw, ["年级", "grade"]),
        coverImage: pick(raw, ["封面图片", "coverImage", "封面", "封面图", "图片", "cover"]) ?? "https://via.placeholder.com/240x320/630ed4/ffffff?text=Book",
        recommendedGuest: pick(raw, ["推荐嘉宾", "recommendedGuest"]) || String(defaults?.recommendedGuest || "").trim(),
        sourceName: String(defaults?.sourceName || raw?.sourceName || "").trim(),
        sourceGuestId: defaults?.sourceGuestId && mongoose_1.default.Types.ObjectId.isValid(defaults.sourceGuestId)
            ? new mongoose_1.default.Types.ObjectId(defaults.sourceGuestId)
            : null,
        // 微信小店字段
        wxProductId: pick(raw, ["wxProductId", "productId"]),
        wxShopName: pick(raw, ["wxShopName"]),
        wxShopAppid: pick(raw, ["wxShopAppid"]),
        wxSalePrice: Number(pick(raw, ["wxSalePrice", "salePrice"]) || 0),
        wxMonthlySales: Number(pick(raw, ["wxMonthlySales", "monthlySales"]) || 0),
        wxShopScore: Number(pick(raw, ["wxShopScore", "shopScore"]) || 0),
        wxHeadImgs: raw?.wxHeadImgs || raw?.headImgs || [],
        wxQrcodeUrl: pick(raw, ["wxQrcodeUrl", "qrcode", "qrcodeUrl"]),
        status: toStatus(pick(raw, ["status", "状态"])),
    };
}
function statusUpdatePayload(status) {
    if (status === "published") {
        return { status, publishedAt: new Date() };
    }
    return { status, publishedAt: null };
}
class BookController {
    async importBatch(req, res) {
        try {
            const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
            const sourceName = String(req.body?.sourceName || "").trim();
            const sourceGuestId = String(req.body?.sourceGuestId || "").trim();
            const overwrite = req.body?.overwrite === true;
            if (!rows.length) {
                res.status(400).json({ message: "导入数据为空" });
                return;
            }
            if (rows.length > 300) {
                res.status(400).json({ message: "单次导入最多 300 条，请分批导入" });
                return;
            }
            if (sourceGuestId && !mongoose_1.default.Types.ObjectId.isValid(sourceGuestId)) {
                res.status(400).json({ message: "无效的嘉宾 ID" });
                return;
            }
            if (sourceGuestId) {
                const guest = await Guest_1.default.findById(sourceGuestId).lean();
                if (!guest) {
                    res.status(400).json({ message: "绑定嘉宾不存在" });
                    return;
                }
            }
            const sourceGuestName = sourceGuestId
                ? String((await Guest_1.default.findById(sourceGuestId, { name: 1 }).lean())?.name || "")
                : "";
            let created = 0;
            let updated = 0;
            let skipped = 0;
            const skippedDetails = [];
            for (let i = 0; i < rows.length; i += 1) {
                const row = rows[i];
                const payload = normalizeBookPayload(row, {
                    sourceName,
                    sourceGuestId,
                    recommendedGuest: sourceGuestName,
                });
                const title = payload.title;
                const author = payload.author;
                if (!title || !author) {
                    skipped += 1;
                    skippedDetails.push({
                        index: i,
                        reason: !title && !author ? "缺少书名和作者" : !title ? "缺少书名" : "缺少作者",
                        title,
                        author,
                    });
                    continue;
                }
                const exists = await Book_1.default.findOne({ title }).lean();
                if (exists) {
                    if (!overwrite) {
                        skipped += 1;
                        skippedDetails.push({
                            index: i,
                            reason: "同名书籍已存在且未开启覆盖更新",
                            title,
                            author,
                        });
                        continue;
                    }
                    await Book_1.default.findByIdAndUpdate(exists._id, payload, { new: false });
                    updated += 1;
                    continue;
                }
                const book = new Book_1.default(payload);
                if (payload.status === "published") {
                    book.publishedAt = new Date();
                }
                await book.save();
                created += 1;
            }
            res.status(200).json({
                created,
                updated,
                skipped,
                total: rows.length,
                skippedDetails: skippedDetails.slice(0, 50),
            });
        }
        catch (error) {
            res.status(400).json({ message: "批量导入书单失败", error });
        }
    }
    async getAllPublic(_req, res) {
        try {
            const books = await Book_1.default.find({ status: "published" }).sort({
                publishedAt: -1,
            });
            res.status(200).json(books);
        }
        catch (error) {
            res.status(500).json({ message: "获取书单列表失败", error });
        }
    }
    async getByIdPublic(req, res) {
        try {
            const { id } = req.params;
            const book = await Book_1.default.findOne({ _id: id, status: "published" });
            if (!book) {
                res.status(404).json({ message: "书籍不存在或未上架" });
                return;
            }
            res.status(200).json(book);
        }
        catch (error) {
            res.status(500).json({ message: "获取书籍失败", error });
        }
    }
    async getAllAdmin(req, res) {
        try {
            const { status } = req.query;
            const filter = status === "draft" || status === "published" ? { status } : {};
            const books = await Book_1.default.find(filter)
                .populate("sourceGuestId", "name title")
                .sort({ updatedAt: -1 });
            res.status(200).json(books);
        }
        catch (error) {
            res.status(500).json({ message: "获取管理书单失败", error });
        }
    }
    async getByIdAdmin(req, res) {
        try {
            const { id } = req.params;
            const book = await Book_1.default.findOne(idQuery(id)).populate("sourceGuestId", "name title");
            if (!book) {
                res.status(404).json({ message: "书籍不存在" });
                return;
            }
            res.status(200).json(book);
        }
        catch (error) {
            res.status(500).json({ message: "获取书籍失败", error });
        }
    }
    async create(req, res) {
        try {
            const payload = req.body;
            const normalized = normalizeBookPayload(payload, {
                sourceName: payload?.sourceName,
                sourceGuestId: payload?.sourceGuestId,
            });
            if (!normalized.title) {
                res.status(400).json({ message: "书名不能为空" });
                return;
            }
            if (payload.status && !["draft", "published"].includes(payload.status)) {
                res.status(400).json({ message: "无效的状态值" });
                return;
            }
            if (normalized.status === "published" && !payload.publishedAt) {
                normalized.publishedAt = new Date();
            }
            const book = new Book_1.default(normalized);
            await book.save();
            res.status(201).json(book);
        }
        catch (error) {
            res.status(400).json({ message: "创建书籍失败", error });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const payload = req.body;
            const existing = await Book_1.default.findOne(idQuery(id));
            if (!existing) {
                res.status(404).json({ message: "书籍不存在" });
                return;
            }
            // 合并已有数据，确保 partial update 不丢失必要字段（如 title）
            const merged = { ...(existing.toObject?.() || existing), ...payload };
            const normalized = normalizeBookPayload(merged, {
                sourceName: merged?.sourceName || existing.sourceName,
                sourceGuestId: merged?.sourceGuestId || existing.sourceGuestId?.toString(),
            });
            if (!normalized.title) {
                res.status(400).json({ message: "书名不能为空" });
                return;
            }
            if (payload.status && !["draft", "published"].includes(payload.status)) {
                res.status(400).json({ message: "无效的状态值" });
                return;
            }
            if (normalized.status === "published" && !payload.publishedAt) {
                normalized.publishedAt = new Date();
            }
            if (normalized.status === "draft") {
                normalized.publishedAt = null;
            }
            const book = await Book_1.default.findOneAndUpdate(idQuery(id), normalized, { new: true });
            res.status(200).json(book);
        }
        catch (error) {
            res.status(400).json({ message: "更新书籍失败", error });
        }
    }
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            if (status !== "draft" && status !== "published") {
                res.status(400).json({ message: "状态仅允许 draft 或 published" });
                return;
            }
            const book = await Book_1.default.findOneAndUpdate(idQuery(id), statusUpdatePayload(status), {
                new: true,
            });
            if (!book) {
                res.status(404).json({ message: "书籍不存在" });
                return;
            }
            res.status(200).json(book);
        }
        catch (error) {
            res.status(400).json({ message: "更新书籍状态失败", error });
        }
    }
    async batchPublish(req, res) {
        try {
            const { filter, ids } = req.body;
            let query = { status: "draft" };
            if (ids && Array.isArray(ids)) {
                query._id = { $in: ids };
            }
            else if (filter === "with_wx_cover") {
                query.coverImage = { $regex: /wxapp\.tc\.qq\.com|store\.mp\.video\.tencent-cloud/ };
            }
            const now = new Date();
            const result = await Book_1.default.updateMany(query, { status: "published", publishedAt: now });
            res.status(200).json({ matched: result.matchedCount, modified: result.modifiedCount });
        }
        catch (error) {
            res.status(500).json({ message: "批量发布失败", error });
        }
    }
    async delete(req, res) {
        try {
            const { id } = req.params;
            const book = await Book_1.default.findOneAndDelete(idQuery(id));
            if (!book) {
                res.status(404).json({ message: "书籍不存在" });
                return;
            }
            res.status(200).json({ message: "书籍删除成功" });
        }
        catch (error) {
            res.status(500).json({ message: "删除书籍失败", error });
        }
    }
}
exports.BookController = BookController;
