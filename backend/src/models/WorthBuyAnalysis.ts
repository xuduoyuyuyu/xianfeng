import mongoose from "mongoose";

export interface WorthBuyAnalysis extends mongoose.Document {
  brand: string;        // 品牌名（唯一键）
  query: string;        // 用户原始输入
  submittedBy?: string; // 提交者（可选，未登录为空）
  status: "draft" | "published" | "hidden" | "deleted"; // deleted=逻辑删除，仅后台已删除视图可见
  result: {
    url?: string | null;
    brand?: string | null;
    score: number;
    isIqTax: boolean;
    reason: string;
    pros: string[];
    cons: string[];
    businessModel: string;
    commentAnalysis: string;
    recommendation: string;
    analyzedAt: string;
    priceRange?: string;
    ratingDimensions?: {
      cost: number;
      quality: number;
      safety: number;
      experience: number;
      afterSales: number;
    };
    dataPoints?: string[];
    references?: { title: string; url: string; type: string }[];
    suitableFor?: string[];
    notSuitableFor?: string[];
    alternatives?: { name: string; price: string; score: number; reason: string }[];
    buyAdvice?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const worthBuySchema = new mongoose.Schema(
  {
    brand: { type: String, required: true, unique: true, index: true, trim: true },
    query: { type: String, default: "" },
    submittedBy: { type: String, default: "" },
    status: { type: String, default: "draft", enum: ["draft", "published", "hidden", "deleted"] },
    result: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model<WorthBuyAnalysis>("WorthBuyAnalysis", worthBuySchema);
