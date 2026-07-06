import { Request, Response } from "express";
import mongoose from "mongoose";
import LearningMaterial from "../models/LearningMaterial";

function asText(value: any): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function idQuery(id: string | string[]) {
  const sid = asText(Array.isArray(id) ? id[0] : id);
  if (!sid) return { _id: null };
  const stringIdQuery = {
    $expr: {
      $or: [
        { $eq: [{ $toString: "$_id" }, sid] },
        { $eq: [{ $toString: "$_id" }, sid.toLowerCase()] },
      ],
    },
  };
  if (mongoose.Types.ObjectId.isValid(sid)) {
    return { $or: [{ _id: sid }, stringIdQuery] };
  }
  return stringIdQuery;
}

function formatLearningMaterialError(error: any, fallback: string): string {
  if (error?.code === 11000 && error?.keyPattern?.title) {
    return "资料标题已存在，请编辑已有资料或换一个标题";
  }
  if (error?.name === "ValidationError" && error?.errors) {
    const messages = Object.values(error.errors)
      .map((item: any) => item?.message)
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join("；");
    }
  }
  return error?.message || fallback;
}

function statusUpdatePayload(status: "draft" | "published") {
  if (status === "published") {
    return { status, publishedAt: new Date() };
  }
  return { status, publishedAt: null };
}

export class LearningMaterialController {
  async getAllPublic(_req: Request, res: Response): Promise<void> {
    try {
      const materials = await LearningMaterial.find({ status: "published" }).sort({
        publishedAt: -1,
      });
      res.status(200).json(materials);
    } catch (error) {
      res.status(500).json({ message: "获取学习资料列表失败", error });
    }
  }

  async getByIdPublic(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const material = await LearningMaterial.findOne({
        ...idQuery(id),
        status: "published",
      });
      if (!material) {
        res.status(404).json({ message: "学习资料不存在或未上架" });
        return;
      }
      res.status(200).json(material);
    } catch (error) {
      res.status(500).json({ message: "获取学习资料失败", error });
    }
  }

  async getAllAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.query;
      const search = asText(req.query?.search);
      const filter: any =
        status === "draft" || status === "published" ? { status } : {};
      if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [
          { title: pattern },
          { description: pattern },
          { category: pattern },
        ];
      }
      const materials = await LearningMaterial.find(filter).sort({
        updatedAt: -1,
      });
      res.status(200).json(materials);
    } catch (error) {
      res.status(500).json({ message: "获取管理学习资料失败", error });
    }
  }

  async getByIdAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const material = await LearningMaterial.findOne(idQuery(id));
      if (!material) {
        res.status(404).json({ message: "学习资料不存在" });
        return;
      }
      res.status(200).json(material);
    } catch (error) {
      res.status(500).json({ message: "获取学习资料失败", error });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const payload = { ...req.body };
      if (payload.status && !["draft", "published"].includes(payload.status)) {
        res.status(400).json({ message: "无效的状态值" });
        return;
      }
      if (payload.status === "published" && !payload.publishedAt) {
        payload.publishedAt = new Date();
      }
      const material = new LearningMaterial(payload);
      await material.save();
      res.status(201).json(material);
    } catch (error) {
      res.status(400).json({
        message: formatLearningMaterialError(error, "创建学习资料失败"),
      });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const payload = { ...req.body };
      if (payload.status && !["draft", "published"].includes(payload.status)) {
        res.status(400).json({ message: "无效的状态值" });
        return;
      }
      if (payload.status === "published" && !payload.publishedAt) {
        payload.publishedAt = new Date();
      }
      if (payload.status === "draft") {
        payload.publishedAt = null;
      }
      const material = await LearningMaterial.findOneAndUpdate(idQuery(id), payload, {
        new: true,
      });
      if (!material) {
        res.status(404).json({ message: "学习资料不存在" });
        return;
      }
      res.status(200).json(material);
    } catch (error) {
      res.status(400).json({
        message: formatLearningMaterialError(error, "更新学习资料失败"),
      });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (status !== "draft" && status !== "published") {
        res.status(400).json({ message: "状态仅允许 draft 或 published" });
        return;
      }
      const material = await LearningMaterial.findOneAndUpdate(
        idQuery(id),
        statusUpdatePayload(status),
        { new: true }
      );
      if (!material) {
        res.status(404).json({ message: "学习资料不存在" });
        return;
      }
      res.status(200).json(material);
    } catch (error) {
      res.status(400).json({ message: "更新学习资料状态失败", error });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const material = await LearningMaterial.findOneAndDelete(idQuery(id));
      if (!material) {
        res.status(404).json({ message: "学习资料不存在" });
        return;
      }
      res.status(200).json({ message: "学习资料删除成功" });
    } catch (error) {
      res.status(500).json({ message: "删除学习资料失败", error });
    }
  }
}
