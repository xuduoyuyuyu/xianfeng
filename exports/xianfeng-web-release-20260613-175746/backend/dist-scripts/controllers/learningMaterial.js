"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearningMaterialController = void 0;
const LearningMaterial_1 = __importDefault(require("../models/LearningMaterial"));
function statusUpdatePayload(status) {
    if (status === "published") {
        return { status, publishedAt: new Date() };
    }
    return { status, publishedAt: null };
}
class LearningMaterialController {
    async getAllPublic(_req, res) {
        try {
            const materials = await LearningMaterial_1.default.find({ status: "published" }).sort({
                publishedAt: -1,
            });
            res.status(200).json(materials);
        }
        catch (error) {
            res.status(500).json({ message: "获取学习资料列表失败", error });
        }
    }
    async getByIdPublic(req, res) {
        try {
            const { id } = req.params;
            const material = await LearningMaterial_1.default.findOne({
                _id: id,
                status: "published",
            });
            if (!material) {
                res.status(404).json({ message: "学习资料不存在或未上架" });
                return;
            }
            res.status(200).json(material);
        }
        catch (error) {
            res.status(500).json({ message: "获取学习资料失败", error });
        }
    }
    async getAllAdmin(req, res) {
        try {
            const { status } = req.query;
            const filter = status === "draft" || status === "published" ? { status } : {};
            const materials = await LearningMaterial_1.default.find(filter).sort({
                updatedAt: -1,
            });
            res.status(200).json(materials);
        }
        catch (error) {
            res.status(500).json({ message: "获取管理学习资料失败", error });
        }
    }
    async getByIdAdmin(req, res) {
        try {
            const { id } = req.params;
            const material = await LearningMaterial_1.default.findById(id);
            if (!material) {
                res.status(404).json({ message: "学习资料不存在" });
                return;
            }
            res.status(200).json(material);
        }
        catch (error) {
            res.status(500).json({ message: "获取学习资料失败", error });
        }
    }
    async create(req, res) {
        try {
            const payload = req.body;
            if (payload.status && !["draft", "published"].includes(payload.status)) {
                res.status(400).json({ message: "无效的状态值" });
                return;
            }
            if (payload.status === "published" && !payload.publishedAt) {
                payload.publishedAt = new Date();
            }
            const material = new LearningMaterial_1.default(payload);
            await material.save();
            res.status(201).json(material);
        }
        catch (error) {
            res.status(400).json({ message: "创建学习资料失败", error });
        }
    }
    async update(req, res) {
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
            const material = await LearningMaterial_1.default.findByIdAndUpdate(id, payload, {
                new: true,
            });
            if (!material) {
                res.status(404).json({ message: "学习资料不存在" });
                return;
            }
            res.status(200).json(material);
        }
        catch (error) {
            res.status(400).json({ message: "更新学习资料失败", error });
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
            const material = await LearningMaterial_1.default.findByIdAndUpdate(id, statusUpdatePayload(status), { new: true });
            if (!material) {
                res.status(404).json({ message: "学习资料不存在" });
                return;
            }
            res.status(200).json(material);
        }
        catch (error) {
            res.status(400).json({ message: "更新学习资料状态失败", error });
        }
    }
    async delete(req, res) {
        try {
            const { id } = req.params;
            const material = await LearningMaterial_1.default.findByIdAndDelete(id);
            if (!material) {
                res.status(404).json({ message: "学习资料不存在" });
                return;
            }
            res.status(200).json({ message: "学习资料删除成功" });
        }
        catch (error) {
            res.status(500).json({ message: "删除学习资料失败", error });
        }
    }
}
exports.LearningMaterialController = LearningMaterialController;
