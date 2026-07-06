import mongoose from "mongoose";

export type MamaResourceTaskAssignmentStatus = "assigned" | "submitted" | "collected" | "rejected";

export interface MamaResourceTaskAssignment extends mongoose.Document {
  taskId: mongoose.Types.ObjectId;
  profileId: mongoose.Types.ObjectId;
  status: MamaResourceTaskAssignmentStatus;
  proofLink?: string;
  proofScreenshotUrl?: string;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const mamaResourceTaskAssignmentSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "MamaResourceTask", required: true, index: true },
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "MamaResourceProfile", required: true, index: true },
    status: {
      type: String,
      enum: ["assigned", "submitted", "collected", "rejected"],
      default: "assigned",
      index: true,
    },
    proofLink: { type: String, default: "", trim: true },
    proofScreenshotUrl: { type: String, default: "", trim: true },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

mamaResourceTaskAssignmentSchema.index({ taskId: 1, profileId: 1 }, { unique: true });

const MamaResourceTaskAssignment = mongoose.model<MamaResourceTaskAssignment>(
  "MamaResourceTaskAssignment",
  mamaResourceTaskAssignmentSchema
);

export default MamaResourceTaskAssignment;
