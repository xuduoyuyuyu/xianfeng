"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const topicLayerNodeSchema = new mongoose_1.default.Schema({
    key: { type: String, default: "" },
    title: { type: String, default: "" },
    summary: { type: String, default: "" },
    content: { type: String, default: "" },
    icon: { type: String, default: "" },
}, { _id: false });
const topicLayersSchema = new mongoose_1.default.Schema({
    layer1: { type: [topicLayerNodeSchema], default: [] },
    layer2: { type: [topicLayerNodeSchema], default: [] },
    layer3: { type: [topicLayerNodeSchema], default: [] },
    layer4: { type: [topicLayerNodeSchema], default: [] },
    layer5: { type: [topicLayerNodeSchema], default: [] },
}, { _id: false });
const topicSchema = new mongoose_1.default.Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
    },
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    description: { type: String, default: "" },
    coverEmoji: { type: String, default: "📚" },
    shortSummary: { type: String, default: "" },
    tags: { type: [String], default: [] },
    viewCount: { type: Number, default: 0 },
    questionCount: { type: Number, default: 0 },
    status: {
        type: String,
        default: "pending",
        enum: ["pending", "published", "hidden"],
    },
    source: {
        type: String,
        default: "system",
        enum: ["system", "ai", "user"],
    },
    createdBy: { type: String, default: "" },
    layers: {
        type: topicLayersSchema,
        default: () => ({
            layer1: [],
            layer2: [],
            layer3: [],
            layer4: [],
            layer5: [],
        }),
    },
    generatingProgress: {
        type: {
            total: Number,
            done: Number,
            status: String, // pending | generating | done | error
        },
        default: undefined,
    },
    hiddenForUsers: { type: [String], default: [] },
}, { timestamps: true });
topicSchema.index({ tags: 1 });
topicSchema.index({ status: 1, createdAt: -1 });
// 自动从 title 生成 slug
topicSchema.pre("validate", function () {
    if (!this.slug && this.title) {
        this.slug =
            this.title
                .replace(/[^\w\u4e00-\u9fff]+/g, "-")
                .replace(/^-|-$/g, "")
                .toLowerCase()
                .slice(0, 80) || `topic-${Date.now()}`;
    }
});
exports.default = mongoose_1.default.model("Topic", topicSchema);
