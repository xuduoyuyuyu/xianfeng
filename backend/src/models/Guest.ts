import mongoose from "mongoose";

export type GuestStatus = "active" | "inactive";

export interface Guest extends mongoose.Document {
  name: string;
  normalizedName: string;
  title: string;
  bio: string;
  avatar: string;
  profileUrl?: string;
  profileMarkdown?: string;
  profileReferences?: Array<{ title?: string; url: string; note?: string }>;
  profileAvatarCandidates?: Array<{ url: string; label?: string; sourceUrl?: string }>;
  profileGeneratedAt?: Date | null;
  status: GuestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const guestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, index: true, unique: true },
    title: { type: String, default: "", trim: true },
    bio: { type: String, default: "", trim: true },
    avatar: { type: String, default: "", trim: true },
    profileUrl: { type: String, default: "", trim: true },
    profileMarkdown: { type: String, default: "", trim: true },
    profileReferences: [
      {
        title: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
        note: { type: String, default: "", trim: true },
      },
    ],
    profileAvatarCandidates: [
      {
        url: { type: String, default: "", trim: true },
        label: { type: String, default: "", trim: true },
        sourceUrl: { type: String, default: "", trim: true },
      },
    ],
    profileGeneratedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

guestSchema.index({ name: 1 });

const GuestModel = mongoose.model<Guest>("Guest", guestSchema);

export default GuestModel;
