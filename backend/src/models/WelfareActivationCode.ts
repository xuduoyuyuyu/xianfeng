import mongoose from "mongoose";

export interface WelfareActivationCode extends mongoose.Document {
  campaignId: mongoose.Types.ObjectId;
  code: string;
  importIndex: number;
  claimId?: mongoose.Types.ObjectId | null;
  claimedByUserId?: mongoose.Types.ObjectId | null;
  claimedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const welfareActivationCodeSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "WelfareCampaign", required: true, index: true },
    code: { type: String, required: true, trim: true },
    importIndex: { type: Number, required: true, min: 0 },
    claimId: { type: mongoose.Schema.Types.ObjectId, ref: "WelfareClaim", default: null, index: true },
    claimedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

welfareActivationCodeSchema.index({ campaignId: 1, code: 1 }, { unique: true });
welfareActivationCodeSchema.index({ campaignId: 1, importIndex: 1 });
welfareActivationCodeSchema.index({ campaignId: 1, claimId: 1 });

const WelfareActivationCode = mongoose.model<WelfareActivationCode>("WelfareActivationCode", welfareActivationCodeSchema);

export default WelfareActivationCode;
