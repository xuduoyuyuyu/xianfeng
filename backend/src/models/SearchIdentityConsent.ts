import mongoose from "mongoose";

export const SEARCH_IDENTITY_NOTICE_VERSION = "2026-08-23-v1";

const searchIdentityConsentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionHash: { type: String, required: true, trim: true, maxlength: 64, index: true },
    noticeVersion: { type: String, required: true, trim: true, maxlength: 40 },
    status: { type: String, enum: ["accepted", "revoked"], required: true, index: true },
    source: { type: String, enum: ["mini-program-account-link-dialog"], required: true },
    consentedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

searchIdentityConsentSchema.index({ userId: 1, sessionHash: 1, noticeVersion: 1 }, { unique: true });

const SearchIdentityConsentModel = mongoose.model("SearchIdentityConsent", searchIdentityConsentSchema);

export default SearchIdentityConsentModel;
