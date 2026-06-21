import mongoose from "mongoose";
import type {
  KnowledgeSourceKind,
  KnowledgeSourceParseStatus,
  KnowledgeSourceStatus,
  KnowledgeSourceSyncStatus,
} from "../models/KnowledgeSource";

type UploadedKnowledgeFile = {
  originalname?: string;
  mimetype?: string;
  buffer?: Buffer;
  url?: string;
};

type KnowledgeSourcePayloadInput = {
  guestId?: unknown;
  ownerType?: unknown;
  ownerId?: unknown;
  sourceKind?: unknown;
  title?: unknown;
  summary?: unknown;
  rawText?: unknown;
  fileUrl?: unknown;
  status?: unknown;
};

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json"]);
const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_TYPES = new Set(["application/json"]);

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown): KnowledgeSourceStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizeSourceKind(value: unknown, file?: UploadedKnowledgeFile): KnowledgeSourceKind {
  const text = asText(value);
  if (
    text === "manual_note" ||
    text === "uploaded_file" ||
    text === "learning_material" ||
    text === "external_url" ||
    text === "guest_profile" ||
    text === "program_content"
  ) {
    return text;
  }
  return file ? "uploaded_file" : "manual_note";
}

function normalizeOwnerType(value: unknown): "guest" | "program" | "material" {
  if (value === "program" || value === "material") return value;
  return "guest";
}

function getExtension(filename: string) {
  const match = asText(filename).toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] || "";
}

export function extractKnowledgeFileText(file?: UploadedKnowledgeFile): string {
  if (!file?.buffer?.length) return "";
  const mimetype = asText(file.mimetype).toLowerCase();
  const extension = getExtension(asText(file.originalname));
  const isText =
    TEXT_MIME_PREFIXES.some((prefix) => mimetype.startsWith(prefix)) ||
    TEXT_MIME_TYPES.has(mimetype) ||
    TEXT_EXTENSIONS.has(extension);
  if (!isText) return "";
  return file.buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
}

export function buildKnowledgeSourcePayload(input: KnowledgeSourcePayloadInput, file?: UploadedKnowledgeFile) {
  const guestId = asText(input.guestId);
  const ownerType = normalizeOwnerType(input.ownerType);
  const ownerId = asText(input.ownerId) || guestId;
  const rawText = compactText([input.rawText, extractKnowledgeFileText(file)]);
  const summary = asText(input.summary);
  const fileUrl = asText(file?.url) || asText(input.fileUrl);
  const parseStatus: KnowledgeSourceParseStatus = rawText || summary ? "ready" : "pending";
  const syncStatus: KnowledgeSourceSyncStatus = "pending";

  return {
    guestId: mongoose.Types.ObjectId.isValid(guestId) ? new mongoose.Types.ObjectId(guestId) : null,
    ownerType,
    ownerId,
    sourceKind: normalizeSourceKind(input.sourceKind, file),
    title: asText(input.title) || asText(file?.originalname) || "未命名知识库资料",
    summary,
    rawText,
    fileUrl,
    originalFileName: asText(file?.originalname),
    mimeType: asText(file?.mimetype),
    status: normalizeStatus(input.status),
    parseStatus,
    syncStatus,
    syncError: "",
  };
}

function compactText(parts: unknown[]): string {
  return parts.map(asText).filter(Boolean).join("\n").trim();
}
