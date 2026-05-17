import { Router } from "express";
import mongoose from "mongoose";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";
import AgentTaskModel from "../models/AgentTask";
import {
  createAgentTask,
  normalizeTaskResponse,
  retryAgentTask,
} from "../services/agentTaskDispatcher";

const router = Router();

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

router.use(authenticate, requireAdmin);

router.post("/agent-tasks", async (req: AuthenticatedRequest, res) => {
  try {
    const taskType = asText(req.body?.taskType) as any;
    const targetType = asText(req.body?.targetType) as any;
    const targetId = asText(req.body?.targetId);
    if (!taskType || !targetType || !targetId) {
      return res.status(400).json({ message: "taskType/targetType/targetId 必填" });
    }
    const task = await createAgentTask({
      taskType,
      targetType,
      targetId,
      options: req.body?.options || {},
      createdBy: asText(req.user?.id),
      maxRetries: Number(req.body?.maxRetries),
    });
    return res.status(201).json(normalizeTaskResponse(task));
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "创建任务失败" });
  }
});

router.get("/agent-tasks/:id", async (req, res) => {
  try {
    const id = asText(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "任务 ID 非法" });
    }
    const task = await AgentTaskModel.findById(id).lean();
    if (!task) return res.status(404).json({ message: "任务不存在" });
    return res.status(200).json(normalizeTaskResponse(task));
  } catch (error: any) {
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

    const filter: Record<string, any> = {};
    if (taskType) filter.taskType = taskType;
    if (targetType) filter.targetType = targetType;
    if (status) filter.status = status;
    if (targetId) {
      if (!mongoose.Types.ObjectId.isValid(targetId)) {
        return res.status(400).json({ message: "targetId 非法" });
      }
      filter.targetId = new mongoose.Types.ObjectId(targetId);
    }

    const rows = await AgentTaskModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.status(200).json({ items: rows.map((item) => normalizeTaskResponse(item)) });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "查询任务失败" });
  }
});

router.post("/agent-tasks/:id/retry", async (req, res) => {
  try {
    const id = asText(req.params.id);
    const task = await retryAgentTask(id);
    return res.status(200).json(normalizeTaskResponse(task));
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "重试任务失败" });
  }
});

export default router;
