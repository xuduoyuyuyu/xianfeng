import mongoose from "mongoose";

type BookMetadataStatus = "auto_approved" | "needs_review" | "rejected";

interface BookMetadata extends mongoose.Document {
  bookId: mongoose.Types.ObjectId;
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  cover: string;
  description: string;
  source: string;
  sourceId: string;
  rating?: number | null;
  ratingCount?: number | null;
  ratingLabel: string;
  matchScore: number;
  matchReason: string[];
  status: BookMetadataStatus;
  reviewedAt?: Date | null;
  reviewNote: string;
  rawCandidate?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const bookMetadataSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true, unique: true, index: true },
    title: { type: String, default: "", trim: true },
    author: { type: String, default: "", trim: true },
    publisher: { type: String, default: "", trim: true },
    isbn: { type: String, default: "", trim: true },
    cover: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    source: { type: String, default: "", trim: true, index: true },
    sourceId: { type: String, default: "", trim: true },
    rating: { type: Number, default: null },
    ratingCount: { type: Number, default: null },
    ratingLabel: { type: String, default: "", trim: true },
    matchScore: { type: Number, default: 0, index: true },
    matchReason: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["auto_approved", "needs_review", "rejected"],
      default: "needs_review",
      index: true,
    },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "", trim: true },
    rawCandidate: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

bookMetadataSchema.index({ status: 1, updatedAt: -1 });
bookMetadataSchema.index({ source: 1, sourceId: 1 });

const BookMetadata = mongoose.model<BookMetadata>("BookMetadata", bookMetadataSchema);

export default BookMetadata;
export { BookMetadata, BookMetadataStatus };
