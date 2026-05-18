"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserPageVisit = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const userPageVisitSchema = new mongoose_1.default.Schema({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    sessionId: { type: String, required: true, trim: true, index: true },
    pagePath: { type: String, required: true, trim: true, index: true },
    pageTitle: { type: String, default: "", trim: true },
    deviceType: {
        type: String,
        enum: ["desktop", "mobile", "tablet", "bot", "other"],
        default: "other",
        index: true,
    },
    visitedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });
userPageVisitSchema.index({ sessionId: 1, pagePath: 1, visitedAt: -1 });
const UserPageVisit = mongoose_1.default.model("UserPageVisit", userPageVisitSchema);
exports.UserPageVisit = UserPageVisit;
exports.default = UserPageVisit;
