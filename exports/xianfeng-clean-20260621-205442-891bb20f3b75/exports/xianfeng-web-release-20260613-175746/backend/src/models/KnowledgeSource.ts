import mongoose from "mongoose";

export type KnowledgeSourceKind =
  | "manual_note"
  | "uploaded_file"
  | "learning_material"
  | "external_url"
  | "guest_profile"
  | "program_content";

export type KnowledgeSourceStatus = "active" | "draft" | "archived";
export type KnowledgeSourceParseStatus = "pending" | "ready" | "failed";
export type KnowledgeSourceSyncStatus = "pending" | "synced" | "failed";

export interface KnowledgeSource extends mongoose.Document {
  guestId?: mongoose.Types.ObjectId;
  ownerType: "guest" | "program" | "material";
  ownerId: string;
  sourceKind: KnowledgeSourceKind;
  title: string;
  summary?: string;
  rawText?: string;
  fileUrl?: string;
  originalFileName?: string;
  mimeType?: string;
  status: KnowledgeSourceStatus;
  parseStatus: KnowledgeSourceParseStatus;
  syncStatus: KnowledgeSourceSyncStatus;
  syncError?: string;
  weknoraKnowledgeId?: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const knowledgeSourceSchema = new mongoose.Schema(
  {
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "Guest", index: true, default: null },
    ownerType: { type: String, enum: ["guest", "program", "material"], default: "guest", index: true },
    ownerId: { type: String, default: "", trim: true, index: true },
    sourceKind: {
      type: String,
      enum: ["manual_note", "uploaded_file", "learning_material", "external_url", "guest_profile", "program_content"],
      default: "manual_note",
      index: true,
    },
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: "", trim: true },
    rawText: { type: String, default: "", trim: true },
    fileUrl: { type: String, default: "", trim: true },
    originalFileName: { type: String, default: "", trim: true },
    mimeType: { type: String, default: "", trim: true },
    status: { type: String, enum: ["active", "draft", "archived"], default: "active", index: true },
    parseStatus: { type: String, enum: ["pending", "ready", "failed"], default: "pending", index: true },
    syncStatus: { type: String, enum: ["pending", "synced", "failed"], default: "pending", index: true },
    syncError: { type: String, default: "", trim: true },
    weknoraKnowledgeId: { type: String, default: "", trim: true },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

knowledgeSourceSchema.index({ guestId: 1, status: 1, parseStatus: 1 });
knowledgeSourceSchema.index({ ownerType: 1, ownerId: 1 });

const KnowledgeSourceModel = mongoose.model<KnowledgeSource>("KnowledgeSource", knowledgeSourceSchema);

export default KnowledgeSourceModel;
