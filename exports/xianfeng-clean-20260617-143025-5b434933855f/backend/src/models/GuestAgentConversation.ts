import mongoose from "mongoose";

const citationSchema = new mongoose.Schema(
  {
    chunkId: { type: String, default: "", trim: true },
    sourceType: { type: String, default: "", trim: true },
    sourceId: { type: String, default: "", trim: true },
    sourceTitle: { type: String, default: "", trim: true },
    locator: { type: String, default: "", trim: true },
    text: { type: String, default: "", trim: true },
    url: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, trim: true },
    citations: { type: [citationSchema], default: [] },
    model: { type: String, default: "", trim: true },
    provider: { type: String, default: "", trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

export interface GuestAgentConversation extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  guestId: mongoose.Types.ObjectId;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    citations?: any[];
    model?: string;
    provider?: string;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const guestAgentConversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "Guest", required: true, index: true },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);

guestAgentConversationSchema.index({ userId: 1, guestId: 1, updatedAt: -1 });

const GuestAgentConversationModel = mongoose.model<GuestAgentConversation>("GuestAgentConversation", guestAgentConversationSchema);

export default GuestAgentConversationModel;
