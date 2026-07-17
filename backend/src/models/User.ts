import mongoose from "mongoose";

interface User extends mongoose.Document {
  username: string;
  password: string;
  mobile?: string;
  name?: string;
  grade?: string;
  level?: number;
  xp?: number;
  streak?: number;
  avatar_initial?: string;
  avatar_image?: string;
  gender?: string;
  parentRole?: string;
  wechatMiniOpenid?: string;
  wechatUnionid?: string;
  publicUid?: string;
  role: "admin" | "user";
  proStatus?: "none" | "active" | "expired" | "refunded";
  proPlan?: "plus" | "pro" | "monthly" | "yearly" | "";
  proExpiresAt?: Date | null;
  proPurchasedAt?: Date | null;
  proRefundEligibleUntil?: Date | null;
  proLatestOrderId?: mongoose.Types.ObjectId | null;
  proPointBalance?: number;
  proFreeGrantDate?: string;
  proFreeGrantMonth?: string;
  proFreeGrantedThisMonth?: number;
  fulfilledPaymentOrderIds?: mongoose.Types.ObjectId[];
  city?: string;
  region?: string;
  childGrade?: string;
  deletionRequestedAt?: Date | null;
  deletionRestoreDeadline?: Date | null;
  deletionRestoredAt?: Date | null;
  changeHistory?: Array<{
    changedAt: Date;
    changedBy?: string;
    field: string;
    oldValue: string;
    newValue: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobile: { type: String, default: "", index: true },
    name: { type: String, default: "" },
    grade: { type: String, default: "" },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    avatar_initial: { type: String, default: "探" },
    avatar_image: { type: String, default: "" },
    gender: { type: String, default: "" },
    parentRole: { type: String, default: "" },
    wechatMiniOpenid: { type: String, default: "", index: true },
    wechatUnionid: { type: String, default: "", index: true },
    publicUid: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    proStatus: { type: String, enum: ["none", "active", "expired", "refunded"], default: "none", index: true },
    proPlan: { type: String, enum: ["plus", "pro", "monthly", "yearly", ""], default: "" },
    proExpiresAt: { type: Date, default: null, index: true },
    proPurchasedAt: { type: Date, default: null },
    proRefundEligibleUntil: { type: Date, default: null },
    proPointBalance: { type: Number, default: 0, min: 0 },
    proFreeGrantDate: { type: String, default: "" },
    proFreeGrantMonth: { type: String, default: "" },
    proFreeGrantedThisMonth: { type: Number, default: 0, min: 0 },
    proLatestOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentOrder", default: null },
    fulfilledPaymentOrderIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    childGrade: { type: String, default: "" },
    deletionRequestedAt: { type: Date, default: null, index: true },
    deletionRestoreDeadline: { type: Date, default: null },
    deletionRestoredAt: { type: Date, default: null },
    changeHistory: {
      type: [
        {
          changedAt: { type: Date, default: Date.now },
          changedBy: { type: String, default: "" },
          field: { type: String, required: true },
          oldValue: { type: String, default: "" },
          newValue: { type: String, default: "" },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const User = mongoose.model<User>("User", userSchema);

export default User;
export { User };
