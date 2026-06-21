import mongoose from "mongoose";

export type InboxSourceType = "agent_task" | "program_parse_task";
export type InboxTaskType =
  | "proofread_transcript"
  | "enrich_program_content"
  | "enrich_guest_profile"
  | "generate_program_artwork"
  | "program_parse";
export type InboxTaskStatus = "succeeded" | "failed" | "canceled";
export type InboxTargetType = "program" | "guest";

export interface AdminInboxMessage extends mongoose.Document {
  sourceType: InboxSourceType;
  sourceId: string;
  taskType: InboxTaskType;
  taskStatus: InboxTaskStatus;
  targetType: InboxTargetType;
  targetId: mongoose.Types.ObjectId;
  targetTitle: string;
  title: string;
  summary: string;
  payload: Record<string, any>;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const adminInboxMessageSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: ["agent_task", "program_parse_task"],
      required: true,
      index: true,
    },
    sourceId: {
      type: String,
      required: true,
      index: true,
    },
    taskType: {
      type: String,
      enum: ["proofread_transcript", "enrich_program_content", "enrich_guest_profile", "generate_program_artwork", "program_parse"],
      required: true,
      index: true,
    },
    taskStatus: {
      type: String,
      enum: ["succeeded", "failed", "canceled"],
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["program", "guest"],
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    targetTitle: { type: String, default: "" },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "admin_inbox_messages" }
);

adminInboxMessageSchema.index({ sourceType: 1, sourceId: 1, taskStatus: 1 }, { unique: true });
adminInboxMessageSchema.index({ createdAt: -1 });

const AdminInboxMessageModel = mongoose.model<AdminInboxMessage>("AdminInboxMessage", adminInboxMessageSchema);

export default AdminInboxMessageModel;
