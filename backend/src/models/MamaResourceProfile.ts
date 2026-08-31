import mongoose from "mongoose";

export type MamaResourceStatus = "pending" | "approved" | "needs_info" | "rejected";
export type MamaResourceDataSource = "pending" | "auto" | "manual" | "screenshot";
export type MamaResourceCaptureStatus = "pending" | "captured" | "failed" | "manual_required";
export type MamaResourceMediaPlatform = "xiaohongshu" | "douyin" | "shipinhao" | "gongzhonghao" | "other";

export interface MamaResourceMediaAccount {
  platform: MamaResourceMediaPlatform;
  profileUrl: string;
  normalizedProfileUrl: string;
  nickname?: string;
  followerCount?: number | null;
  screenshotUrl?: string;
  realNameVerified?: boolean | null;
  dataSource: MamaResourceDataSource;
  lastCapturedAt?: Date | null;
}

export interface MamaResourceContentCase {
  url: string;
  title?: string;
  publishedAt?: Date | null;
  likeCount?: number;
  favoriteCount?: number;
  commentCount?: number;
  screenshotUrl?: string;
  captureStatus: MamaResourceCaptureStatus;
  lastCapturedAt?: Date | null;
}

export interface MamaResourceProfile extends mongoose.Document {
  userId?: mongoose.Types.ObjectId | null;
  displayName: string;
  contactPhone?: string;
  contactWechat: string;
  alipayAccount?: string;
  alipayVerifiedName?: string;
  city?: string;
  childStage?: string;
  childGender?: string;
  contentCapabilities: string[];
  categories: string[];
  operatorTags: string[];
  orderBlocked: boolean;
  status: MamaResourceStatus;
  accountPositioning?: string;
  consentAccepted: boolean;
  socialAccount?: MamaResourceMediaAccount & { platform: "xiaohongshu" };
  mediaAccounts: MamaResourceMediaAccount[];
  contentCases: MamaResourceContentCase[];
  rateCard: {
    rateRange?: string;
    availability?: string;
    acceptsGiftExchange?: boolean;
    blockedCategories: string[];
  };
  reviewNote: {
    note?: string;
    suitableCategories: string[];
    riskTags: string[];
    nextFollowUpAt?: Date | null;
    reviewedAt?: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const contentCaseSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    title: { type: String, default: "", trim: true },
    publishedAt: { type: Date, default: null },
    likeCount: { type: Number, default: null },
    favoriteCount: { type: Number, default: null },
    commentCount: { type: Number, default: null },
    screenshotUrl: { type: String, default: "", trim: true },
    captureStatus: {
      type: String,
      enum: ["pending", "captured", "failed", "manual_required"],
      default: "pending",
    },
    lastCapturedAt: { type: Date, default: null },
  },
  { _id: false }
);

const mediaAccountSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["xiaohongshu", "douyin", "shipinhao", "gongzhonghao", "other"],
      default: "xiaohongshu",
    },
    profileUrl: { type: String, required: true, trim: true },
    normalizedProfileUrl: { type: String, required: true, trim: true },
    nickname: { type: String, default: "", trim: true },
    followerCount: { type: Number, default: null },
    screenshotUrl: { type: String, default: "", trim: true },
    realNameVerified: { type: Boolean, default: null },
    dataSource: {
      type: String,
      enum: ["pending", "auto", "manual", "screenshot"],
      default: "pending",
    },
    lastCapturedAt: { type: Date, default: null },
  },
  { _id: false }
);

const primarySocialAccountSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: ["xiaohongshu"], default: "xiaohongshu" },
    profileUrl: { type: String, required: true, trim: true },
    normalizedProfileUrl: { type: String, required: true, trim: true, unique: true, sparse: true, index: true },
    nickname: { type: String, default: "", trim: true },
    followerCount: { type: Number, default: null },
    screenshotUrl: { type: String, default: "", trim: true },
    realNameVerified: { type: Boolean, default: null },
    dataSource: {
      type: String,
      enum: ["pending", "auto", "manual", "screenshot"],
      default: "pending",
    },
    lastCapturedAt: { type: Date, default: null },
  },
  { _id: false }
);

const mamaResourceProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    displayName: { type: String, required: true, trim: true },
    contactPhone: { type: String, default: "", trim: true },
    contactWechat: { type: String, default: "", trim: true },
    alipayAccount: { type: String, default: "", trim: true },
    alipayVerifiedName: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    childStage: { type: String, default: "", trim: true },
    childGender: { type: String, default: "", trim: true },
    contentCapabilities: { type: [String], default: [] },
    categories: { type: [String], default: [] },
    operatorTags: { type: [String], default: [] },
    orderBlocked: { type: Boolean, default: false, index: true },
    status: {
      type: String,
      enum: ["pending", "approved", "needs_info", "rejected"],
      default: "pending",
      index: true,
    },
    accountPositioning: { type: String, default: "", trim: true },
    consentAccepted: { type: Boolean, required: true },
    socialAccount: { type: primarySocialAccountSchema, default: undefined },
    mediaAccounts: { type: [mediaAccountSchema], default: [] },
    contentCases: { type: [contentCaseSchema], default: [] },
    rateCard: {
      rateRange: { type: String, default: "", trim: true },
      availability: { type: String, default: "", trim: true },
      acceptsGiftExchange: { type: Boolean, default: false },
      blockedCategories: { type: [String], default: [] },
    },
    reviewNote: {
      note: { type: String, default: "", trim: true },
      suitableCategories: { type: [String], default: [] },
      riskTags: { type: [String], default: [] },
      nextFollowUpAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

const MamaResourceProfile = mongoose.model<MamaResourceProfile>(
  "MamaResourceProfile",
  mamaResourceProfileSchema
);

export default MamaResourceProfile;
