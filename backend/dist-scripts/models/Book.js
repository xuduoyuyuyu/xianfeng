"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Book = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const bookSchema = new mongoose_1.default.Schema({
    title: { type: String, required: true, unique: true },
    categoryLabel: { type: String, default: "", trim: true },
    topic: { type: String, default: "", trim: true },
    author: { type: String, default: "", trim: true },
    translator: { type: String, default: "", trim: true },
    publisher: { type: String, default: "", trim: true },
    isbn: { type: String, default: "", trim: true },
    publishedDate: { type: String, default: "", trim: true },
    grade: { type: String, default: "", trim: true },
    coverImage: { type: String, required: true },
    recommendedGuest: { type: String, default: "", trim: true },
    // 微信小店字段
    wxProductId: { type: String, default: "" },
    wxShopName: { type: String, default: "" },
    wxShopAppid: { type: String, default: "" },
    wxSalePrice: { type: Number, default: 0 },
    wxMonthlySales: { type: Number, default: 0 },
    wxShopScore: { type: Number, default: 0 },
    wxHeadImgs: { type: [String], default: [] },
    wxQrcodeUrl: { type: String, default: "" },
    wxSyncAt: { type: Date, default: null },
    sourceName: { type: String, default: "" },
    sourceGuestId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Guest", default: null, index: true },
    status: {
        type: String,
        enum: ["draft", "published"],
        default: "draft",
        index: true,
    },
    publishedAt: { type: Date, default: null },
}, { timestamps: true });
const Book = mongoose_1.default.model("Book", bookSchema);
exports.Book = Book;
exports.default = Book;
