"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const adminInboxMessageSchema = new mongoose_1.default.Schema({
    sourceType: {
        type: String,
        enum: ["agent_task", "program_parse_task"],
        required: true,
        index: true,
    },
    sourceId: {
        type: String,
        required: true,
        index: true,
    },
    taskType: {
        type: String,
        enum: ["proofread_transcript", "enrich_program_content", "enrich_guest_profile", "generate_program_artwork", "program_parse"],
        required: true,
        index: true,
    },
    taskStatus: {
        type: String,
        enum: ["succeeded", "failed", "canceled"],
        required: true,
        index: true,
    },
    targetType: {
        type: String,
        enum: ["program", "guest"],
        required: true,
        index: true,
    },
    targetId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    targetTitle: { type: String, default: "" },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    payload: { type: mongoose_1.default.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
}, { timestamps: true, collection: "admin_inbox_messages" });
adminInboxMessageSchema.index({ sourceType: 1, sourceId: 1, taskStatus: 1 }, { unique: true });
adminInboxMessageSchema.index({ createdAt: -1 });
const AdminInboxMessageModel = mongoose_1.default.model("AdminInboxMessage", adminInboxMessageSchema);
exports.default = AdminInboxMessageModel;
