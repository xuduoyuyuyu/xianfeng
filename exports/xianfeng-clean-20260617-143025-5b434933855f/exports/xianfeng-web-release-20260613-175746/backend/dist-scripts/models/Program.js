"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Program = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const programSchema = new mongoose_1.default.Schema({
    programCode: {
        type: String,
        default: "",
        trim: true,
        lowercase: true,
        unique: true,
        sparse: true,
        index: true,
    },
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    episodes: [
        {
            title: { type: String, required: true },
            duration: { type: String, required: true },
            url: { type: String, required: true },
        },
    ],
    summary: {
        headline: { type: String, default: "" },
        body: { type: String, default: "" },
        highlightLabel: { type: String, default: "" },
        highlightText: { type: String, default: "" },
        tags: [{ type: String }],
    },
    transcript: [
        {
            time: { type: String, required: true },
            speaker: { type: String, required: true },
            text: { type: String, required: true },
            featured: { type: Boolean, default: false },
        },
    ],
    termGlossary: [
        {
            term: { type: String, required: true },
            definition: { type: String, required: true },
            sourceUrl: { type: String, default: "" },
            aliases: [{ type: String }],
        },
    ],
    dictionaryEntryIds: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "EducationDictionaryEntry",
        },
    ],
    guestBindings: [
        {
            guestId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Guest", required: true },
            order: { type: Number, default: 1 },
            role: { type: String, default: "main_guest" },
        },
    ],
    guest: {
        name: { type: String, default: "" },
        title: { type: String, default: "" },
        bio: { type: String, default: "" },
        avatar: { type: String, default: "" },
        profileUrl: { type: String, default: "" },
    },
    deepDive: {
        sectionTitle: { type: String, default: "" },
        curatedReading: [
            {
                title: { type: String, required: true },
                subtitle: { type: String, default: "" },
                url: { type: String, default: "" },
            },
        ],
    },
    contentPack: {
        quickView: [
            {
                startTime: { type: String, default: "" },
                endTime: { type: String, default: "" },
                timeRangeLabel: { type: String, default: "" },
                summary: { type: String, default: "" },
            },
        ],
        minutes: {
            text: { type: String, default: "" },
        },
        showNotes: {
            guide: { type: String, default: "" },
            guestIntro: { type: String, default: "" },
            keyMoments: [
                {
                    time: { type: String, default: "" },
                    point: { type: String, default: "" },
                },
            ],
            renderedText: { type: String, default: "" },
            templateOverride: { type: String, default: "" },
        },
    },
    agentOutputs: {
        proofread: {
            taskId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "AgentTask", default: null },
            generatedAt: { type: Date, default: null },
            correctedTranscript: [
                {
                    time: { type: String, required: true },
                    speaker: { type: String, required: true },
                    text: { type: String, required: true },
                    featured: { type: Boolean, default: false },
                },
            ],
            report: {
                typoCount: { type: Number, default: 0 },
                punctuationChanges: { type: Number, default: 0 },
                terminologyWarnings: { type: Number, default: 0 },
                summary: { type: String, default: "" },
            },
            acceptedAt: { type: Date, default: null },
            acceptedBy: { type: String, default: "" },
        },
        enrichment: {
            taskId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "AgentTask", default: null },
            generatedAt: { type: Date, default: null },
            forceOverwrite: { type: Boolean, default: false },
            suggestedGlossary: [
                {
                    term: { type: String, required: true },
                    definition: { type: String, required: true },
                    sourceUrl: { type: String, default: "" },
                    aliases: [{ type: String }],
                },
            ],
            suggestedReadings: [
                {
                    title: { type: String, required: true },
                    subtitle: { type: String, default: "" },
                    url: { type: String, default: "" },
                },
            ],
        },
    },
    status: {
        type: String,
        enum: ["draft", "published", "group-only"],
        default: "draft",
        index: true,
    },
    publishedAt: { type: Date, default: null },
    parseStatus: {
        type: String,
        enum: ["idle", "parsing", "success", "failed"],
        default: "idle",
        index: true,
    },
    parseStage: { type: String, default: "idle" },
    parseProgress: { type: Number, default: 0 },
    parseStartedAt: { type: Date, default: null },
    parseFinishedAt: { type: Date, default: null },
    parseError: { type: String, default: "" },
}, { timestamps: true });
const Program = mongoose_1.default.model("Program", programSchema);
exports.Program = Program;
exports.default = Program;
