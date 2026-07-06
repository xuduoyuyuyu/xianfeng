import mongoose from "mongoose";

export type RefundStatus = "pending" | "succeeded" | "failed";

export interface RefundRecord extends mongoose.Document {
  orderId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  provider: "alipay" | "wechat";
  amountCents: number;
  reason: string;
  outRequestNo: string;
  providerRefundId?: string;
  status: RefundStatus;
  refundedAt?: Date | null;
  rawResult?: Record<string, any>;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refundRecordSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentOrder", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: ["alipay", "wechat"], required: true, index: true },
    amountCents: { type: Number, required: true },
    reason: { type: String, default: "按未使用点数折算退款" },
    outRequestNo: { type: String, required: true, unique: true, index: true },
    providerRefundId: { type: String, default: "" },
    status: { type: String, enum: ["pending", "succeeded", "failed"], default: "pending", index: true },
    refundedAt: { type: Date, default: null },
    rawResult: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorMessage: { type: String, default: "" },
  },
  { timestamps: true }
);

const RefundRecordModel = mongoose.model<RefundRecord>("RefundRecord", refundRecordSchema);

export default RefundRecordModel;
