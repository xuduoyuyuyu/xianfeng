"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const guestSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, index: true, unique: true },
    title: { type: String, default: "", trim: true },
    bio: { type: String, default: "", trim: true },
    avatar: { type: String, default: "", trim: true },
    profileUrl: { type: String, default: "", trim: true },
    profileMarkdown: { type: String, default: "", trim: true },
    profileReferences: [
        {
            title: { type: String, default: "", trim: true },
            url: { type: String, default: "", trim: true },
            note: { type: String, default: "", trim: true },
        },
    ],
    socialProfiles: [
        {
            platform: { type: String, default: "", trim: true },
            label: { type: String, default: "", trim: true },
            url: { type: String, default: "", trim: true },
            note: { type: String, default: "", trim: true },
            order: { type: Number, default: 0 },
            status: {
                type: String,
                enum: ["active", "inactive"],
                default: "active",
            },
        },
    ],
    publications: [
        {
            type: {
                type: String,
                enum: ["paper", "book", "interview", "media", "other"],
                default: "other",
            },
            title: { type: String, default: "", trim: true },
            url: { type: String, default: "", trim: true },
            source: { type: String, default: "", trim: true },
            publishedAt: { type: String, default: "", trim: true },
            summary: { type: String, default: "", trim: true },
            note: { type: String, default: "", trim: true },
            order: { type: Number, default: 0 },
            status: {
                type: String,
                enum: ["active", "inactive"],
                default: "active",
            },
        },
    ],
    profileAvatarCandidates: [
        {
            url: { type: String, default: "", trim: true },
            label: { type: String, default: "", trim: true },
            sourceUrl: { type: String, default: "", trim: true },
        },
    ],
    profileGeneratedAt: { type: Date, default: null },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active",
        index: true,
    },
    returnWishCount: { type: Number, default: 0 },
}, { timestamps: true });
guestSchema.index({ name: 1 });
const GuestModel = mongoose_1.default.model("Guest", guestSchema);
exports.default = GuestModel;
