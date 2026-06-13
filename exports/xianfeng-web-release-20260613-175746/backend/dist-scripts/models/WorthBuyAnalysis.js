"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const worthBuySchema = new mongoose_1.default.Schema({
    brand: { type: String, required: true, unique: true, index: true, trim: true },
    query: { type: String, default: "" },
    submittedBy: { type: String, default: "" },
    status: { type: String, default: "draft", enum: ["draft", "published", "hidden"] },
    result: { type: mongoose_1.default.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
exports.default = mongoose_1.default.model("WorthBuyAnalysis", worthBuySchema);
