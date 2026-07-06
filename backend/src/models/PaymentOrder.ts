import mongoose from "mongoose";

export type BillingPlanId = "plus" | "pro" | "monthly" | "yearly";
export type PaymentProviderId = "alipay" | "wechat";
export type PaymentOrderStatus = "pending" | "paid" | "closed" | "refunded" | "failed";

export interface PaymentOrder extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  plan: BillingPlanId;
  provider: PaymentProviderId;
  amountCents: number;
  currency: "CNY";
  subject: string;
  outTradeNo: string;
  providerTradeNo?: string;
  status: PaymentOrderStatus;
  paidAt?: Date | null;
  refundedAt?: Date | null;
  rawNotify?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const paymentOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: String, enum: ["plus", "pro", "monthly", "yearly"], required: true, index: true },
    provider: { type: String, enum: ["alipay", "wechat"], required: true, index: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, enum: ["CNY"], default: "CNY" },
    subject: { type: String, required: true },
    outTradeNo: { type: String, required: true, unique: true, index: true },
    providerTradeNo: { type: String, default: "", index: true },
    status: { type: String, enum: ["pending", "paid", "closed", "refunded", "failed"], default: "pending", index: true },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    rawNotify: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

paymentOrderSchema.index({ userId: 1, status: 1, paidAt: -1 });

const PaymentOrderModel = mongoose.model<PaymentOrder>("PaymentOrder", paymentOrderSchema);

export default PaymentOrderModel;
