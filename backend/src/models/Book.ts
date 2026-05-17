import mongoose from "mongoose";

type ContentStatus = "draft" | "published";

interface Book extends mongoose.Document {
  title: string;
  categoryLabel: string;
  topic: string;
  author: string;
  translator: string;
  publisher: string;
  grade: string;
  coverImage: string;
  recommendedGuest: string;
  sourceName?: string;
  sourceGuestId?: mongoose.Types.ObjectId | null;
  status: ContentStatus;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true },
    categoryLabel: { type: String, default: "", trim: true },
    topic: { type: String, default: "", trim: true },
    author: { type: String, default: "", trim: true },
    translator: { type: String, default: "", trim: true },
    publisher: { type: String, default: "", trim: true },
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
    wxSyncAt: { type: Date, default: null },
    sourceName: { type: String, default: "" },
    sourceGuestId: { type: mongoose.Schema.Types.ObjectId, ref: "Guest", default: null, index: true },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Book = mongoose.model<Book>("Book", bookSchema);

export default Book;
export { Book, ContentStatus };
