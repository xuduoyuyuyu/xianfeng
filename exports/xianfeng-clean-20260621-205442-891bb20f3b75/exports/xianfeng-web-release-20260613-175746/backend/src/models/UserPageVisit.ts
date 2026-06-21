import mongoose from "mongoose";

interface UserPageVisit extends mongoose.Document {
  userId?: mongoose.Types.ObjectId | null;
  sessionId: string;
  pagePath: string;
  pageTitle: string;
  deviceType: "desktop" | "mobile" | "tablet" | "bot" | "other";
  visitedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userPageVisitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    sessionId: { type: String, required: true, trim: true, index: true },
    pagePath: { type: String, required: true, trim: true, index: true },
    pageTitle: { type: String, default: "", trim: true },
    deviceType: {
      type: String,
      enum: ["desktop", "mobile", "tablet", "bot", "other"],
      default: "other",
      index: true,
    },
    visitedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

userPageVisitSchema.index({ sessionId: 1, pagePath: 1, visitedAt: -1 });

const UserPageVisit = mongoose.model<UserPageVisit>("UserPageVisit", userPageVisitSchema);

export default UserPageVisit;
export { UserPageVisit };
