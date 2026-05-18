"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EducationDictionaryEntry = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const educationDictionaryEntrySchema = new mongoose_1.default.Schema({
    term: { type: String, required: true, trim: true },
    normalizedTerm: { type: String, required: true, unique: true, index: true, trim: true },
    definition: { type: String, required: true, trim: true },
    sourceUrl: { type: String, default: "" },
    aliases: [{ type: String, trim: true }],
    relatedEntryIds: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "EducationDictionaryEntry",
        },
    ],
    programIds: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "Program",
        },
    ],
    createdFrom: {
        type: String,
        enum: ["ai_program", "migration"],
        default: "ai_program",
    },
    status: {
        type: String,
        enum: ["active", "hidden"],
        default: "active",
        index: true,
    },
}, { timestamps: true });
const EducationDictionaryEntry = mongoose_1.default.model("EducationDictionaryEntry", educationDictionaryEntrySchema);
exports.EducationDictionaryEntry = EducationDictionaryEntry;
exports.default = EducationDictionaryEntry;
