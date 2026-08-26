import mongoose from "mongoose";

export type MamaResourceTaskStatus = "listed" | "paused" | "archived";

export interface MamaResourceTask extends mongoose.Document {
  title: string;
  platform: "xiaohongshu";
  category: string;
  matchCategories: string[];
  matchRiskTags: string[];
  minFollowerCount?: number | null;
  difficulty: string;
  phase: string;
  unitPriceCents: number;
  trafficFeeCents?: number | null;
  dataCycle: string;
  settlementCycle: string;
  promotionCount?: number | null;
  claimLimit?: number | null;
  latestDataDate?: Date | null;
  announcement?: string;
  settlementStandard?: string;
  requirement?: string;
  externalUrl?: string;
  feishuBackfillUrl?: string;
  exampleImageUrls: string[];
  status: MamaResourceTaskStatus;
  contentLinkPoolEnabled: boolean;
  pausedForContent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const mamaResourceTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    platform: { type: String, enum: ["xiaohongshu"], default: "xiaohongshu" },
    category: { type: String, default: "", trim: true },
    matchCategories: { type: [String], default: [] },
    matchRiskTags: { type: [String], default: [] },
    minFollowerCount: { type: Number, default: null },
    difficulty: { type: String, default: "", trim: true },
    phase: { type: String, default: "", trim: true },
    unitPriceCents: { type: Number, default: 0, min: 0 },
    trafficFeeCents: { type: Number, default: null, min: 0 },
    dataCycle: { type: String, default: "", trim: true },
    settlementCycle: { type: String, default: "", trim: true },
    promotionCount: { type: Number, default: null },
    claimLimit: { type: Number, default: null, min: 0 },
    latestDataDate: { type: Date, default: null },
    announcement: { type: String, default: "", trim: true },
    settlementStandard: { type: String, default: "", trim: true },
    requirement: { type: String, default: "", trim: true },
    externalUrl: { type: String, default: "", trim: true },
    feishuBackfillUrl: { type: String, default: "", trim: true },
    exampleImageUrls: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["listed", "paused", "archived"],
      default: "listed",
      index: true,
    },
    contentLinkPoolEnabled: { type: Boolean, default: false },
    pausedForContent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const MamaResourceTask = mongoose.model<MamaResourceTask>("MamaResourceTask", mamaResourceTaskSchema);

export default MamaResourceTask;
