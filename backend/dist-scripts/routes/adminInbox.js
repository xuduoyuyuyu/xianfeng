"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const AdminInboxMessage_1 = __importDefault(require("../models/AdminInboxMessage"));
const adminInbox_1 = require("../services/adminInbox");
const router = (0, express_1.Router)();
function asText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function asBool(value) {
    if (value === true || value === "true" || value === "1" || value === 1)
        return true;
    if (value === false || value === "false" || value === "0" || value === 0)
        return false;
    return null;
}
router.use(auth_1.authenticate, requireAdmin_1.requireAdmin);
router.get("/inbox", async (req, res) => {
    try {
        const pageRaw = Number(req.query.page);
        const pageSizeRaw = Number(req.query.pageSize);
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
        const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(100, Math.floor(pageSizeRaw)) : 20;
        const filter = {};
        const taskType = asText(req.query.task_type);
        const status = asText(req.query.status);
        const sourceType = asText(req.query.source_type);
        const targetType = asText(req.query.target_type);
        const isRead = asBool(req.query.is_read);
        const dateFrom = asText(req.query.date_from);
        const dateTo = asText(req.query.date_to);
        if (taskType)
            filter.taskType = taskType;
        if (status)
            filter.taskStatus = status;
        if (sourceType)
            filter.sourceType = sourceType;
        if (targetType)
            filter.targetType = targetType;
        if (isRead !== null)
            filter.isRead = isRead;
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom)
                filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }
        const [items, total, unreadCount] = await Promise.all([
            AdminInboxMessage_1.default.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .lean(),
            AdminInboxMessage_1.default.countDocuments(filter),
            AdminInboxMessage_1.default.countDocuments({ ...filter, isRead: false }),
        ]);
        return res.status(200).json({
            items: items.map(adminInbox_1.normalizeInboxMessage),
            page,
            pageSize,
            total,
            unreadCount,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error?.message || "获取站内信失败" });
    }
});
router.get("/inbox/:id", async (req, res) => {
    try {
        const id = asText(req.params.id);
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "消息 ID 非法" });
        }
        const row = await AdminInboxMessage_1.default.findById(id).lean();
        if (!row)
            return res.status(404).json({ message: "消息不存在" });
        return res.status(200).json((0, adminInbox_1.normalizeInboxMessage)(row));
    }
    catch (error) {
        return res.status(500).json({ message: error?.message || "获取消息详情失败" });
    }
});
router.patch("/inbox/:id/read", async (req, res) => {
    try {
        const id = asText(req.params.id);
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "消息 ID 非法" });
        }
        const row = await AdminInboxMessage_1.default.findByIdAndUpdate(id, { $set: { isRead: true, readAt: new Date() } }, { new: true }).lean();
        if (!row)
            return res.status(404).json({ message: "消息不存在" });
        return res.status(200).json({ ok: true, item: (0, adminInbox_1.normalizeInboxMessage)(row) });
    }
    catch (error) {
        return res.status(500).json({ message: error?.message || "标记已读失败" });
    }
});
router.patch("/inbox/read-all", async (_req, res) => {
    try {
        await AdminInboxMessage_1.default.updateMany({ isRead: false }, { $set: { isRead: true, readAt: new Date() } });
        return res.status(200).json({ ok: true });
    }
    catch (error) {
        return res.status(500).json({ message: error?.message || "全部已读失败" });
    }
});
exports.default = router;
