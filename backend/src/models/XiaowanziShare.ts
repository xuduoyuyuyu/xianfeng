import mongoose from "mongoose";

export interface XiaowanziShareMessage {
  role: "user" | "assistant";
  content: string;
}

export interface XiaowanziShare extends mongoose.Document {
  title: string;
  messages: XiaowanziShareMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const xiaowanziShareMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const xiaowanziShareSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    messages: { type: [xiaowanziShareMessageSchema], default: [] },
  },
  { timestamps: true }
);

xiaowanziShareSchema.index({ createdAt: -1 });

const XiaowanziShareModel = mongoose.model<XiaowanziShare>("XiaowanziShare", xiaowanziShareSchema);

export default XiaowanziShareModel;
