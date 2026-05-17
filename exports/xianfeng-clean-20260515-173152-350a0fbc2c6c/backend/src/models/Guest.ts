import mongoose from "mongoose";

export type GuestStatus = "active" | "inactive";
export type GuestContentStatus = "active" | "inactive";
export type GuestPublicationType = "paper" | "book" | "interview" | "media" | "other";

export interface GuestSocialProfile {
  platform: string;
  label: string;
  url: string;
  note?: string;
  order?: number;
  status?: GuestContentStatus;
}

export interface GuestPublication {
  type: GuestPublicationType;
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
  note?: string;
  order?: number;
  status?: GuestContentStatus;
}

export interface Guest extends mongoose.Document {
  name: string;
  normalizedName: string;
  title: string;
  bio: string;
  avatar: string;
  profileUrl?: string;
  profileMarkdown?: string;
  profileReferences?: Array<{ title?: string; url: string; note?: string }>;
  socialProfiles?: GuestSocialProfile[];
  publications?: GuestPublication[];
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
    socialProfiles: [
      {
        platform: { type: String, default: "", trim: true },
        label: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
        note: { type: String, default: "", trim: true },
        order: { type: Number, default: 0 },
        status: {
          type: String,
          enum: ["active", "inactive"],
          default: "active",
        },
      },
    ],
    publications: [
      {
        type: {
          type: String,
          enum: ["paper", "book", "interview", "media", "other"],
          default: "other",
        },
        title: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
        source: { type: String, default: "", trim: true },
        publishedAt: { type: String, default: "", trim: true },
        summary: { type: String, default: "", trim: true },
        note: { type: String, default: "", trim: true },
        order: { type: Number, default: 0 },
        status: {
          type: String,
          enum: ["active", "inactive"],
          default: "active",
        },
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
