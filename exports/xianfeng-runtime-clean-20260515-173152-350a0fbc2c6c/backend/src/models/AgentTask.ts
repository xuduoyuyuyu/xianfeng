import mongoose from "mongoose";

export type AgentTaskType =
  | "proofread_transcript"
  | "enrich_program_content"
  | "enrich_guest_profile"
  | "generate_program_artwork";

export type AgentTaskTargetType = "program" | "guest";

export type AgentTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface AgentTask extends mongoose.Document {
  taskType: AgentTaskType;
  targetType: AgentTaskTargetType;
  targetId: mongoose.Types.ObjectId;
  status: AgentTaskStatus;
  options?: Record<string, any>;
  retries: number;
  maxRetries: number;
  progress: number;
  stage: string;
  createdBy: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  lastError?: string;
  outputSummary?: string;
  output?: Record<string, any>;
  lockToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const agentTaskSchema = new mongoose.Schema(
  {
    taskType: {
      type: String,
      enum: ["proofread_transcript", "enrich_program_content", "enrich_guest_profile", "generate_program_artwork"],
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
    status: {
      type: String,
      enum: ["queued", "running", "succeeded", "failed", "canceled"],
      default: "queued",
      index: true,
    },
    options: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    retries: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 2 },
    progress: { type: Number, default: 0 },
    stage: { type: String, default: "queued" },
    createdBy: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    outputSummary: { type: String, default: "" },
    output: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lockToken: { type: String, default: "" },
  },
  { timestamps: true }
);

agentTaskSchema.index({ targetType: 1, targetId: 1, taskType: 1, createdAt: -1 });

const AgentTaskModel = mongoose.model<AgentTask>("AgentTask", agentTaskSchema);

export default AgentTaskModel;
