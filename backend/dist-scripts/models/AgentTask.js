"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const agentTaskSchema = new mongoose_1.default.Schema({
    taskType: {
        type: String,
        enum: ["proofread_transcript", "enrich_program_content", "enrich_guest_profile", "generate_program_artwork"],
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
    status: {
        type: String,
        enum: ["queued", "running", "succeeded", "failed", "canceled"],
        default: "queued",
        index: true,
    },
    options: {
        type: mongoose_1.default.Schema.Types.Mixed,
        default: {},
    },
    retries: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 2 },
    progress: { type: Number, default: 0 },
    stage: { type: String, default: "queued" },
    createdBy: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    outputSummary: { type: String, default: "" },
    output: {
        type: mongoose_1.default.Schema.Types.Mixed,
        default: {},
    },
    lockToken: { type: String, default: "" },
}, { timestamps: true });
agentTaskSchema.index({ targetType: 1, targetId: 1, taskType: 1, createdAt: -1 });
const AgentTaskModel = mongoose_1.default.model("AgentTask", agentTaskSchema);
exports.default = AgentTaskModel;
