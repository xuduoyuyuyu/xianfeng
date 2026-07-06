import mongoose from "mongoose";

export type WelfareCampaignStatus = "draft" | "published" | "hidden" | "archived";

export interface WelfareCampaign extends mongoose.Document {
  title: string;
  subtitle: string;
  description: string;
  coverImageUrl: string;
  claimInstructions: string;
  externalUrl: string;
  claimButtonText: string;
  totalStock: number;
  claimedCount: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  status: WelfareCampaignStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const welfareCampaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    coverImageUrl: { type: String, default: "", trim: true },
    claimInstructions: { type: String, default: "", trim: true },
    externalUrl: { type: String, default: "", trim: true },
    claimButtonText: { type: String, default: "立即领取", trim: true },
    totalStock: { type: Number, default: 0, min: 0 },
    claimedCount: { type: Number, default: 0, min: 0 },
    startsAt: { type: Date, default: null, index: true },
    endsAt: { type: Date, default: null, index: true },
    status: {
      type: String,
      enum: ["draft", "published", "hidden", "archived"],
      default: "draft",
      index: true,
    },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

welfareCampaignSchema.index({ status: 1, sortOrder: -1, createdAt: -1 });

const WelfareCampaign = mongoose.model<WelfareCampaign>("WelfareCampaign", welfareCampaignSchema);

export default WelfareCampaign;
