import { Request, Response } from "express";
import LearningMaterial from "../models/LearningMaterial";

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
        _id: id,
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
      const filter =
        status === "draft" || status === "published" ? { status } : {};
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
      const material = await LearningMaterial.findById(id);
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
      const payload = req.body;
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
      res.status(400).json({ message: "创建学习资料失败", error });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const payload = req.body;
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
      const material = await LearningMaterial.findByIdAndUpdate(id, payload, {
        new: true,
      });
      if (!material) {
        res.status(404).json({ message: "学习资料不存在" });
        return;
      }
      res.status(200).json(material);
    } catch (error) {
      res.status(400).json({ message: "更新学习资料失败", error });
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
      const material = await LearningMaterial.findByIdAndUpdate(
        id,
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
      const material = await LearningMaterial.findByIdAndDelete(id);
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
