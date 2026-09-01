import mongoose from "mongoose";

interface ExternalBookSearchDocument extends mongoose.Document {
  externalBookId: string;
  title: string;
  author: string;
  publisher: string;
  tags: string;
  category: string;
  series: string;
  record: Record<string, any>;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const externalBookSearchDocumentSchema = new mongoose.Schema(
  {
    externalBookId: { type: String, required: true, unique: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    author: { type: String, default: "", trim: true },
    publisher: { type: String, default: "", trim: true },
    tags: { type: String, default: "", trim: true },
    category: { type: String, default: "", trim: true },
    series: { type: String, default: "", trim: true },
    record: { type: mongoose.Schema.Types.Mixed, required: true },
    syncedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

externalBookSearchDocumentSchema.index(
  { title: "text", author: "text", publisher: "text", tags: "text", category: "text", series: "text" } as any,
  {
    name: "external_book_search_text",
    weights: { title: 10, author: 4, series: 3, tags: 2, category: 1, publisher: 1 },
    default_language: "english",
  }
);

const ExternalBookSearchDocument = mongoose.model<ExternalBookSearchDocument>(
  "ExternalBookSearchDocument",
  externalBookSearchDocumentSchema
);

export default ExternalBookSearchDocument;
export { ExternalBookSearchDocument };
