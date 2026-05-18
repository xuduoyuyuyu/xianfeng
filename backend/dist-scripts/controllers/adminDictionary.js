"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminDictionaryController = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const EducationDictionaryEntry_1 = __importDefault(require("../models/EducationDictionaryEntry"));
const Program_1 = __importDefault(require("../models/Program"));
const educationDictionary_1 = require("../services/educationDictionary");
function asText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function sanitizeProgramIds(input) {
    if (!Array.isArray(input))
        return [];
    return Array.from(new Set(input
        .map((item) => asText(item))
        .filter((id) => !!id && mongoose_1.default.Types.ObjectId.isValid(id))));
}
class AdminDictionaryController {
    async getAll(req, res) {
        try {
            const search = asText(req.query.search);
            const status = asText(req.query.status);
            const filter = {};
            if (status === "active" || status === "hidden") {
                filter.status = status;
            }
            if (search) {
                const pattern = new RegExp(escapeRegex(search), "i");
                filter.$or = [{ term: pattern }, { definition: pattern }, { aliases: pattern }];
            }
            const entries = await EducationDictionaryEntry_1.default.find(filter).sort({ updatedAt: -1 }).lean();
            const filtered = entries.filter((entry) => (0, educationDictionary_1.isHighQualityEducationTerm)(entry?.term));
            res.status(200).json(filtered.map((entry) => ({
                ...(0, educationDictionary_1.serializeDictionaryEntry)(entry),
                programCount: Array.isArray(entry.programIds) ? entry.programIds.length : 0,
            })));
        }
        catch (error) {
            res.status(500).json({ message: "获取教育词典失败", error });
        }
    }
    async getById(req, res) {
        try {
            const entry = await EducationDictionaryEntry_1.default.findById(req.params.id).lean();
            if (!entry) {
                res.status(404).json({ message: "词条不存在" });
                return;
            }
            const relatedEntries = Array.isArray(entry.relatedEntryIds)
                ? await EducationDictionaryEntry_1.default.find({ _id: { $in: entry.relatedEntryIds } }, { term: 1, status: 1 }).lean()
                : [];
            res.status(200).json({
                ...(0, educationDictionary_1.serializeDictionaryEntry)(entry),
                relatedEntries: relatedEntries.map((item) => ({
                    _id: String(item._id),
                    term: item.term,
                    status: item.status,
                })),
            });
        }
        catch (error) {
            res.status(500).json({ message: "获取词条详情失败", error });
        }
    }
    async create(req, res) {
        try {
            const term = asText(req.body?.term);
            const definition = asText(req.body?.definition);
            const sourceUrl = asText(req.body?.sourceUrl);
            const normalizedTerm = (0, educationDictionary_1.normalizeDictionaryTerm)(term);
            if (!term || !definition || !normalizedTerm) {
                res.status(400).json({ message: "词条名称和释义不能为空" });
                return;
            }
            if (!(0, educationDictionary_1.isHighQualityEducationTerm)(term)) {
                res.status(400).json({ message: "词条不符合教育词典质量规则，请使用教育相关术语" });
                return;
            }
            const existing = await EducationDictionaryEntry_1.default.findOne({ normalizedTerm });
            if (existing) {
                res.status(409).json({ message: "词条已存在" });
                return;
            }
            const requestedProgramIds = sanitizeProgramIds(req.body?.programIds);
            const programs = requestedProgramIds.length
                ? await Program_1.default.find({ _id: { $in: requestedProgramIds } }, { _id: 1 }).lean()
                : [];
            const validProgramIds = programs.map((program) => String(program._id));
            const entry = await EducationDictionaryEntry_1.default.create({
                term,
                normalizedTerm,
                definition,
                sourceUrl,
                aliases: Array.isArray(req.body?.aliases)
                    ? req.body.aliases.map((item) => asText(item)).filter(Boolean)
                    : [],
                relatedEntryIds: [],
                programIds: validProgramIds.map((id) => new mongoose_1.default.Types.ObjectId(id)),
                createdFrom: "migration",
                status: req.body?.status === "hidden" ? "hidden" : "active",
            });
            if (validProgramIds.length > 0) {
                await Program_1.default.updateMany({ _id: { $in: validProgramIds } }, { $addToSet: { dictionaryEntryIds: entry._id } });
            }
            await (0, educationDictionary_1.recalculateAllRelatedDictionaryEntries)();
            res.status(201).json((0, educationDictionary_1.serializeDictionaryEntry)(entry.toObject()));
        }
        catch (error) {
            res.status(400).json({ message: "创建词条失败", error });
        }
    }
    async update(req, res) {
        try {
            const updated = await (0, educationDictionary_1.updateDictionaryEntry)(asText(req.params.id), req.body || {});
            res.status(200).json(updated);
        }
        catch (error) {
            res.status(400).json({ message: error?.message || "更新词条失败", error });
        }
    }
    async updateStatus(req, res) {
        try {
            const status = req.body?.status;
            if (status !== "active" && status !== "hidden") {
                res.status(400).json({ message: "状态仅支持 active 或 hidden" });
                return;
            }
            const updated = await (0, educationDictionary_1.updateDictionaryEntry)(asText(req.params.id), { status });
            res.status(200).json(updated);
        }
        catch (error) {
            res.status(400).json({ message: error?.message || "更新词条状态失败", error });
        }
    }
    async importFromPrograms(req, res) {
        try {
            const programIds = Array.isArray(req.body?.programIds) ? req.body.programIds.map((id) => asText(id)) : [];
            if (!programIds.length) {
                res.status(400).json({ message: "请选择至少一个节目" });
                return;
            }
            const importedPrograms = await (0, educationDictionary_1.importDictionaryEntriesFromPrograms)(programIds);
            res.status(200).json({ importedPrograms });
        }
        catch (error) {
            res.status(500).json({ message: "导入节目词条失败", error });
        }
    }
    async getPrograms(req, res) {
        try {
            const entry = await EducationDictionaryEntry_1.default.findById(req.params.id).lean();
            if (!entry) {
                res.status(404).json({ message: "词条不存在" });
                return;
            }
            const programIds = Array.isArray(entry.programIds) ? entry.programIds.filter((id) => mongoose_1.default.Types.ObjectId.isValid(id)) : [];
            const programs = await Program_1.default.find({ _id: { $in: programIds } }, { title: 1, status: 1, publishedAt: 1, updatedAt: 1, coverImage: 1 })
                .sort({ publishedAt: -1, updatedAt: -1 })
                .lean();
            res.status(200).json(programs.map((program) => ({
                _id: String(program._id),
                title: program.title,
                status: program.status,
                coverImage: program.coverImage || "",
                publishedAt: program.publishedAt || null,
                updatedAt: program.updatedAt || null,
            })));
        }
        catch (error) {
            res.status(500).json({ message: "获取关联节目失败", error });
        }
    }
    async delete(req, res) {
        try {
            const id = req.params.id;
            if (!id || !mongoose_1.default.Types.ObjectId.isValid(id)) {
                res.status(400).json({ message: "无效的ID" });
                return;
            }
            const entry = await EducationDictionaryEntry_1.default.findById(new mongoose_1.default.Types.ObjectId(id));
            if (!entry) {
                res.status(404).json({ message: "词条不存在" });
                return;
            }
            // 解除与节目的关联
            if (Array.isArray(entry.programIds) && entry.programIds.length > 0) {
                await Program_1.default.updateMany({ _id: { $in: entry.programIds } }, { $pull: { dictionaryEntryIds: entry._id } });
            }
            await EducationDictionaryEntry_1.default.findByIdAndDelete(new mongoose_1.default.Types.ObjectId(id));
            res.status(200).json({ message: "删除成功" });
        }
        catch (error) {
            res.status(500).json({ message: "删除失败", error });
        }
    }
    async bulkDelete(req, res) {
        try {
            const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
            if (!ids.length) {
                res.status(400).json({ message: "请选择要删除的词条" });
                return;
            }
            const validIds = ids.filter((id) => mongoose_1.default.Types.ObjectId.isValid(id));
            if (!validIds.length) {
                res.status(400).json({ message: "没有有效的ID" });
                return;
            }
            const oids = validIds.map((id) => new mongoose_1.default.Types.ObjectId(id));
            const entries = await EducationDictionaryEntry_1.default.find({ _id: { $in: oids } });
            // 解除所有关联节目的绑定
            for (const entry of entries) {
                if (Array.isArray(entry.programIds) && entry.programIds.length > 0) {
                    await Program_1.default.updateMany({ _id: { $in: entry.programIds } }, { $pull: { dictionaryEntryIds: entry._id } });
                }
            }
            await EducationDictionaryEntry_1.default.deleteMany({ _id: { $in: oids } });
            res.status(200).json({ message: `已删除 ${validIds.length} 个词条` });
        }
        catch (error) {
            res.status(500).json({ message: "批量删除失败", error });
        }
    }
}
exports.AdminDictionaryController = AdminDictionaryController;
