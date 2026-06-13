"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInboxMessage = createInboxMessage;
exports.normalizeInboxMessage = normalizeInboxMessage;
const mongoose_1 = __importDefault(require("mongoose"));
const AdminInboxMessage_1 = __importDefault(require("../models/AdminInboxMessage"));
const Program_1 = __importDefault(require("../models/Program"));
const Guest_1 = __importDefault(require("../models/Guest"));
function asText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function clipText(value, max = 300) {
    const text = asText(value);
    if (text.length <= max)
        return text;
    return `${text.slice(0, max).trim()}...`;
}
function taskTypeLabel(taskType) {
    if (taskType === "proofread_transcript")
        return "文稿校对";
    if (taskType === "enrich_program_content")
        return "节目资料收集";
    if (taskType === "enrich_guest_profile")
        return "嘉宾资料收集";
    if (taskType === "generate_program_artwork")
        return "节目配图生成";
    return "节目解析";
}
function taskStatusLabel(taskStatus) {
    if (taskStatus === "succeeded")
        return "已完成";
    if (taskStatus === "failed")
        return "失败";
    return "已取消";
}
async function resolveTargetTitle(targetType, targetId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(targetId))
        return "";
    const oid = new mongoose_1.default.Types.ObjectId(targetId);
    if (targetType === "program") {
        const row = await Program_1.default.findById(oid, { title: 1, programCode: 1 }).lean();
        return asText(row?.title) || asText(row?.programCode);
    }
    const guest = await Guest_1.default.findById(oid, { name: 1 }).lean();
    return asText(guest?.name);
}
async function createInboxMessage(input) {
    const sourceId = asText(input.sourceId);
    if (!sourceId)
        return null;
    if (!mongoose_1.default.Types.ObjectId.isValid(input.targetId))
        return null;
    const targetTitle = await resolveTargetTitle(input.targetType, input.targetId);
    const title = `${taskTypeLabel(input.taskType)} · ${taskStatusLabel(input.taskStatus)}${targetTitle ? ` · ${targetTitle}` : ""}`;
    const summary = clipText(input.summary || "", 320);
    const doc = await AdminInboxMessage_1.default.findOneAndUpdate({
        sourceType: input.sourceType,
        sourceId,
        taskStatus: input.taskStatus,
    }, {
        $setOnInsert: {
            sourceType: input.sourceType,
            sourceId,
            taskType: input.taskType,
            taskStatus: input.taskStatus,
            targetType: input.targetType,
            targetId: new mongoose_1.default.Types.ObjectId(input.targetId),
            targetTitle,
            title,
            summary,
            payload: input.payload || {},
            isRead: false,
            readAt: null,
        },
    }, { upsert: true, new: true }).lean();
    return doc;
}
function normalizeInboxMessage(row) {
    if (!row)
        return null;
    return {
        _id: String(row._id),
        sourceType: row.sourceType,
        sourceId: asText(row.sourceId),
        taskType: row.taskType,
        taskStatus: row.taskStatus,
        targetType: row.targetType,
        targetId: String(row.targetId),
        targetTitle: asText(row.targetTitle),
        title: asText(row.title),
        summary: asText(row.summary),
        payload: row.payload || {},
        isRead: !!row.isRead,
        readAt: row.readAt || null,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
    };
}
