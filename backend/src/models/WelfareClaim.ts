import mongoose from "mongoose";

export type WelfareClaimStatus = "claimed" | "cancelled";

export interface WelfareClaim extends mongoose.Document {
  campaignId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  activationCodeId?: mongoose.Types.ObjectId | null;
  activationCode?: string;
  status: WelfareClaimStatus;
  claimedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const welfareClaimSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "WelfareCampaign", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    activationCodeId: { type: mongoose.Schema.Types.ObjectId, ref: "WelfareActivationCode", default: null, index: true },
    activationCode: { type: String, default: "", trim: true },
    status: { type: String, enum: ["claimed", "cancelled"], default: "claimed", index: true },
    claimedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

welfareClaimSchema.index({ campaignId: 1, userId: 1 }, { unique: true });

const WelfareClaim = mongoose.model<WelfareClaim>("WelfareClaim", welfareClaimSchema);

export default WelfareClaim;
