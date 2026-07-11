import mongoose from "mongoose";

import BookMetadataModel from "../models/BookMetadata";
import type { BookMetadataStatus } from "../models/BookMetadata";
import type { SampleMatchResult } from "../utils/bookMetadataSampleExport";

const AUTO_APPROVE_THRESHOLD = Number(process.env.BOOK_METADATA_AUTO_APPROVE_THRESHOLD || 0.85);

type ExistingBookMetadataState = {
  status?: BookMetadataStatus | string;
  reviewedAt?: Date | string | null;
} | null;

type BookMetadataPayload = {
  bookId: string;
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  cover: string;
  description: string;
  source: string;
  sourceId: string;
  rating: number | null;
  ratingCount: number | null;
  ratingLabel: string;
  matchScore: number;
  matchReason: string[];
  status: BookMetadataStatus;
  rawCandidate: Record<string, any> | null;
};

type ManualBookMetadataPayload = Partial<BookMetadataPayload> & {
  status?: BookMetadataStatus;
  reviewNote?: string;
};

function cleanText(value: unknown): string {
  return String(value || "").trim();
}

export function getMetadataStatusForScore(score: number, threshold = AUTO_APPROVE_THRESHOLD): BookMetadataStatus {
  return Number(score || 0) >= threshold ? "auto_approved" : "needs_review";
}

export function shouldProtectExistingBookMetadata(existing: ExistingBookMetadataState): boolean {
  if (!existing) return false;
  if (existing.reviewedAt) return true;
  return existing.status === "needs_review" || existing.status === "rejected";
}

export function buildBookMetadataPayload(match: SampleMatchResult, threshold = AUTO_APPROVE_THRESHOLD): BookMetadataPayload {
  const best = match.bestMatch;
  const score = Number(best?.matchScore || 0);
  return {
    bookId: cleanText(match.sourceBook?._id),
    title: cleanText(best?.title || match.sourceBook?.title),
    author: cleanText(best?.author || match.sourceBook?.author),
    publisher: cleanText(best?.publisher || match.sourceBook?.publisher),
    isbn: cleanText(best?.isbn),
    cover: cleanText(best?.cover || match.sourceBook?.coverImage),
    description: cleanText(best?.description),
    source: cleanText(best?.source),
    sourceId: cleanText(best?.sourceId),
    rating: typeof best?.rating === "number" ? best.rating : null,
    ratingCount: typeof best?.ratingCount === "number" ? best.ratingCount : null,
    ratingLabel: cleanText(best?.ratingLabel),
    matchScore: score,
    matchReason: Array.isArray(best?.matchReason) ? best.matchReason : [],
    status: getMetadataStatusForScore(score, threshold),
    rawCandidate: best ? { ...best } : null,
  };
}

export async function upsertBookMetadataFromMatch(match: SampleMatchResult, threshold = AUTO_APPROVE_THRESHOLD) {
  const payload = buildBookMetadataPayload(match, threshold);
  if (!payload.bookId || !mongoose.Types.ObjectId.isValid(payload.bookId)) {
    return { skipped: true, reason: "invalid_book_id", metadata: null };
  }

  const existing = await BookMetadataModel.findOne({ bookId: payload.bookId });
  if (shouldProtectExistingBookMetadata(existing as ExistingBookMetadataState)) {
    return { skipped: true, reason: "protected_existing_metadata", metadata: existing };
  }

  const metadata = await BookMetadataModel.findOneAndUpdate(
    { bookId: payload.bookId },
    {
      $set: {
        ...payload,
        bookId: new mongoose.Types.ObjectId(payload.bookId),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return { skipped: false, reason: "", metadata };
}

export async function findApprovedBookMetadataByBookId(bookId: string) {
  if (!mongoose.Types.ObjectId.isValid(bookId)) return null;
  return BookMetadataModel.findOne({ bookId, status: "auto_approved" }).lean();
}

export async function listApprovedBookMetadataByBookIds(bookIds: string[]) {
  const validIds = bookIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return [];
  return BookMetadataModel.find({ bookId: { $in: validIds }, status: "auto_approved" }).lean();
}

export async function listApprovedBookMetadataBookIds() {
  const bookIds = await BookMetadataModel.distinct("bookId", { status: "auto_approved" });
  return bookIds
    .map((bookId) => String(bookId || ""))
    .filter((bookId) => mongoose.Types.ObjectId.isValid(bookId));
}

export async function listBookMetadataByBookIds(bookIds: string[]) {
  const validIds = bookIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return [];
  return BookMetadataModel.find({ bookId: { $in: validIds } }).lean();
}

export async function listBookMetadataForReview(status?: string) {
  const filter = status && ["auto_approved", "needs_review", "rejected"].includes(status) ? { status } : {};
  return BookMetadataModel.find(filter).populate("bookId", "title author publisher coverImage").sort({ updatedAt: -1 }).lean();
}

function buildManualMetadataSetPayload(payload: ManualBookMetadataPayload, defaultStatus?: BookMetadataStatus) {
  const allowed: BookMetadataStatus[] = ["auto_approved", "needs_review", "rejected"];
  const status = payload.status && allowed.includes(payload.status) ? payload.status : defaultStatus;
  const setPayload: Record<string, any> = {};
  for (const key of ["title", "author", "publisher", "isbn", "cover", "description", "source", "sourceId", "ratingLabel", "reviewNote"] as const) {
    if (payload[key] !== undefined) setPayload[key] = cleanText(payload[key]);
  }
  for (const key of ["rating", "ratingCount", "matchScore"] as const) {
    if (payload[key] !== undefined) setPayload[key] = payload[key] === null ? null : Number(payload[key]);
  }
  if (status) setPayload.status = status;
  setPayload.reviewedAt = new Date();
  return setPayload;
}

export async function upsertBookMetadataManually(bookId: string, payload: ManualBookMetadataPayload) {
  if (!mongoose.Types.ObjectId.isValid(bookId)) return null;
  return BookMetadataModel.findOneAndUpdate(
    { bookId: new mongoose.Types.ObjectId(bookId) },
    {
      $set: buildManualMetadataSetPayload(payload, "auto_approved"),
      $setOnInsert: {
        matchScore: 0,
        matchReason: [],
        rawCandidate: null,
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  );
}

export async function reviewBookMetadata(
  id: string,
  payload: ManualBookMetadataPayload
) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return BookMetadataModel.findByIdAndUpdate(
    id,
    { $set: buildManualMetadataSetPayload(payload) },
    { returnDocument: "after", runValidators: true }
  );
}
