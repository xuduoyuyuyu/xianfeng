"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const AgentTask_1 = __importDefault(require("../models/AgentTask"));
const agentTaskDispatcher_1 = require("../services/agentTaskDispatcher");
const router = (0, express_1.Router)();
function asText(value) {
    return typeof value === "string" ? value.trim() : "";
}
router.use(auth_1.authenticate, requireAdmin_1.requireAdmin);
router.post("/agent-tasks", async (req, res) => {
    try {
        const taskType = asText(req.body?.taskType);
        const targetType = asText(req.body?.targetType);
        const targetId = asText(req.body?.targetId);
        if (!taskType || !targetType || !targetId) {
            return res.status(400).json({ message: "taskType/targetType/targetId 必填" });
        }
        const task = await (0, agentTaskDispatcher_1.createAgentTask)({
            taskType,
            targetType,
            targetId,
            options: req.body?.options || {},
            createdBy: asText(req.user?.id),
            maxRetries: Number(req.body?.maxRetries),
        });
        return res.status(201).json((0, agentTaskDispatcher_1.normalizeTaskResponse)(task));
    }
    catch (error) {
        return res.status(400).json({ message: error?.message || "创建任务失败" });
    }
});
router.get("/agent-tasks/:id", async (req, res) => {
    try {
        const id = asText(req.params.id);
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "任务 ID 非法" });
        }
        const task = await AgentTask_1.default.findById(id).lean();
        if (!task)
            return res.status(404).json({ message: "任务不存在" });
        return res.status(200).json((0, agentTaskDispatcher_1.normalizeTaskResponse)(task));
    }
    catch (error) {
        return res.status(500).json({ message: error?.message || "获取任务失败" });
    }
});
router.get("/agent-tasks", async (req, res) => {
    try {
        const taskType = asText(req.query.taskType);
        const targetType = asText(req.query.targetType);
        const targetId = asText(req.query.targetId);
        const status = asText(req.query.status);
        const limitRaw = Number(req.query.limit);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 50;
        const filter = {};
        if (taskType)
            filter.taskType = taskType;
        if (targetType)
            filter.targetType = targetType;
        if (status)
            filter.status = status;
        if (targetId) {
            if (!mongoose_1.default.Types.ObjectId.isValid(targetId)) {
                return res.status(400).json({ message: "targetId 非法" });
            }
            filter.targetId = new mongoose_1.default.Types.ObjectId(targetId);
        }
        const rows = await AgentTask_1.default.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
        return res.status(200).json({ items: rows.map((item) => (0, agentTaskDispatcher_1.normalizeTaskResponse)(item)) });
    }
    catch (error) {
        return res.status(500).json({ message: error?.message || "查询任务失败" });
    }
});
router.post("/agent-tasks/:id/retry", async (req, res) => {
    try {
        const id = asText(req.params.id);
        const task = await (0, agentTaskDispatcher_1.retryAgentTask)(id);
        return res.status(200).json((0, agentTaskDispatcher_1.normalizeTaskResponse)(task));
    }
    catch (error) {
        return res.status(400).json({ message: error?.message || "重试任务失败" });
    }
});
exports.default = router;
