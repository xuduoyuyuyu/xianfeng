import mongoose from "mongoose";

interface UserChildMemory extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  childId: string;
  enabled: boolean;
  summary: string;
  createdAt: Date;
  updatedAt: Date;
}

const userChildMemorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    childId: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    summary: { type: String, default: "" },
  },
  { timestamps: true }
);

userChildMemorySchema.index({ userId: 1, childId: 1 }, { unique: true });

const UserChildMemory = mongoose.model<UserChildMemory>("UserChildMemory", userChildMemorySchema);

export default UserChildMemory;
export { UserChildMemory };
