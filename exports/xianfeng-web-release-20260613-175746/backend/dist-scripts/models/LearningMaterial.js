"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearningMaterial = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const learningMaterialSchema = new mongoose_1.default.Schema({
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    fileUrl: { type: String, required: true },
    category: { type: String, required: true },
    status: {
        type: String,
        enum: ["draft", "published"],
        default: "draft",
        index: true,
    },
    publishedAt: { type: Date, default: null },
}, { timestamps: true });
const LearningMaterial = mongoose_1.default.model("LearningMaterial", learningMaterialSchema);
exports.LearningMaterial = LearningMaterial;
exports.default = LearningMaterial;
