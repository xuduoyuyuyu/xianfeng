import mongoose from "mongoose";

export const SEARCH_RESULT_TYPES = ["programs", "books", "materials", "topics", "experts"] as const;
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export interface SearchResultCounts {
  programs: number;
  books: number;
  materials: number;
  topics: number;
  experts: number;
}

export interface SearchAnalyticsEvent extends mongoose.Document {
  clientEventId: string;
  sessionHash: string;
  query: string;
  normalizedQuery: string;
  source: "mini-program";
  resultCounts: SearchResultCounts;
  totalResults: number;
  clickedType?: SearchResultType | "";
  clickedResultId?: string;
  clickedAt?: Date | null;
  searchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const resultCountsSchema = new mongoose.Schema(
  {
    programs: { type: Number, default: 0, min: 0 },
    books: { type: Number, default: 0, min: 0 },
    materials: { type: Number, default: 0, min: 0 },
    topics: { type: Number, default: 0, min: 0 },
    experts: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const searchAnalyticsEventSchema = new mongoose.Schema(
  {
    clientEventId: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    sessionHash: { type: String, required: true, trim: true, maxlength: 64, index: true },
    query: { type: String, required: true, trim: true, maxlength: 120 },
    normalizedQuery: { type: String, required: true, trim: true, maxlength: 120, index: true },
    source: { type: String, enum: ["mini-program"], default: "mini-program", index: true },
    resultCounts: { type: resultCountsSchema, default: () => ({}) },
    totalResults: { type: Number, default: 0, min: 0 },
    clickedType: { type: String, enum: ["", ...SEARCH_RESULT_TYPES], default: "", index: true },
    clickedResultId: { type: String, default: "", trim: true, maxlength: 180 },
    clickedAt: { type: Date, default: null, index: true },
    searchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

searchAnalyticsEventSchema.index({ normalizedQuery: 1, searchedAt: -1 });
searchAnalyticsEventSchema.index({ searchedAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

const SearchAnalyticsEventModel = mongoose.model<SearchAnalyticsEvent>(
  "SearchAnalyticsEvent",
  searchAnalyticsEventSchema
);

export default SearchAnalyticsEventModel;
