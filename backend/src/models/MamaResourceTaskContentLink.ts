import mongoose from "mongoose";

export interface MamaResourceTaskContentLink extends mongoose.Document {
  taskId: mongoose.Types.ObjectId;
  url: string;
  importIndex: number;
  assignmentId?: mongoose.Types.ObjectId | null;
  assignedProfileId?: mongoose.Types.ObjectId | null;
  assignedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const mamaResourceTaskContentLinkSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "MamaResourceTask", required: true, index: true },
    url: { type: String, required: true, trim: true },
    importIndex: { type: Number, required: true, min: 0 },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "MamaResourceTaskAssignment", default: null, index: true },
    assignedProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "MamaResourceProfile", default: null, index: true },
    assignedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

mamaResourceTaskContentLinkSchema.index({ taskId: 1, url: 1 }, { unique: true });
mamaResourceTaskContentLinkSchema.index({ taskId: 1, importIndex: 1 });
mamaResourceTaskContentLinkSchema.index({ taskId: 1, assignmentId: 1 });

const MamaResourceTaskContentLink = mongoose.model<MamaResourceTaskContentLink>(
  "MamaResourceTaskContentLink",
  mamaResourceTaskContentLinkSchema
);

export default MamaResourceTaskContentLink;
